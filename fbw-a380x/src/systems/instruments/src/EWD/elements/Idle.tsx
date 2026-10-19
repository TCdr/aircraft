import { ConsumerSubject, DisplayComponent, EventBus, FSComponent, MappedSubject } from '@microsoft/msfs-sdk';
import { EwdSimvars } from '../shared/EwdSimvarPublisher';
import { isIdleIndicationShown } from './IdleIndication';

interface IdleProps {
  bus: EventBus;
  x: number;
  y: number;
}

export class Idle extends DisplayComponent<IdleProps> {
  private readonly sub = this.props.bus.getSubscriber<EwdSimvars>();

  private readonly n1 = [
    ConsumerSubject.create(this.sub.on(`n1_1`).withPrecision(1).whenChanged(), 0),
    ConsumerSubject.create(this.sub.on(`n1_2`).withPrecision(1).whenChanged(), 0),
    ConsumerSubject.create(this.sub.on(`n1_3`).withPrecision(1).whenChanged(), 0),
    ConsumerSubject.create(this.sub.on(`n1_4`).withPrecision(1).whenChanged(), 0),
  ];

  private readonly fwcFlightPhase = ConsumerSubject.create(this.sub.on('fwc_flight_phase').whenChanged(), 0);

  private readonly idleThrustLimitN1 = ConsumerSubject.create(
    this.sub.on('thrust_limit_idle').withPrecision(1).whenChanged(),
    0,
  );

  private readonly visible = MappedSubject.create(
    ([e1, e2, e3, e4, fp, idle]) => (isIdleIndicationShown([e1, e2, e3, e4], idle, fp) ? 'inherit' : 'hidden'),
    this.n1[0],
    this.n1[1],
    this.n1[2],
    this.n1[3],
    this.fwcFlightPhase,
    this.idleThrustLimitN1,
  );

  render() {
    return (
      <text x={this.props.x} y={this.props.y} class={`IdleTextPulse Green F26 Center`} visibility={this.visible}>
        IDLE
      </text>
    );
  }
}
