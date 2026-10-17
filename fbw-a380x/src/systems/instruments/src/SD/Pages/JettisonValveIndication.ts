// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** How the SD FUEL page shows one jettison valve (its line and its JETTISON legend). */
export interface JettisonValveIndication {
  /** true when the jettison line is drawn as a fault (amber) */
  fault: boolean;
  /** CSS class of the JETTISON legend */
  textClass: 'Amber' | 'White';
}

/**
 * The jettison indication of the SD FUEL page:
 * - jettison active, the jettison valves open: normal.
 * - jettison active, but the jettison valves closed: amber (FUEL JETTISON FAULT).
 * - either jettison valve abnormally open: amber (FUEL JETTISON VLV NOT CLOSED).
 * @param valveOpen whether the jettison valve is open
 * @param jettisonInProgress whether the FQMS runs a jettison (L:A380X_FUEL_JETTISON_IN_PROGRESS)
 * @returns the line fault flag and the legend colour
 */
export function jettisonValveIndication(valveOpen: boolean, jettisonInProgress: boolean): JettisonValveIndication {
  return {
    fault: valveOpen && !jettisonInProgress,
    textClass: valveOpen !== jettisonInProgress ? 'Amber' : 'White',
  };
}
