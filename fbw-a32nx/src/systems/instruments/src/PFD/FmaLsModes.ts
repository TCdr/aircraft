// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlsCapability } from '@flybywiresim/pfd';

/**
 * The FMA text of a LOC or G/S mode: the F-LOC / F-G/S variant when that axis flies the FLS beam. The guidance laws are
 * the same, only the beam source changes.
 * @param ilsText the ILS mode text, e.g. 'LOC *', 'LOC', 'G/S*', 'G/S'
 * @param flsAxisActive the FLS beam is the source of this axis
 */
export function lsModeText(ilsText: string, flsAxisActive: boolean): string {
  return flsAxisActive ? `F-${ilsText}` : ilsText;
}

/** The two lines of FMA column 4 for an FLS approach capability, empty strings for none */
export function flsCapabilityLines(capability: FlsCapability): [string, string] {
  switch (capability) {
    case FlsCapability.FApp:
      return ['F-APP', ''];
    case FlsCapability.FAppRaw:
      return ['F-APP', '+ RAW'];
    case FlsCapability.RawOnly:
      return ['RAW', 'ONLY'];
    default:
      return ['', ''];
  }
}
