// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmgcFlightPhase } from '@shared/flightphase';

/**
 * The engine-out SID (EOSID) of the A380 FMS.
 *
 * The EOSID is the procedure to fly when an engine fails just after takeoff. The DEPARTURE page shows the EOSID of the
 * selected departure runway, or NONE when that runway has none.
 * Engine failure before the EOSID diversion point: the FMS creates a temporary flight plan with the EOSID strung after
 * the diversion point, followed by a discontinuity. After the diversion point: no temporary flight plan, the ND
 * shows the EOSID as a yellow line, for information only.
 * In the takeoff phase this applies below the thrust reduction altitude; above it, the ND shows the EOSID for
 * information only.
 * The diversion point check and the temporary flight plan are the shared FlightPlanService.tryActivateEngineOutSid.
 */

/** The EOSID ident of the DEPARTURE page: the EOSID of the selected departure runway, or NONE */
export function engineOutSidIdent(
  plan: { engineOutDepartureSegment?: { procedureIdent?: string } } | undefined,
): string {
  return plan?.engineOutDepartureSegment?.procedureIdent ?? 'NONE';
}

/**
 * Whether an engine failure makes the FMS create the EOSID temporary flight plan: in the takeoff phase, below the thrust
 * reduction altitude; above it, or in later phases, the EOSID is for information only.
 * @param flightPhase the FMS flight phase
 * @param altitude the aircraft altitude, feet
 * @param thrustReductionAltitude the thrust reduction altitude of the active flight plan, feet, or null when unknown
 */
export function engineFailureCreatesEngineOutSid(
  flightPhase: FmgcFlightPhase,
  altitude: number,
  thrustReductionAltitude: number | null,
): boolean {
  return (
    flightPhase === FmgcFlightPhase.Takeoff && thrustReductionAltitude !== null && altitude < thrustReductionAltitude
  );
}
