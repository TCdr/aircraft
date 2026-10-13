import { EventBus, SimVarPublisher, SimVarValueType } from '@microsoft/msfs-sdk';

export interface TcasSimVars {
  tcasTaOnly: boolean;
  tcasFault: boolean;
  tcasMode: number;
  /** TCAS advisory state: 0 none, 1 TA, 2 RA */
  tcasState: number;
  /** Own aircraft on ground, for the TCAS ND setting messages */
  tcasAircraftOnGround: boolean;
}

export class TcasBusPublisher extends SimVarPublisher<TcasSimVars> {
  constructor(bus: EventBus) {
    super(
      new Map([
        ['tcasTaOnly', { name: 'L:A32NX_TCAS_TA_ONLY', type: SimVarValueType.Bool }],
        ['tcasFault', { name: 'L:A32NX_TCAS_FAULT', type: SimVarValueType.Bool }],
        ['tcasMode', { name: 'L:A32NX_TCAS_MODE', type: SimVarValueType.Number }],
        ['tcasState', { name: 'L:A32NX_TCAS_STATE', type: SimVarValueType.Enum }],
        ['tcasAircraftOnGround', { name: 'SIM ON GROUND', type: SimVarValueType.Bool }],
      ]),
      bus,
    );
  }
}
