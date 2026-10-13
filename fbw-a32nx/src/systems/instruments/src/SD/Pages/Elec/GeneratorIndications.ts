// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * SD ELEC page GEN 1(2) indications (A320 FCOM DSC-24-20, a320_fcom.txt l.37523-37539):
 * - GEN pb-sw OFF (l.37525-37528): "GEN is amber. OFF indication is white. 1 or 2 indication is white if the associated
 *   engine is running, amber if it is not."
 * - GEN pb-sw ON (l.37530-37533): "GEN 1 or GEN 2, normally white, becomes amber if any of the following legends become
 *   amber" (load, voltage, frequency).
 */

/** The GEN legend is amber */
export function isEngineGeneratorLegendAmber(genPbOn: boolean, allParametersWithinNormalRange: boolean): boolean {
  return !genPbOn || !allParametersWithinNormalRange;
}

/** The 1 or 2 of GEN 1(2) is amber */
export function isEngineGeneratorNumberAmber(
  genPbOn: boolean,
  engineRunning: boolean,
  allParametersWithinNormalRange: boolean,
): boolean {
  if (!genPbOn) {
    return !engineRunning;
  }
  return !allParametersWithinNormalRange;
}
