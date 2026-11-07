// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlsCapability, GlsCapability } from '@flybywiresim/pfd';

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

export interface ApproachCapabilityInputs {
  flsCapability: FlsCapability;
  glsCapability: GlsCapability;
  /** the flight guidance reports CAT2 capacity */
  land2Capacity: boolean;
  land3FailPassiveCapacity: boolean;
  land3FailOperationalCapacity: boolean;
  /** the LAND mode is armed or active */
  landModeArmedOrActive: boolean;
}

/**
 * The two lines of FMA column 4. The FLS and GLS capabilities replace the CAT words of the flight guidance, which
 * treats both as an ILS: a GLS shows AUTOLAND or CAT1, never CAT2 or CAT3.
 * @returns empty strings when nothing is shown
 */
export function approachCapabilityLines(inputs: ApproachCapabilityInputs): [string, string] {
  if (inputs.flsCapability !== FlsCapability.None) {
    return flsCapabilityLines(inputs.flsCapability);
  }
  switch (inputs.glsCapability) {
    case GlsCapability.AutoLand:
      return ['AUTOLAND', ''];
    case GlsCapability.Cat1:
      return ['CAT1', ''];
    case GlsCapability.NotArmed:
      return ['', ''];
    default:
      break;
  }
  if (inputs.land2Capacity) {
    return ['CAT2', ''];
  }
  if (inputs.land3FailPassiveCapacity) {
    return ['CAT3', 'SINGLE'];
  }
  if (inputs.land3FailOperationalCapacity) {
    return ['CAT3', 'DUAL'];
  }
  return inputs.landModeArmedOrActive ? ['CAT1', ''] : ['', ''];
}
