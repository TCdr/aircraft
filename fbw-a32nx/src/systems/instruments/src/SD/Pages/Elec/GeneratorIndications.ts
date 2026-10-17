// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * SD ELEC page GEN 1(2) indications:
 * - GEN pb-sw OFF: GEN amber, OFF white, the 1 or 2 white with the engine running and amber if not.
 * - GEN pb-sw ON: GEN 1(2) white, amber when the load, voltage or frequency is amber.
 */

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
