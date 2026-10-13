// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmgcFlightPhase } from '@shared/flightphase';

/**
 * The engine-out SID (EOSID) of the A380 FMS.
 *
 * A380 FCOM DSC-22-FMS-10-60 ENGINE-OUT SID (a380_fcom.txt l.30719-30722): "The Engine-Out Standard Instrument Departure
 * (EOSID) is a standard procedure to fly when an engine fails just after takeoff. [...] The DEPARTURE page displays the
 * ident of the EOSID, if any."; DEPARTURE page (l.34322-34326): "Indicates the Engine Out Standard Instrument Departure
 * (EOSID), associated with the selected departure runway. NONE is displayed, if no EOSID exists for the selected
 * departure runway."
 * ENGINE-OUT BEFORE THE DIVERSION POINT (l.30746-30751): "the FMS creates a temporary flight plan with the EOSID strung
 * after the diversion point. The EOSID is followed by a discontinuity."; AFTER THE DIVERSION POINT (l.30763-30765): "the
 * FMS does not create a temporary flight plan. The EOSID is indicated by a yellow line on the ND, for information only."
 * ENGINE-OUT IN TAKEOFF PHASE, BELOW THE THRUST REDUCTION ALTITUDE (l.30832-30837): "The FMS creates a temporary flight
 * plan with the EOSID if the aircraft is before the EOSID diversion point"; ABOVE THE THRUST REDUCTION ALTITUDE
 * (l.30846-30849): "The ND displays the EOSID, for information only".
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
 * reduction altitude (FCOM l.30832-30837); above it, or in later phases, the EOSID is for information only.
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
