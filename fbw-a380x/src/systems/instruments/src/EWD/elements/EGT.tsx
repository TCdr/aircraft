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
import { egtColour, egtLimitMarkVisible, trimmedEgt } from './EgtLimits';

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

  // EEC trims EGT to a max value
  private readonly trimmedEGT = MappedSubject.create(
    ([egt, limitType]) => trimmedEgt(egt, limitType),
    this.egt,
    this.thrustLimitType,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
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
              {this.egt.map((egt) => trimmedEgt(Math.round(egt), this.thrustLimitType.get()))}
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
