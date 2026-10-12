// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ConsumerSubject, EventBus } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { MfdSimvars } from '../../shared/MFDSimvarPublisher';

/** The FMGC flight phase for an MFD page (L:A32NX_FMGC_FLIGHT_PHASE through the MFD simvar publisher) */
export function activeFlightPhaseSubject(bus: EventBus): ConsumerSubject<FmgcFlightPhase> {
  return ConsumerSubject.create<FmgcFlightPhase>(
    bus.getSubscriber<MfdSimvars>().on('flightPhase'),
    FmgcFlightPhase.Preflight,
  );
}
