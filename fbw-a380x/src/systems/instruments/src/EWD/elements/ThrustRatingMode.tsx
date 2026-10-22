import { AdrBusEvents, Arinc429ConsumerSubject, ArincEventBus } from '@flybywiresim/fbw-sdk';
import { splitDecimals } from '../../MsfsAvionicsCommon/gauges';
import {
  ConsumerSubject,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { Arinc429Values } from '../shared/ArincValueProvider';
import { EwdSimvars } from '../shared/EwdSimvarPublisher';
import { createThrustParameterAirData } from './ThrustGauge';
import { thrustParameterPercent } from './ThrustParameter';
import { isFlexTemperatureShown, thrustRatingModeLabel } from './ThrustRatingLabel';

export class N1Limit extends DisplayComponent<{
  x: number;
  y: number;
  active: Subscribable<boolean>;
  hidden: Subscribable<boolean>;
  bus: ArincEventBus;
}> {
  private readonly sub = this.props.bus.getArincSubscriber<EwdSimvars & Arinc429Values>();
  private readonly N1LimitType = ConsumerSubject.create(this.sub.on('thrust_limit_type'), 0);
  private readonly N1ThrustLimit = ConsumerSubject.create(this.sub.on('thrust_limit'), 0);
  private readonly flexTemp = ConsumerSubject.create(this.sub.on('flex'), 0);
  private readonly takeoffDerate = ConsumerSubject.create(this.sub.on('takeoffDerate'), 0);
  private readonly deratedClimbLevel = ConsumerSubject.create(this.sub.on('deratedClimbLevel'), 0);
  /** CLB, MCT, FLX, TOGA, MREV, the DOx level of a derated takeoff or the DCLBx level of a derated climb (ThrustRatingLabel.ts) */
  private readonly thrustRatingLabel = MappedSubject.create(
    ([type, takeoffDerate, deratedClimbLevel]) => thrustRatingModeLabel(type, takeoffDerate, deratedClimbLevel),
    this.N1LimitType,
    this.takeoffDerate,
    this.deratedClimbLevel,
  );

  private readonly displayFlexTemp = MappedSubject.create(
    ([flexTemp, N1LimitType, takeoffDerate, active]) =>
      active && isFlexTemperatureShown(N1LimitType, flexTemp, takeoffDerate),
    this.flexTemp,
    this.N1LimitType,
    this.takeoffDerate,
    this.props.active,
  );

  private readonly cpiomBAgsDiscrete = Arinc429ConsumerSubject.create(undefined);
  private readonly thrustLimitToga = ConsumerSubject.create(this.sub.on('thrust_limit_toga').whenChanged(), 0);
  private readonly thrustLimitMax = MappedSubject.create(
    ([cpiomB, thrustLimitToga]) =>
      !cpiomB.bitValueOr(13, false) && !cpiomB.bitValueOr(14, false) ? thrustLimitToga : thrustLimitToga + 0.6,
    this.cpiomBAgsDiscrete,
    this.thrustLimitToga,
  );

  private readonly thrustLimitTHR = MappedSubject.create(
    ([n1, thrustLimitMax, airData]) =>
      Math.min(100, thrustParameterPercent(n1, thrustLimitMax, airData.mach, airData.tatDegC)),
    this.N1ThrustLimit,
    this.thrustLimitMax,
    createThrustParameterAirData(this.props.bus.getSubscriber<EwdSimvars & AdrBusEvents>()),
  );

  private readonly activeHiddenElement = this.props.active.map((v) => !v);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  render(): VNode {
    return (
      <g id="Thrust-Rating-Mode" style={{ display: this.props.hidden.map((v) => (v ? 'none' : '')) }}>
        <text
          class={{ F26: true, Center: true, Amber: true, HiddenElement: this.props.active }}
          x={this.props.x - 18}
          y={this.props.y}
        >
          XX
        </text>

        <text
          class={{ Huge: true, End: true, Cyan: true, HiddenElement: this.activeHiddenElement }}
          x={this.props.x}
          y={this.props.y}
        >
          {this.thrustRatingLabel}
        </text>
        <text
          class={{ F26: true, End: true, Green: true, Spread: true, HiddenElement: this.activeHiddenElement }}
          x={this.props.x + 69}
          y={this.props.y - 2}
        >
          {this.thrustLimitTHR.map((l) => splitDecimals(l)[0])}
        </text>
        <text
          class={{ F26: true, End: true, Green: true, HiddenElement: this.activeHiddenElement }}
          x={this.props.x + 86}
          y={this.props.y - 2}
        >
          .
        </text>
        <text
          class={{ F20: true, End: true, Green: true, HiddenElement: this.activeHiddenElement }}
          x={this.props.x + 101}
          y={this.props.y - 2}
        >
          {this.thrustLimitTHR.map((l) => splitDecimals(l)[1])}
        </text>
        <text
          class={{ F20: true, End: true, Cyan: true, HiddenElement: this.activeHiddenElement }}
          x={this.props.x + 117}
          y={this.props.y - 2}
        >
          %
        </text>

        <text
          class={{ F20: true, Cyan: true, HiddenElement: this.displayFlexTemp.map((v) => !v) }}
          x={this.props.x + 154}
          y={this.props.y}
        >
          {this.flexTemp.map((t) => Math.round(t))}
          &deg;C
        </text>
      </g>
    );
  }
}
