// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { PaxStationInfo, SeatFlags } from '@flybywiresim/fbw-sdk-react';
import { GsxPaxCounts, gsxPaxToAnnounce } from './gsxPassengers';

/** The FMGC flight phase after landing (FmgcFlightPhase.Done) */
const FLIGHT_PHASE_DONE = 7;

/** L:FSDT_GSX_NUMPASSENGERS: the passenger number GSX uses in place of its own (GSX manual, DEVELOPERS) */
export const GSX_NUM_PASSENGERS_VAR = 'L:FSDT_GSX_NUMPASSENGERS';

/** The passengers of the seat stations: seated, or planned (the `_DESIRED` seats of the Payload page) */
function seatedPax(seatMap: PaxStationInfo[], suffix: '' | '_DESIRED'): number {
  let pax = 0;
  for (const station of seatMap) {
    const flags = SimVar.GetSimVarValue(`L:${station.simVar}${suffix}`, 'number');
    pax += new SeatFlags(Number.isFinite(flags) ? flags : 0, station.capacity).getTotalFilledSeats();
  }
  return pax;
}

/** The passengers on board and planned (the seats of the Payload page), and GSX's running counts */
export function readGsxPaxCounts(seatMap: PaxStationInfo[]): GsxPaxCounts {
  return {
    onBoard: seatedPax(seatMap, ''),
    planned: seatedPax(seatMap, '_DESIRED'),
    gsxBoarded: SimVar.GetSimVarValue('L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL', 'number') || 0,
    gsxDeboarded: SimVar.GetSimVarValue('L:FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL', 'number') || 0,
  };
}

/**
 * Gives GSX the flyPad's passenger number in L:FSDT_GSX_NUMPASSENGERS by the one rule of gsxPaxToAnnounce: the
 * planned passengers for a boarding, the passengers on board for a deboarding. Used by the Services page (while linked
 * to GSX) and the Payload page, so the two never write different numbers.
 * @param seatMap the seat stations of the aircraft (cabin config)
 * @param ready whether the page may give the number
 * @param counts the counts, when already read
 */
export function announceGsxPassengers(
  seatMap: PaxStationInfo[],
  ready: boolean,
  counts: GsxPaxCounts = readGsxPaxCounts(seatMap),
): void {
  const pax = gsxPaxToAnnounce({
    ready,
    boardingState: SimVar.GetSimVarValue('L:FSDT_GSX_BOARDING_STATE', 'number'),
    deboardingState: SimVar.GetSimVarValue('L:FSDT_GSX_DEBOARDING_STATE', 'number'),
    arrival: SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'enum') === FLIGHT_PHASE_DONE,
    counts,
    announced: SimVar.GetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number'),
  });
  if (pax !== null) {
    SimVar.SetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number', pax);
  }
}
