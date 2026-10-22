// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  EventBus,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { EwdSimvars } from './shared/EwdSimvarPublisher';
import { lastDigitColor, lastDigitText } from './EngineIndicationAccuracy';
import { ExceedanceMemory, N1_RED_LIMIT_PERCENT, isGroundStartSequence, n1Color } from '@shared/EngineLimits';
import {
  GaugeComponent,
  GaugeMarkerComponent,
  GaugeMaxComponent,
  ThrottlePositionDonutComponent,
  valueRadianAngleConverter,
} from '../MsfsAvionicsCommon/gauges';
import { Layer } from '../MsfsAvionicsCommon/Layer';
import { AvailIndication } from './AvailIndication';
import { RevDisplay, RevIndication } from './RevIndication';

import './style.scss';

function revClassOf(display: RevDisplay): string {
  switch (display) {
    case 'green':
      return 'Huge Center Green';
    case 'amberPulse':
      return 'Huge Center AmberTextPulse';
    default:
      return 'Huge Center Amber';
  }
}

interface AvailRevProps {
  bus: EventBus;
  engine: 1 | 2;
}
export class AvailRev extends DisplayComponent<AvailRevProps> {
  private visibility = Subject.create('hidden');

  private revClass = Subject.create('');

  private revText = Subject.create('');

  private revVisible = Subject.create('hidden');

  private availVisible = Subject.create('hidden');

  /** AVAIL steady on ground / pulsing in flight (AvailIndication.ts) */
  private availClass = Subject.create('Huge End Green');

  private readonly availIndication = new AvailIndication();

  private readonly revIndication = new RevIndication();

  private onGround = true;

  private tla = 0;

  private lastRealTime: number | null = null;

  private fadec: boolean = false;

  private n1: number = 0;

  private idleN1: number = 0;

  private reverserInTransit: boolean = false;

  private reverserDeployed: boolean = false;

  private state: number = 0;

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ClockEvents & EwdSimvars>();

    sub
      .on(`engine${this.props.engine}Fadec`)
      .whenChanged()
      .handle((f) => {
        this.fadec = f;
      });

    sub
      .on(`engine${this.props.engine}N1`)
      .whenChanged()
      .handle((n1) => {
        this.n1 = n1;
      });

    sub
      .on('idleN1')
      .whenChanged()
      .handle((n1) => {
        this.idleN1 = n1;
      });

    sub
      .on(`engine${this.props.engine}ReverserTransit`)
      .whenChanged()
      .handle((rev) => {
        this.reverserInTransit = rev;
      });

    sub
      .on(`engine${this.props.engine}ReverserDeployed`)
      .whenChanged()
      .handle((rev) => {
        this.reverserDeployed = rev;
      });

    sub
      .on(`engine${this.props.engine}State`)
      .whenChanged()
      .handle((state) => {
        this.state = state;
      });

    sub
      .on('left1LandingGear')
      .whenChanged()
      .handle((onGround) => {
        this.onGround = onGround;
      });

    sub
      .on(`engine${this.props.engine}Tla`)
      .whenChanged()
      .handle((tla) => {
        this.tla = tla;
      });

    sub.on('realTime').handle((t) => {
      const deltaS = this.lastRealTime === null ? 0 : Math.max(0, (t - this.lastRealTime) / 1000);
      this.lastRealTime = t;
      const availDisplay = this.availIndication.update(deltaS, {
        engineState: this.state,
        n1: this.n1,
        idleN1: this.idleN1,
        onGround: this.onGround,
        tlaDegrees: this.tla,
      });
      const availVisible = availDisplay !== 'hidden';
      this.availClass.set(availDisplay === 'pulse' ? 'Huge End GreenTextPulse' : 'Huge End Green');
      const revDisplay = this.revIndication.update(deltaS, {
        inTransit: this.reverserInTransit,
        deployed: this.reverserDeployed,
        onGround: this.onGround,
      });
      const revShown = revDisplay !== 'hidden';
      const isVisible = availVisible || revShown || !this.fadec;

      this.visibility.set(isVisible ? 'visible' : 'hidden');
      this.availVisible.set(availVisible ? 'visible' : 'hidden');
      this.revVisible.set((revShown && !availVisible) || !this.fadec ? 'visible' : 'hidden');
      this.revText.set(this.fadec ? 'REV' : 'XX');
      this.revClass.set(this.fadec ? revClassOf(revDisplay) : 'Huge Center Amber');
    });
  }

  render(): VNode {
    return (
      <g visibility={this.visibility}>
        <rect x={-17} y={-16} width={96} height={34} class="DarkGreyBox BackgroundFill" />
        <text class={this.revClass} visibility={this.revVisible} x={34} y={13}>
          {this.revText}
        </text>
        <text class={this.availClass} visibility={this.availVisible} x={79} y={13}>
          AVAIL
        </text>
      </g>
    );
  }
}

interface N1CommandAndTrendProps {
  bus: EventBus;
  engine: 1 | 2;
  radius: number;
  startAngle: Subscribable<number>;
  endAngle: Subscribable<number>;
  min: number;
  max: number;
  gaugeN1: Subscribable<number>;
}
export class N1CommandAndTrend extends DisplayComponent<N1CommandAndTrendProps> {
  private visible = Subject.create(false);

  private autoThrustStatus: number = 0;

  private n1Actual: number = 0;

  private n1Command: number = 0;

  private startAngle: number = 0;

  private endAngle: number = 0;

  private n1CommandGauge = Subject.create(0);

  private startAngleGauge = Subject.create(0);

  private startAngleTrend = Subject.create(0);

  private endAngleGauge = Subject.create(0);

  private endAngleTrend = Subject.create(0);

  private n1CommandStartX = Subject.create(0);

  private n1CommandStartY = Subject.create(0);

  private n1CommandEndX = Subject.create(0);

  private n1CommandEndY = Subject.create(0);

  constructor(props: N1CommandAndTrendProps) {
    super(props);

    this.startAngle = this.props.startAngle.get();
    this.endAngle = this.props.endAngle.get();
  }

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ClockEvents & EwdSimvars>();

    this.props.gaugeN1.sub((n1) => {
      this.n1Actual = n1;
    });

    sub
      .on('autoThrustStatus')
      .whenChanged()
      .handle((s) => {
        this.autoThrustStatus = s;
      });

    sub
      .on(`autoThrustCommand${this.props.engine}`)
      .whenChanged()
      .handle((n1) => {
        this.n1Command = n1;
        this.n1CommandGauge.set(n1 / 10);
      });

    sub
      .on('realTime')
      .atFrequency(10)
      .handle((_t) => {
        const isVisible = this.autoThrustStatus === 2 && Math.abs(this.n1Actual - this.n1Command / 10) > 0.3;
        this.visible.set(isVisible);
        if (isVisible) {
          const n1Command = this.n1Command / 10;
          const n1ActualXY = valueRadianAngleConverter(
            this.n1Actual,
            this.props.min,
            this.props.max,
            this.endAngle,
            this.startAngle,
            true,
          );
          const n1CommandXY = valueRadianAngleConverter(
            n1Command,
            this.props.min,
            this.props.max,
            this.endAngle,
            this.startAngle,
            true,
          );
          const n1CommandArrow = valueRadianAngleConverter(
            n1Command,
            this.props.min,
            this.props.max,
            this.endAngle,
            this.startAngle,
            false,
          );
          const n1CommandPlusArrow = valueRadianAngleConverter(
            n1Command,
            this.props.min,
            this.props.max,
            this.n1Actual > n1Command ? n1CommandXY.angle : n1CommandXY.angle + 20,
            this.n1Actual > n1Command ? n1CommandXY.angle - 24 : n1CommandXY.angle,
            false,
          );

          this.startAngleTrend.set(this.n1Actual > n1Command ? n1CommandXY.angle : n1ActualXY.angle);
          this.endAngleTrend.set(this.n1Actual > n1Command ? n1ActualXY.angle : n1CommandXY.angle);

          this.startAngleGauge.set(this.n1Actual > n1Command ? n1CommandXY.angle - 20 : n1CommandXY.angle);
          this.endAngleGauge.set(this.n1Actual > n1Command ? n1CommandXY.angle : n1CommandXY.angle + 20);

          this.n1CommandStartX.set(n1CommandArrow.x * this.props.radius * 0.5);
          this.n1CommandStartY.set(n1CommandArrow.y * this.props.radius * 0.5);

          this.n1CommandEndX.set(n1CommandPlusArrow.x * this.props.radius * 0.5);
          this.n1CommandEndY.set(n1CommandPlusArrow.y * this.props.radius * 0.5);
        }
      });
  }

  render(): VNode {
    const radiusDivide = this.props.radius / 5;
    const commandAndTrendRadius = [
      this.props.radius - radiusDivide,
      this.props.radius - 2 * radiusDivide,
      this.props.radius - 3 * radiusDivide,
      this.props.radius - 4 * radiusDivide,
    ];

    return (
      <Layer x={0} y={0} visible={this.visible}>
        <GaugeMarkerComponent
          value={this.n1CommandGauge}
          x={0}
          y={0}
          min={this.props.min}
          max={this.props.max}
          radius={this.props.radius}
          startAngle={this.props.startAngle}
          endAngle={this.props.endAngle}
          multiplierOuter={0.8}
          class="GreenLine"
          indicator
        />
        <GaugeMarkerComponent
          value={this.n1CommandGauge}
          x={0}
          y={0}
          min={this.props.min}
          max={this.props.max}
          radius={this.props.radius}
          startAngle={this.startAngleGauge}
          endAngle={this.endAngleGauge}
          multiplierOuter={0.51}
          class="GreenLine"
          indicator
        />
        <line
          x1={this.n1CommandStartX}
          y1={this.n1CommandStartY}
          x2={this.n1CommandEndX}
          y2={this.n1CommandEndY}
          class="GreenLine"
        />

        <GaugeComponent
          x={0}
          y={0}
          radius={commandAndTrendRadius[0]}
          startAngle={this.startAngleTrend}
          endAngle={this.endAngleTrend}
          class="GreenLine"
        />
        <GaugeComponent
          x={0}
          y={0}
          radius={commandAndTrendRadius[1]}
          startAngle={this.startAngleTrend}
          endAngle={this.endAngleTrend}
          class="GreenLine"
        />
        <GaugeComponent
          x={0}
          y={0}
          radius={commandAndTrendRadius[2]}
          startAngle={this.startAngleTrend}
          endAngle={this.endAngleTrend}
          class="GreenLine"
        />
        <GaugeComponent
          x={0}
          y={0}
          radius={commandAndTrendRadius[3]}
          startAngle={this.startAngleTrend}
          endAngle={this.endAngleTrend}
          class="GreenLine"
        />
      </Layer>
    );
  }
}

interface N1Props {
  bus: EventBus;
  engine: 1 | 2;
  x: number;
  y: number;
}
export class N1 extends DisplayComponent<N1Props> {
  private inactiveVisibility = Subject.create('hidden');

  private activeVisibility = Subject.create('hidden');

  private textN1Int = Subject.create('');

  private textN1Fract = Subject.create('');

  private readonly n1AccuracyDegraded = Subject.create(false);

  private readonly textN1LastDigit = MappedSubject.create(
    ([digit, degraded]) => lastDigitText(digit, degraded),
    this.textN1Fract,
    this.n1AccuracyDegraded,
  );

  private readonly gaugeStartAngle = Subject.create(220);

  /** The gauge scale in N1 % / 10 (see render) */
  private static readonly GAUGE_MIN = 1.6;

  private static readonly GAUGE_MAX = 11;

  // Angle at which the red arc begins: the N1 red limit (the LEAP-1A 101 %, see @shared/EngineLimits). The gauge sweeps
  // 210 degrees clockwise from 220 to 70 (through 360) over its scale, so 101 % N1 is at about 49.9 degrees.
  private readonly gaugeStartAngleRed = Subject.create(
    220 + ((N1_RED_LIMIT_PERCENT / 10 - N1.GAUGE_MIN) / (N1.GAUGE_MAX - N1.GAUGE_MIN)) * 210 - 360,
  );

  private readonly gaugeEndAngle = Subject.create(70);

  private gaugeN1Limit = Subject.create(0);

  private gaugeN1 = Subject.create(0);

  private throttle = Subject.create(0);

  private n1 = 0;

  private n1LimitPercent = 0;

  private engineState = 0;

  private onGround = false;

  /** The FADEC sends the engine parameters (L:A32NX_FADEC_POWERED_ENGn): the exceedance memory only latches valid values */
  private fadecPowered = false;

  /** Amber above the N1 limit, red above the red limit (see shared/EngineLimits) */
  private readonly n1Color = Subject.create('Green');

  private readonly n1IndicatorClass = Subject.create('GaugeIndicator Gauge');

  private readonly n1LastDigitClass = MappedSubject.create(
    ([color, degraded]) => `Standard End ${lastDigitColor(color, degraded)}`,
    this.n1Color,
    this.n1AccuracyDegraded,
  );

  /** The red mark at the highest N1 reached above the red limit */
  private readonly n1Exceedance = new ExceedanceMemory(N1_RED_LIMIT_PERCENT);

  private readonly n1ExceedanceValue = Subject.create(0);

  private readonly n1ExceedanceClass = Subject.create('Hide');

  private updateN1Limits(): void {
    const color = n1Color(this.n1, this.n1LimitPercent);
    this.n1Color.set(color);
    this.n1IndicatorClass.set(color === 'Green' ? 'GaugeIndicator Gauge' : `GaugeIndicator Gauge ${color}`);
    this.n1Exceedance.update(this.n1, isGroundStartSequence(this.engineState, this.onGround), this.fadecPowered);
    this.n1ExceedanceValue.set(Math.max(Math.min(this.n1Exceedance.highestValue, 110), 20) / 10);
    this.n1ExceedanceClass.set(this.n1Exceedance.exceeded ? 'GaugeExceedanceMark' : 'Hide');
  }

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<EwdSimvars>();

    sub
      .on(`engine${this.props.engine}State`)
      .whenChanged()
      .handle((state) => {
        this.engineState = state;
        this.updateN1Limits();
      });

    sub
      .on('left1LandingGear')
      .whenChanged()
      .handle((onGround) => {
        this.onGround = onGround;
        this.updateN1Limits();
      });

    sub
      .on(`engine${this.props.engine}Fadec`)
      .whenChanged()
      .handle((f) => {
        this.fadecPowered = !!f;
        this.updateN1Limits();
        this.inactiveVisibility.set(f ? 'hidden' : 'visible');
        this.activeVisibility.set(f ? 'visible' : 'hidden');
      });

    sub
      .on(`engine${this.props.engine}SensorFault`)
      .whenChanged()
      .handle((fault) => this.n1AccuracyDegraded.set(fault));

    sub
      .on(`engine${this.props.engine}N1`)
      .whenChanged()
      .handle((n1) => {
        const n1Parts = n1.toFixed(1).split('.', 2);
        this.textN1Int.set(n1Parts[0]);
        this.textN1Fract.set(n1Parts[1]);

        this.gaugeN1.set(Math.max(Math.min(n1, 110), 20) / 10);
        this.n1 = n1;
        this.updateN1Limits();
      });

    sub
      .on('autoThrustLimitToga')
      .whenChanged()
      .handle((n1) => {
        this.gaugeN1Limit.set(Math.abs(n1 / 10));
        // The N1 limit is the maximum N1 in the TO/GA detent
        this.n1LimitPercent = Math.abs(n1);
        this.updateN1Limits();
      });

    sub
      .on(`autoThrustTLA${this.props.engine}`)
      .whenChanged()
      .handle((tla) => {
        this.throttle.set(Math.max(Math.min(tla, 110), 20) / 10);
      });
  }

  render(): VNode {
    const gaugeMin = N1.GAUGE_MIN;
    const gaugeMax = N1.GAUGE_MAX;
    const gaugeRadius = 66;

    return (
      <Layer x={this.props.x} y={this.props.y}>
        <g visibility={this.inactiveVisibility}>
          <GaugeComponent
            x={0}
            y={0}
            radius={gaugeRadius}
            startAngle={this.gaugeStartAngle}
            endAngle={this.gaugeEndAngle}
            class="GaugeComponent GaugeInactive"
          />
          <AvailRev bus={this.props.bus} engine={this.props.engine} />
          <text class="Standard End Amber" x={48} y={46}>
            XX
          </text>
        </g>
        <g visibility={this.activeVisibility}>
          <text class={this.n1Color.map((color) => `Huge End ${color}`)} x={44} y={47}>
            {this.textN1Int}
          </text>
          <text class={this.n1Color.map((color) => `Large End ${color}`)} x={56} y={46}>
            .
          </text>
          <text class={this.n1LastDigitClass} x={72} y={46}>
            {this.textN1LastDigit}
          </text>

          <GaugeComponent
            x={0}
            y={0}
            radius={gaugeRadius}
            startAngle={this.gaugeStartAngle}
            endAngle={this.gaugeEndAngle}
            class="GaugeComponent Gauge"
          >
            <GaugeComponent
              x={0}
              y={0}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngleRed}
              endAngle={this.gaugeEndAngle}
              class="GaugeComponent Gauge RedLine"
            />
            <rect x={-17} y={18} width={96} height={34} class="DarkGreyBox" />

            <GaugeMarkerComponent
              x={0}
              y={0}
              value={Subject.create(2)}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge"
              multiplierInner={0.9}
            />
            <GaugeMarkerComponent
              value={Subject.create(5)}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge Medium"
              textClass="Standard"
              useCentralAlignmentBaseline={false}
              showValue
              textNudgeY={17}
              textNudgeX={8}
              multiplierInner={0.9}
            />
            <GaugeMarkerComponent
              value={Subject.create(6)}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge"
              multiplierInner={0.9}
            />
            <GaugeMarkerComponent
              value={Subject.create(7)}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge"
              multiplierInner={0.9}
            />
            <GaugeMarkerComponent
              value={Subject.create(8)}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge"
              multiplierInner={0.9}
            />
            <GaugeMarkerComponent
              value={Subject.create(9)}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge"
              multiplierInner={0.9}
            />
            <GaugeMarkerComponent
              value={Subject.create(10)}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge Medium"
              textClass="Standard"
              useCentralAlignmentBaseline={false}
              showValue
              textNudgeY={15}
              textNudgeX={-28}
              multiplierInner={0.9}
            />
            <GaugeMarkerComponent
              value={Subject.create(11)}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge RedLine"
              multiplierInner={0.9}
            />

            <GaugeMarkerComponent
              value={this.gaugeN1Limit}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeThrustLimitIndicator Gauge"
            />
            <GaugeMaxComponent
              value={this.gaugeN1Limit}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeThrustLimitIndicatorFill Gauge"
            />
            <GaugeMarkerComponent
              value={this.n1ExceedanceValue}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class={this.n1ExceedanceClass}
            />
            <GaugeMarkerComponent
              value={this.gaugeN1}
              x={0}
              y={0}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class={this.n1IndicatorClass}
              indicator
              roundLinecap
            />

            <AvailRev bus={this.props.bus} engine={this.props.engine} />

            <N1CommandAndTrend
              bus={this.props.bus}
              engine={this.props.engine}
              min={gaugeMin}
              max={gaugeMax}
              radius={gaugeRadius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              gaugeN1={this.gaugeN1}
            />
          </GaugeComponent>

          <ThrottlePositionDonutComponent
            value={this.throttle}
            x={0}
            y={0}
            min={gaugeMin}
            max={gaugeMax}
            radius={gaugeRadius * 1.03}
            startAngle={this.gaugeStartAngle}
            endAngle={this.gaugeEndAngle}
            class="DonutThrottleIndicator"
          />
        </g>
      </Layer>
    );
  }
}
