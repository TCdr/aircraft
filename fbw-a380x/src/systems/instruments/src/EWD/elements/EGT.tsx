import {
  DisplayComponent,
  Subscribable,
  VNode,
  FSComponent,
  EventBus,
  ConsumerSubject,
  Subject,
  MappedSubject,
  ClockEvents,
} from '@microsoft/msfs-sdk';
import { EwdSimvars } from '../shared/EwdSimvarPublisher';
import { GaugeComponent, GaugeMarkerComponent, GaugeMaxEGTComponent } from '../../MsfsAvionicsCommon/gauges';
import {
  EGT_RED_LINE_C,
  EgtRedLineTimer,
  ExceedanceMemory,
  displayedEgt,
  egtColour,
  egtLimit,
  egtLimitMarkVisible,
  isStartSequence,
} from './EgtLimits';

interface EGTProps {
  bus: EventBus;
  x: number;
  y: number;
  engine: number;
  active: Subscribable<boolean>;
}

export class EGT extends DisplayComponent<EGTProps> {
  private readonly sub = this.props.bus.getSubscriber<EwdSimvars & ClockEvents>();

  /** FADEC thrust limit type (NONE 0, CLB 1, MCT 2, FLEX 3, TOGA 4, REVERSE 5), see EgtLimits.ts */
  private readonly thrustLimitType = ConsumerSubject.create(this.sub.on('thrust_limit_type').whenChanged(), 0);

  private readonly egt = ConsumerSubject.create(
    this.sub.on(`egt_${this.props.engine}`).withPrecision(1).whenChanged(),
    0,
  );

  private radius = 68;
  private startAngle = 270;
  private endAngle = 90;
  private min = 0;
  /**
   * The end of the scale. Design choice: the FCOM figure (DSC-70-90 EGT INDICATIONS, PDF p.4105-4106) has a short red arc
   * at the end of the scale, above the 1 002 °C red line (a380_fcom.txt l.113199-113201); 1 100 °C gives it 16 degrees of
   * the 180 degree scale, close to the 20 degree red arc of the upstream gauge (scale end 1 000 °C).
   */
  private max = 1100;

  /** The red arc runs from the red line to the end of the scale */
  private readonly redArcStartAngle =
    this.endAngle - ((this.endAngle - this.startAngle + 360) * (this.max - EGT_RED_LINE_C)) / (this.max - this.min);

  private readonly amberVisible = this.thrustLimitType.map(egtLimitMarkVisible);

  /** The EGT offset of the stall and EGT overtemperature failures (EgtLimits displayedEgt) */
  private readonly egtOffset = ConsumerSubject.create(
    this.sub.on(`egt_offset_${this.props.engine}`).withPrecision(1).whenChanged(),
    0,
  );

  private readonly engineState = ConsumerSubject.create(
    this.sub.on(`engine_state_${this.props.engine}`).whenChanged(),
    0,
  );

  private readonly onGround = ConsumerSubject.create(this.sub.on('nose_gear_compressed_1').whenChanged(), false);

  /** The amber EGT limit: start limit on ground, relight limit in flight, normal limit otherwise (EgtLimits egtLimit) */
  private readonly egtLimit = MappedSubject.create(
    ([state, onGround]) => egtLimit(state, onGround),
    this.engineState,
    this.onGround,
  );

  // EEC trims EGT to a max value; the failure offset is added on top (EgtLimits displayedEgt)
  private readonly trimmedEGT = MappedSubject.create(
    ([egt, egtOffset, limitType, state]) => displayedEgt(egt, egtOffset, limitType, isStartSequence(state)),
    this.egt,
    this.egtOffset,
    this.thrustLimitType,
    this.engineState,
  );

  /** The needle stays on the scale; the digital value shows the EGT above its end */
  private readonly needleEgt = this.trimmedEGT.map((egt) => Math.min(egt, this.max));

  /** How long the shown EGT has been at or above the red line, for the takeoff red rule (EgtLimits isEgtRed) */
  private readonly egtRedLineTimer = new EgtRedLineTimer();

  private readonly secondsAtOrAboveRedLine = Subject.create(0);

  private lastSimTime: number | null = null;

  /** The colour of the EGT shown (as the FWS ENG EGT OVER LIMIT alert reads it, EngineParameterAlerts.ts) */
  private readonly egtColour = MappedSubject.create(
    ([egt, limitType, limit, seconds]) => egtColour(egt, limitType, limit, seconds),
    this.trimmedEGT,
    this.thrustLimitType,
    this.egtLimit,
    this.secondsAtOrAboveRedLine,
  );

  /** The red mark at the highest EGT shown above the red line (FCOM DSC-70-90 EGT EXCEEDANCE) */
  private readonly egtExceedance = new ExceedanceMemory(EGT_RED_LINE_C);

  private readonly egtExceedanceValue = Subject.create(0);

  private readonly egtExceedanceVisible = Subject.create(false);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.trimmedEGT.sub((egt) => {
      // An engine start on ground (ENGINE_STATE Starting 2 or Restarting 3) takes the red mark away.
      const state = this.engineState.get();
      // Only an EGT shown (not XX: the engine parameters are available) can latch the red mark.
      this.egtExceedance.update(egt, this.onGround.get() && (state === 2 || state === 3), this.props.active.get());
      this.egtExceedanceValue.set(this.egtExceedance.highestValue);
      this.egtExceedanceVisible.set(this.egtExceedance.exceeded);
    }, true);

    // The 20 s of the takeoff red rule run on the sim clock (ClockEvents simTime). Design choice: one step counts at most
    // 1 s, so that a jump of the sim time does not turn the EGT red at once.
    this.sub.on('simTime').handle((simTime) => {
      const deltaSeconds = this.lastSimTime === null ? 0 : Math.min(1, (simTime - this.lastSimTime) / 1000);
      this.lastSimTime = simTime;
      this.egtRedLineTimer.update(this.trimmedEGT.get(), deltaSeconds);
      this.secondsAtOrAboveRedLine.set(this.egtRedLineTimer.secondsAtOrAboveRedLine);
    });
  }

  render() {
    return (
      <>
        <g id={`EGT-indicator-${this.props.engine}`}>
          <g visibility={this.props.active.map((it) => (!it ? 'inherit' : 'hidden'))}>
            <GaugeComponent
              x={this.props.x}
              y={this.props.y}
              radius={this.radius}
              startAngle={this.startAngle}
              endAngle={this.endAngle}
              visible={Subject.create(true)}
              class="GaugeComponent WhiteLine SW2"
            />
            <text class="F26 End Amber" x={this.props.x + 17} y={this.props.y + 11.7}>
              XX
            </text>
          </g>
          <g visibility={this.props.active.map((it) => (it ? 'inherit' : 'hidden'))}>
            <text class={this.egtColour.map((col) => `Large End ${col}`)} x={this.props.x + 33} y={this.props.y + 11.7}>
              {this.trimmedEGT.map((egt) => Math.round(egt))}
            </text>
            <GaugeComponent
              x={this.props.x}
              y={this.props.y}
              radius={this.radius}
              startAngle={this.startAngle}
              endAngle={this.endAngle}
              visible={Subject.create(true)}
              class="GaugeComponent Gauge"
            >
              <GaugeComponent
                x={this.props.x}
                y={this.props.y}
                radius={this.radius - 2}
                startAngle={this.redArcStartAngle}
                endAngle={this.endAngle}
                visible={Subject.create(true)}
                class="GaugeComponent Gauge ThickRedLine"
              />
              <GaugeMarkerComponent
                value={Subject.create(this.min)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge Medium"
              />
              <GaugeMarkerComponent
                value={Subject.create(500)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge"
              />
              <GaugeMarkerComponent
                value={Subject.create(this.max)}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class="GaugeText Gauge RedLine"
              />
              <g visibility={this.amberVisible.map((it) => (it ? 'inherit' : 'hidden'))}>
                <GaugeMaxEGTComponent
                  value={this.egtLimit}
                  x={this.props.x}
                  y={this.props.y}
                  min={this.min}
                  max={this.max}
                  radius={this.radius}
                  startAngle={this.startAngle}
                  endAngle={this.endAngle}
                  class="GaugeThrustLimitIndicatorFill Gauge"
                />
              </g>
              <g visibility={this.egtExceedanceVisible.map((it) => (it ? 'inherit' : 'hidden'))}>
                <GaugeMarkerComponent
                  value={this.egtExceedanceValue.map((egt) => Math.min(egt, this.max))}
                  x={this.props.x}
                  y={this.props.y}
                  min={this.min}
                  max={this.max}
                  radius={this.radius}
                  startAngle={this.startAngle}
                  endAngle={this.endAngle}
                  class="GaugeComponent Gauge RedLine SW3"
                />
              </g>
              <rect x={this.props.x - 36} y={this.props.y - 11} width={72} height={26} class="DarkGreyBox" />
              <GaugeMarkerComponent
                value={this.needleEgt}
                x={this.props.x}
                y={this.props.y}
                min={this.min}
                max={this.max}
                radius={this.radius}
                startAngle={this.startAngle}
                endAngle={this.endAngle}
                class={this.egtColour.map((col) => `${col}GaugeIndicator Gauge`)}
                multiplierInner={0.75}
                indicator
                halfIndicator
              />
            </GaugeComponent>
          </g>
        </g>
      </>
    );
  }
}
