// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const FMGC_PHASE_DESCENT = 4;
const FMGC_PHASE_APPROACH = 5;

/**
 * The altitude the descent calculation starts from when filled from the FMS: the current level only while already
 * descending below the cruise altitude, otherwise the cruise altitude. In the climb the current level is also below
 * the cruise altitude but is not where the descent starts, so using it would shorten the T/D distance, time and fuel.
 */
export const fmsInitialAltitude = (
  currentLevel: number,
  cruiseAltitude: number | null,
  fmgcPhase: number,
): number | undefined => {
  if (cruiseAltitude === null) {
    return undefined;
  }
  const descending = fmgcPhase === FMGC_PHASE_DESCENT || fmgcPhase === FMGC_PHASE_APPROACH;
  return descending && currentLevel > 5000 && currentLevel < cruiseAltitude - 500 ? currentLevel : cruiseAltitude;
};
