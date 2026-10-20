import {
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
} from '@microsoft/msfs-sdk';
import { EbhaActuatorIndication, ElecPowerSource, HydraulicPowerSource } from './ActuatorIndication';
import { HORIZONTAL_MAX_DEFLECTION, HorizontalDeflectionIndication } from './HorizontalDeflectionIndicator';
import { SDSimvars } from '../../../SDSimvarPublisher';
import { actuatorFailedTopic, isEbhaOperative, isSurfaceControlled } from './ActuatorStatus';

export enum RudderPosition {
  Upper = 'upper',
  Lower = 'lower',
}

interface RudderProps {
  x: number;
  y: number;
  position: RudderPosition;
  onGround: Subscribable<boolean>;
  bus: EventBus;
}

export class Rudder extends DisplayComponent<RudderProps> {
  private readonly deflectionInfoValid = Subject.create(true);

  private readonly rudderDeflection = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`${this.props.position}RudderDeflection`).atFrequency(10),
    0,
  );

  private readonly hydGreenAvailable = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`greenPressureSwitch`),
    false,
  );

  private readonly hydYellowAvailable = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`yellowPressureSwitch`),
    false,
  );

  private readonly elecAc1Available = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`ac1Powered`),
    false,
  );

  private readonly elecAcEhaAvailable = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`acEhaPowered`),
    false,
  );

  private readonly elecAcEssAvailable = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`acEssPowered`),
    false,
  );

  /** EBHA 1 is the top one of the rudder: YELLOW on the upper rudder, GREEN on the lower rudder */
  private readonly ebha1Failed = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(actuatorFailedTopic(`${this.props.position}Rudder`, 1)),
    false,
  );

  private readonly ebha2Failed = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(actuatorFailedTopic(`${this.props.position}Rudder`, 2)),
    false,
  );

  private readonly ebha1ElecPartFailed = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`${this.props.position}RudderActuator1ElecPartFailed`),
    false,
  );

  private readonly ebha2ElecPartFailed = ConsumerSubject.create(
    this.props.bus.getSubscriber<SDSimvars>().on(`${this.props.position}RudderActuator2ElecPartFailed`),
    false,
  );

  private readonly ebha1HydAvailable =
    this.props.position === RudderPosition.Upper ? this.hydYellowAvailable : this.hydGreenAvailable;

  private readonly ebha2HydAvailable =
    this.props.position === RudderPosition.Upper ? this.hydGreenAvailable : this.hydYellowAvailable;

  private readonly ebha2ElecAvailable =
    this.props.position === RudderPosition.Upper ? this.elecAcEhaAvailable : this.elecAc1Available;

  private readonly powerSourceAvail = MappedSubject.create(
    ([
      ebha1HydAvailable,
      ebha2HydAvailable,
      elecAcEssAvailable,
      ebha2ElecAvailable,
      ebha1Failed,
      ebha2Failed,
      ebha1ElecPartFailed,
      ebha2ElecPartFailed,
    ]) =>
      isSurfaceControlled(
        isEbhaOperative(ebha1HydAvailable, elecAcEssAvailable, ebha1Failed, ebha1ElecPartFailed),
        isEbhaOperative(ebha2HydAvailable, ebha2ElecAvailable, ebha2Failed, ebha2ElecPartFailed),
      ),
    this.ebha1HydAvailable,
    this.ebha2HydAvailable,
    this.elecAcEssAvailable,
    this.ebha2ElecAvailable,
    this.ebha1Failed,
    this.ebha2Failed,
    this.ebha1ElecPartFailed,
    this.ebha2ElecPartFailed,
  );

  render() {
    return (
      <g id={`rudder-${this.props.position}`} transform={`translate(${this.props.x} ${this.props.y})`}>
        <HorizontalDeflectionIndication
          powerAvail={this.powerSourceAvail}
          deflectionInfoValid={this.deflectionInfoValid}
          deflection={this.rudderDeflection.map((rudderDeflection) => rudderDeflection * HORIZONTAL_MAX_DEFLECTION)}
          position={this.props.position}
          onGround={this.props.onGround}
        />

        <EbhaActuatorIndication
          x={-60}
          y={this.props.position === RudderPosition.Upper ? -39 : -2}
          hydraulicPowerSource={
            this.props.position === RudderPosition.Upper ? HydraulicPowerSource.Yellow : HydraulicPowerSource.Green
          }
          elecPowerSource={ElecPowerSource.AcEss}
          hydPowerAvailable={this.ebha1HydAvailable}
          elecPowerAvailable={this.elecAcEssAvailable}
          actuatorFailed={this.ebha1Failed}
          elecPartFailed={this.ebha1ElecPartFailed}
        />
        <EbhaActuatorIndication
          x={-60}
          y={this.props.position === RudderPosition.Upper ? -8 : 30}
          hydraulicPowerSource={
            this.props.position === RudderPosition.Upper ? HydraulicPowerSource.Green : HydraulicPowerSource.Yellow
          }
          elecPowerSource={this.props.position === RudderPosition.Upper ? ElecPowerSource.AcEha : ElecPowerSource.Ac1}
          hydPowerAvailable={this.ebha2HydAvailable}
          elecPowerAvailable={this.ebha2ElecAvailable}
          actuatorFailed={this.ebha2Failed}
          elecPartFailed={this.ebha2ElecPartFailed}
        />
      </g>
    );
  }
}
