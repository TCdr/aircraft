import {
  DisplayComponent,
  Subscribable,
  VNode,
  FSComponent,
  EventBus,
  MappedSubject,
  Subject,
  ConsumerSubject,
  SubscribableMapFunctions,
  ClockEvents,
  EventSubscriber,
} from '@microsoft/msfs-sdk';
import { EwdSimvars } from '../shared/EwdSimvarPublisher';
import { Arinc429Values } from '../shared/ArincValueProvider';
import { AvailIndication } from './AvailIndication';
import { thrustParameterAirData, thrustParameterPercent } from './ThrustParameter';

import {
  GaugeComponent,
  GaugeMarkerComponent,
  GaugeThrustComponent,
  splitDecimals,
  ThrottlePositionDonutComponent,
  ThrustTransientComponent,
} from '../../MsfsAvionicsCommon/gauges';
import { AdrBusEvents, Arinc429ConsumerSubject, Arinc429LocalVarConsumerSubject } from '@flybywiresim/fbw-sdk';

interface ThrustGaugeProps {
  bus: EventBus;
  x: number;
  y: number;
  engine: number;
  active: Subscribable<boolean>;
  n1Degraded: Subscribable<boolean>;
}

const METOTS_N1_LIMIT = 76.5;

/** The Mach and TAT of the THR parameter (ThrustParameter.ts): the ADRs, else the engine sensors */
export function createThrustParameterAirData(
  sub: EventSubscriber<AdrBusEvents & EwdSimvars>,
): Subscribable<{ mach: number; tatDegC: number }> {
  return MappedSubject.create(
    ([mach1, mach2, mach3, tat1, tat2, tat3, engineMach, engineTat]) =>
      thrustParameterAirData(
        [mach1.valueOr(null), mach2.valueOr(null), mach3.valueOr(null)],
        [tat1.valueOr(null), tat2.valueOr(null), tat3.valueOr(null)],
        engineMach,
        engineTat,
      ),
    Arinc429LocalVarConsumerSubject.create(sub.on('adr_mach_1')),
    Arinc429LocalVarConsumerSubject.create(sub.on('adr_mach_2')),
    Arinc429LocalVarConsumerSubject.create(sub.on('adr_mach_3')),
    Arinc429LocalVarConsumerSubject.create(sub.on('adr_total_air_temperature_1')),
    Arinc429LocalVarConsumerSubject.create(sub.on('adr_total_air_temperature_2')),
    Arinc429LocalVarConsumerSubject.create(sub.on('adr_total_air_temperature_3')),
    ConsumerSubject.create(sub.on('engine_sensor_mach'), 0),
    ConsumerSubject.create(sub.on('engine_sensor_tat'), 15),
  );
}

export class ThrustGauge extends DisplayComponent<ThrustGaugeProps> {
  private readonly sub = this.props.bus.getSubscriber<Arinc429Values & EwdSimvars & AdrBusEvents & ClockEvents>();

  private readonly n1 = ConsumerSubject.create(
    this.sub.on(`n1_${this.props.engine}`).withPrecision(2).whenChanged(),
    0,
  );

  private readonly engineState = ConsumerSubject.create(
    this.sub.on(`engine_state_${this.props.engine}`).whenChanged(),
    0,
  );

  private readonly throttlePositionN1 = ConsumerSubject.create(
    this.sub.on(`throttle_position_n1_${this.props.engine}`).withPrecision(2).whenChanged(),
    0,
  );

  private readonly n1Commanded = ConsumerSubject.create(
    this.sub.on(`n1_commanded_${this.props.engine}`).withPrecision(2).whenChanged(),
    0,
  );

  private readonly athrEngaged = ConsumerSubject.create(
    this.sub.on('autothrustStatus').withPrecision(2).whenChanged(),
    0,
  ).map((it) => it !== 0);

  private readonly thrustLimitIdle = ConsumerSubject.create(this.sub.on('thrust_limit_idle').whenChanged(), 0);
  private readonly thrustLimitToga = ConsumerSubject.create(this.sub.on('thrust_limit_toga').whenChanged(), 0);
  private readonly thrustLimitRev = ConsumerSubject.create(this.sub.on('thrust_limit_rev').whenChanged(), 0);

  private readonly cpiomBAgsDiscrete = Arinc429ConsumerSubject.create(undefined);

  private readonly revDeploying = ConsumerSubject.create(
    this.sub.on(`reverser_deploying_${this.props.engine}`).whenChanged(),
    false,
  );
  private readonly revDeployed = ConsumerSubject.create(
    this.sub.on(`reverser_deployed_${this.props.engine}`).whenChanged(),
    false,
  );
  private readonly revSelected = ConsumerSubject.create(
    this.sub.on(`thrust_reverse_${this.props.engine}`).whenChanged(),
    false,
  );

  private readonly revVisible = MappedSubject.create(
    SubscribableMapFunctions.or(),
    this.revDeployed,
    this.revDeploying,
    this.revSelected,
  );

  private readonly thrustLimitMax = MappedSubject.create(
    ([cpiomB, thrustLimitToga]) =>
      !cpiomB.bitValueOr(13, false) && !cpiomB.bitValueOr(14, false) ? thrustLimitToga : thrustLimitToga + 0.6,
    this.cpiomBAgsDiscrete,
    this.thrustLimitToga,
  );

  private readonly airData = createThrustParameterAirData(this.sub);

  /** THR (percent) of an N1 */
  private thrOf(n1: Subscribable<number>): Subscribable<number> {
    return MappedSubject.create(
      ([value, thrustLimitMax, airData]) =>
        thrustParameterPercent(value, thrustLimitMax, airData.mach, airData.tatDegC),
      n1,
      this.thrustLimitMax,
      this.airData,
    );
  }

  private readonly idleThrustPercent = this.thrOf(this.thrustLimitIdle);

  private readonly throttleTarget = this.thrOf(this.throttlePositionN1).map((thr) => thr / 100);

  private readonly autoThrottleTarget = this.thrOf(this.n1Commanded).map((thr) => thr / 100);

  private readonly throttleTargetReverse = MappedSubject.create(
    ([throttlePositionN1, thrustLimitIdle, thrustLimitRev]) =>
      (throttlePositionN1 - thrustLimitIdle) / (-thrustLimitRev - thrustLimitIdle),
    this.throttlePositionN1,
    this.thrustLimitIdle,
    this.thrustLimitRev,
  );

  private readonly thrustPercent = this.thrOf(this.n1).map((thr) => Math.min(100, thr));

  private readonly thrustPercentReverse = MappedSubject.create(
    ([n1, thrustLimitIdle, thrustLimitRev]) =>
      Math.min(1, Math.max(0, (n1 - thrustLimitIdle) / (-thrustLimitRev - thrustLimitIdle))) * 100,
    this.n1,
    this.thrustLimitIdle,
    this.thrustLimitRev,
  );

  private thrustPercentSplit1 = this.thrustPercent.map((thr) => splitDecimals(thr)[0]);
  private thrustPercentSplit2 = this.thrustPercent.map((thr) => splitDecimals(thr)[1]);

  /** AVAIL after a start or relight: steady on ground, pulsing in flight (AvailIndication.ts, FCOM DSC-70-90) */
  private readonly availIndication = new AvailIndication();

  private readonly availVisible = Subject.create(false);

  private readonly availPulse = Subject.create(false);

  private readonly throttlePosition = ConsumerSubject.create(
    this.sub.on(`throttle_position_${this.props.engine}`).whenChanged(),
    0,
  );

  private readonly onGround = ConsumerSubject.create(this.sub.on('nose_gear_compressed_1').whenChanged(), true);

  private lastRealTime: number | null = null;

  private readonly availRevVisible = MappedSubject.create(
    SubscribableMapFunctions.or(),
    this.availVisible,
    this.revDeployed,
    this.revDeploying,
  );

  private readonly availRevText = this.availVisible.map((it) => (it ? 'AVAIL' : 'REV'));

  private readonly airspeed1 = Arinc429LocalVarConsumerSubject.create(this.sub.on('adr_computed_airspeed_1'));
  private readonly airspeed2 = Arinc429LocalVarConsumerSubject.create(this.sub.on('adr_computed_airspeed_2'));
  private readonly airspeed3 = Arinc429LocalVarConsumerSubject.create(this.sub.on('adr_computed_airspeed_3'));
  private readonly airspeed = MappedSubject.create(
    ([airspeed1, airspeed2, airspeed3]) =>
      !airspeed1.isFailureWarning()
        ? airspeed1.valueOr(0)
        : !airspeed2.isFailureWarning()
          ? airspeed2.valueOr(0)
          : airspeed3.valueOr(0),
    this.airspeed1,
    this.airspeed2,
    this.airspeed3,
  );

  // FIXME replace with actual available thrust when ACUTE is implemented
  private readonly maxThrustAvail = MappedSubject.create(
    ([cas, idleThr, metotsThr]) => (cas < 35 ? Math.max(idleThr, Math.min(100, metotsThr)) / 10 : 10),
    this.airspeed,
    this.idleThrustPercent,
    this.thrOf(Subject.create(METOTS_N1_LIMIT)),
  );

  private radius = 64;
  private startAngle = 230;
  private endAngle = 90;
  private min = 0;
  private max = 10;
  private revStartAngle = 130;
  private revEndAngle = 230;
  private revRadius = 58;
  private revMin = 0;
  private revMax = 3;

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.cpiomBAgsDiscrete.setConsumer(this.sub.on('cpiomBAgsDiscrete'));

    this.sub.on('realTime').handle((t) => {
      const deltaS = this.lastRealTime === null ? 0 : Math.max(0, (t - this.lastRealTime) / 1000);
      this.lastRealTime = t;
      const availDisplay = this.availIndication.update(deltaS, {
        engineState: this.engineState.get(),
        n1: this.n1.get(),
        idleN1: this.thrustLimitIdle.get(),
        onGround: this.onGround.get(),
        tlaDegrees: this.throttlePosition.get(),
      });
      this.availVisible.set(availDisplay !== 'hidden');
      this.availPulse.set(availDisplay === 'pulse');
    });
  }

  render() {
    return (
      <>
        <g id={`Thrust-indicator-${this.props.engine}`}>
          <g
            visibility={MappedSubject.create(
              ([a, n1d]) => (!a || n1d ? 'inherit' : 'hidden'),
              this.props.active,
              this.props.n1Degraded,
            )}
          >
            <GaugeComponent
              x={this.props.x}
              y={this.props.y + 20}
              radius={this.radius}
              startAngle={320}
              endAngle={40}
              visible={Subject.create(true)}
              largeArc={0}
              sweep={0}
              class="GaugeComponent SW2 AmberLine"
            />
            <text class="F26 End Amber Spread" x={this.props.x + 55} y={this.props.y - 48}>
              THR XX
            </text>
          </g>
          <g
            visibility={MappedSubject.create(
              ([a, n1d]) => (a && !n1d ? 'inherit' : 'hidden'),
              this.props.active,
              this.props.n1Degraded,
            )}
          >
            <g visibility={this.revVisible.map((it) => (!it ? 'inherit' : 'hidden'))}>
              <text class="F26 End Green" x={this.props.x + 48} y={this.props.y + 47}>
                {this.thrustPercentSplit1}
              </text>
              <text class="F26 End Green" x={this.props.x + 62} y={this.props.y + 47}>
                .
              </text>
              <text class="F20 End Green" x={this.props.x + 78} y={this.props.y + 47}>
                {this.thrustPercentSplit2}
              </text>
              <GaugeThrustComponent
                x={this.props.x}
                y={this.props.y}
                valueIdle={this.idleThrustPercent.map((thr) => thr / 10)}
                valueMax={this.maxThrustAvail}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                min={this.min}
                max={this.max}
                visible={MappedSubject.create(
                  ([availVis, es]) => availVis || es === 1,
                  this.availVisible,
                  this.engineState,
                )}
                class="GaugeComponent GaugeThrustFill"
              />
              <AvailRev
                x={this.props.x - 18}
                y={this.props.y - 14}
                mesg={this.availRevText}
                engineNumber={this.props.engine}
                visible={this.availRevVisible}
                revDoorOpen={this.revDeployed}
                availPulse={this.availPulse}
              />
              <ThrustTransientComponent
                x={this.props.x}
                y={this.props.y}
                min={this.min / 10}
                max={this.max / 10}
                thrustActual={this.thrustPercent.map((it) => it / 100)}
                thrustTarget={this.autoThrottleTarget}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                visible={this.athrEngaged}
                class="TransientIndicator"
              />
            </g>
            <GaugeComponent
              x={this.props.x}
              y={this.props.y}
              radius={this.radius}
              startAngle={this.startAngle}
              endAngle={this.endAngle}
              visible={Subject.create(true)}
              class="GaugeComponent Gauge"
            >
              <GaugeMarkerComponent
                value={Subject.create(0)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge"
                showValue
                textNudgeX={10}
                textNudgeY={-2}
                multiplierInner={0.9}
              />
              <GaugeMarkerComponent
                value={Subject.create(2.5)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge"
                textNudgeY={6}
                textNudgeX={13}
                multiplierInner={0.9}
              />
              <GaugeMarkerComponent
                value={Subject.create(5)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge"
                showValue
                textNudgeX={5}
                textNudgeY={15}
                multiplierInner={0.9}
              />
              <GaugeMarkerComponent
                value={Subject.create(7.5)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge"
                multiplierInner={0.9}
              />
              <GaugeMarkerComponent
                value={Subject.create(10)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge"
                showValue
                textNudgeY={7}
                textNudgeX={-27}
                multiplierInner={0.9}
              />
              <g visibility={this.revVisible.map((it) => (!it ? 'inherit' : 'hidden'))}>
                <rect x={this.props.x - 11} y={this.props.y + 21} width={96} height={30} class="DarkGreyBox" />
                <GaugeMarkerComponent
                  value={this.thrustPercent.map((it) => it / 10)}
                  x={this.props.x}
                  y={this.props.y}
                  min={this.min}
                  max={this.max}
                  radius={this.radius}
                  startAngle={this.startAngle}
                  endAngle={this.endAngle}
                  class="GaugeIndicator Gauge"
                  multiplierOuter={1.1}
                  indicator
                />
              </g>
            </GaugeComponent>
            <g visibility={this.revSelected.map((it) => (!it ? 'inherit' : 'hidden'))}>
              <ThrottlePositionDonutComponent
                value={this.throttleTarget.map((it) => it * 10)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="DonutThrottleIndicator"
              />
            </g>
            <g visibility={this.revSelected.map((it) => (it ? 'inherit' : 'hidden'))}>
              <ThrottlePositionDonutComponent
                value={this.throttleTargetReverse.map((it) => this.revMax - it * 3)}
                x={this.props.x}
                y={this.props.y}
                min={this.revMin}
                max={this.revMax}
                radius={this.revRadius}
                startAngle={this.revStartAngle}
                endAngle={this.revEndAngle}
                class="DonutThrottleIndicator"
              />
            </g>
          </g>
          <g
            visibility={MappedSubject.create(
              ([active, revVisible, n1Degraded]) => active && revVisible && !n1Degraded,
              this.props.active,
              this.revVisible,
              this.props.n1Degraded,
            ).map((it) => (it ? 'inherit' : 'hidden'))}
          >
            <GaugeThrustComponent
              x={this.props.x}
              y={this.props.y}
              valueIdle={Subject.create(0.04)}
              valueMax={Subject.create(2.6)}
              radius={this.revRadius}
              startAngle={this.revStartAngle}
              endAngle={this.revEndAngle}
              min={this.revMin}
              max={this.revMax}
              visible={MappedSubject.create(
                ([revDeploying, revDeployed, engineState]) => revDeploying || revDeployed || engineState === 1,
                this.revDeploying,
                this.revDeploying,
                this.engineState,
              )}
              class="GaugeComponent GaugeThrustFill"
              reverse
            />
            {/* reverse */}
            <GaugeComponent
              x={this.props.x}
              y={this.props.y}
              radius={this.revRadius}
              startAngle={this.revStartAngle}
              endAngle={this.revEndAngle}
              visible={Subject.create(true)}
              class="GaugeComponent Gauge"
            >
              <AvailRev
                x={this.props.x - 18}
                y={this.props.y - 14}
                mesg={this.availRevText}
                engineNumber={this.props.engine}
                visible={this.availRevVisible}
                revDoorOpen={this.revDeployed}
                availPulse={this.availPulse}
              />
              <GaugeMarkerComponent
                value={Subject.create(0)}
                x={this.props.x}
                y={this.props.y}
                min={this.revMin}
                max={this.revMax}
                radius={this.revRadius}
                startAngle={this.revStartAngle}
                endAngle={this.revEndAngle}
                class="GaugeText Gauge"
                textNudgeX={-24}
                textNudgeY={-6}
                multiplierInner={1.1}
                showValue
                overrideText="MAX"
              />
              <GaugeMarkerComponent
                value={Subject.create(this.revMax / 2)}
                x={this.props.x}
                y={this.props.y}
                min={this.revMin}
                max={this.revMax}
                radius={this.revRadius}
                startAngle={this.revStartAngle}
                endAngle={this.revEndAngle}
                class="GaugeText Gauge"
                multiplierInner={1.1}
              />
              <GaugeMarkerComponent
                value={this.thrustPercentReverse.map((thr) => this.revMax - thr * 0.03)}
                x={this.props.x}
                y={this.props.y}
                min={this.revMin}
                max={this.revMax}
                radius={this.revRadius}
                startAngle={this.revStartAngle}
                endAngle={this.revEndAngle}
                class="GaugeIndicator Gauge"
                multiplierOuter={1.1}
                indicator
              />
            </GaugeComponent>
          </g>
        </g>
      </>
    );
  }
}

interface AvailRevProps {
  x: number;
  y: number;
  mesg: Subscribable<'AVAIL' | 'REV'>;
  engineNumber: number;
  visible: Subscribable<boolean>;
  revDoorOpen: Subscribable<boolean>;
  /** AVAIL pulses after a relight in flight */
  availPulse: Subscribable<boolean>;
}

class AvailRev extends DisplayComponent<AvailRevProps> {
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  render() {
    return (
      <g visibility={this.props.visible.map((it) => (it ? 'inherit' : 'hidden'))}>
        <rect x={this.props.x - 28} y={this.props.y - 13} width={90} height={24} class="DarkGreyBox BackgroundFill" />
        <g visibility={this.props.mesg.map((mesg) => (mesg === 'REV' ? 'inherit' : 'hidden'))}>
          <text
            class={this.props.revDoorOpen.map((it) => `F26 Spread Centre ${it ? 'Green' : 'Amber'}`)}
            x={this.props.x - 25}
            y={this.props.y + 9}
          >
            {`REV ${this.props.engineNumber}`}
          </text>
        </g>
        <g visibility={this.props.mesg.map((mesg) => (mesg === 'AVAIL' ? 'inherit' : 'hidden'))}>
          <text
            class={this.props.availPulse.map((pulse) => `F26 Spread Centre ${pulse ? 'AvailTextPulse' : 'Green'}`)}
            x={this.props.x - 26}
            y={this.props.y + 9}
          >
            AVAIL
          </text>
        </g>
      </g>
    );
  }
}
