// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** FWC flight phase 7: approach (FCOM DSC-31-15 Flight Phases) */
const FWC_PHASE_APPROACH = 7;

/**
 * Whether the delta P digital value pulses. A320 FCOM DSC-21-20-40: "The digital presentation pulses if delta P > 1.5
 * PSI (resets at 1 PSI) during flight phase 7"; CRUISE page: "Pulses green when CAB delta P > 1.5 PSI before landing".
 * @param deltaPsi the cabin differential pressure in PSI
 * @param fwcFlightPhase the FWC flight phase (L:A32NX_FWC_FLIGHT_PHASE)
 * @param wasPulsing whether the value pulsed at the previous update (hysteresis)
 * @returns true when the value pulses
 */
export function deltaPPulses(deltaPsi: number, fwcFlightPhase: number, wasPulsing: boolean): boolean {
  return fwcFlightPhase === FWC_PHASE_APPROACH && deltaPsi > (wasPulsing ? 1 : 1.5);
}

/**
 * CSS class of the delta P value: amber out of the normal range (<= -0.4 PSI or >= 8.5 PSI), green otherwise.
 * @param deltaPsi the cabin differential pressure in PSI
 * @param pulsing whether the value pulses (see deltaPPulses)
 * @returns the class
 */
export function deltaPClass(deltaPsi: number, pulsing: boolean): string {
  const amber = deltaPsi >= 8.5 || deltaPsi <= -0.4;
  if (amber) {
    return pulsing ? 'AmberTextPulse' : 'Amber';
  }
  return pulsing ? 'GreenTextPulse' : 'Green';
}
