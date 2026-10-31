// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { PaxStationInfo, SeatFlags } from '@flybywiresim/fbw-sdk-react';
import {
  GSX_STATE_COMPLETED,
  GSX_STATE_PERFORMING,
  GSX_STATE_REQUESTED,
  GsxPaxCounts,
  gsxIsArrival,
  gsxPaxToAnnounce,
} from './gsxPassengers';
import { gsxTurnaround } from './gsxTurnaround';

/** The FMGC flight phase after landing (FmgcFlightPhase.Done) */
export const FLIGHT_PHASE_DONE = 7;

/**
 * Whether the turnaround is an arrival (deboarding) now, from the FMGC flight phase, the passengers on board and the
 * GSX services of this turnaround (see gsxIsArrival).
 */
export function isGsxArrival(
  flightPhase: number,
  onBoard: number,
  boardingState: number,
  deboardingState: number,
): boolean {
  return gsxIsArrival({
    flightPhaseDone: flightPhase === FLIGHT_PHASE_DONE,
    onBoard,
    deboardingActive: deboardingState === GSX_STATE_REQUESTED || deboardingState === GSX_STATE_PERFORMING,
    boardingStarted:
      boardingState === GSX_STATE_REQUESTED ||
      boardingState === GSX_STATE_PERFORMING ||
      boardingState === GSX_STATE_COMPLETED ||
      gsxTurnaround.isDone('Boarding'),
  });
}

/** L:FSDT_GSX_NUMPASSENGERS: the passenger number GSX uses in place of its own */
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
  const boardingState = SimVar.GetSimVarValue('L:FSDT_GSX_BOARDING_STATE', 'number');
  const deboardingState = SimVar.GetSimVarValue('L:FSDT_GSX_DEBOARDING_STATE', 'number');
  const flightPhase = SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'enum');
  const pax = gsxPaxToAnnounce({
    ready,
    boardingState,
    deboardingState,
    arrival: isGsxArrival(flightPhase, counts.onBoard, boardingState, deboardingState),
    counts,
    announced: SimVar.GetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number'),
  });
  if (pax !== null) {
    SimVar.SetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number', pax);
  }
}
