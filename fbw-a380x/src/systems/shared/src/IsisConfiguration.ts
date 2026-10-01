// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The configuration of the two ISIS (A380 FCOM DSC-34-10-20-20-10 P 2, SFD/SND reconfiguration). The MODE pb of an ISIS
 * goes from one configuration to the next: ISIS 1 SFD and ISIS 2 SND, then ISIS 1 SND and ISIS 2 SFD, then ISIS 2 off,
 * then back to the first one. One SFD is always displayed.
 */
export enum IsisConfiguration {
  /** ISIS 1 SFD, ISIS 2 SND */
  Normal = 0,
  /** ISIS 1 SND, ISIS 2 SFD */
  Swapped = 1,
  /** ISIS 1 SFD, ISIS 2 off */
  SndOff = 2,
}

/** The configuration, written by the MODE pb of the ISIS (cockpit behaviour), back to Normal at each ISIS power-up */
export const ISIS_CONFIGURATION_VAR = 'L:A380X_ISIS_CONFIGURATION';

export type IsisUnit = 1 | 2;

export type IsisDisplay = 'SFD' | 'SND' | 'OFF';

/**
 * The display of an ISIS
 * @param unit the ISIS, 1 (upper) or 2 (lower)
 * @param configuration the configuration (an IsisConfiguration value)
 * @returns SFD, SND or OFF
 */
export function isisDisplay(unit: IsisUnit, configuration: number): IsisDisplay {
  switch (configuration) {
    case IsisConfiguration.Swapped:
      return unit === 1 ? 'SND' : 'SFD';
    case IsisConfiguration.SndOff:
      return unit === 1 ? 'SFD' : 'OFF';
    default:
      return unit === 1 ? 'SFD' : 'SND';
  }
}

/**
 * The ISIS a gauge draws on, from the Index parameter of its panel.cfg URL
 * @param url the URL of the gauge (e.g. A380X/SND/snd.html?Index=1)
 * @param defaultUnit the ISIS without an Index parameter
 * @returns 1 or 2
 */
export function isisUnitOf(url: string | null | undefined, defaultUnit: IsisUnit): IsisUnit {
  const match = /[?&]Index=(\d)/i.exec(url ?? '');
  if (!match) {
    return defaultUnit;
  }
  return match[1] === '2' ? 2 : 1;
}
