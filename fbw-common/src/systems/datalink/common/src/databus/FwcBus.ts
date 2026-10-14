//  Copyright (c) 2023 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

export interface FwcDataBusTypes {
  companyMessageCount: number;
  /** The flight phase of the flight warning computer (A32NX FWC) or system (A380X FWS), L:A32NX_FWC_FLIGHT_PHASE */
  fwcFlightPhase: number;
}
