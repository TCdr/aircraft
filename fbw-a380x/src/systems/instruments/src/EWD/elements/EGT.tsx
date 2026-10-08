import {
  DisplayComponent,
  Subscribable,
  VNode,
  FSComponent,
  EventBus,
  ConsumerSubject,
  Subject,
  MappedSubject,
} from '@microsoft/msfs-sdk';
import { EwdSimvars } from '../shared/EwdSimvarPublisher';
import { GaugeComponent, GaugeMarkerComponent, GaugeMaxEGTComponent } from '../../MsfsAvionicsCommon/gauges';
import { EGT_RED_LINE_C, ExceedanceMemory, displayedEgt, egtColour, egtLimitMarkVisible } from './EgtLimits';

interface EGTProps {
  bus: EventBus;
  x: number;
  y: number;
  engine: number;
  active: Subscribable<boolean>;
}

export class EGT extends DisplayComponent<EGTProps> {
  private readonly sub = this.props.bus.getSubscriber<EwdSimvars>();

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
  private max = 1000;

  private readonly amberVisible = this.thrustLimitType.map(egtLimitMarkVisible);

  private readonly egtColour = MappedSubject.create(
    ([egt, limitType]) => egtColour(egt, limitType),
    this.egt,
    this.thrustLimitType,
  );

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

  // EEC trims EGT to a max value; the failure offset is added on top (EgtLimits displayedEgt)
  private readonly trimmedEGT = MappedSubject.create(
    ([egt, egtOffset, limitType]) => displayedEgt(egt, egtOffset, limitType),
    this.egt,
    this.egtOffset,
    this.thrustLimitType,
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
      this.egtExceedance.update(egt, this.onGround.get() && (state === 2 || state === 3));
      this.egtExceedanceValue.set(this.egtExceedance.highestValue);
      this.egtExceedanceVisible.set(this.egtExceedance.exceeded);
    }, true);
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
                startAngle={this.endAngle - 20}
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
                  value={Subject.create(850)}
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
                  value={this.egtExceedanceValue}
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
                value={this.trimmedEGT}
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
