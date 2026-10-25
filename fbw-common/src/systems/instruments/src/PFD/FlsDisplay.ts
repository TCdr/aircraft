// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether a LS deviation scale has a deviation to show. An axis that flies the FLS beam shows the FLS deviation, the
 * other axis keeps the ILS receiver (on a LOC approach the lateral scale stays on the real localizer).
 * @param flsAxisActive the FLS beam is the source of this axis (L:A32NX_FLS_LATERAL_ACTIVE / _VERTICAL_ACTIVE)
 * @param ilsValid the ILS receiver deviation of this axis is valid
 * @param flsValid the FLS deviation of this axis is valid
 */
export function isLsDeviationValid(flsAxisActive: boolean, ilsValid: boolean, flsValid: boolean): boolean {
  return !!(flsAxisActive ? flsValid : ilsValid);
}

/**
 * The deviation a LS scale shows, in degrees. Both sources use the same sign and scale, so the dot scaling of the scale
 * does not change with the source.
 * @param flsAxisActive the FLS beam is the source of this axis
 * @param ilsDeviation the ILS receiver deviation of this axis in degrees
 * @param flsDeviation the FLS deviation of this axis in degrees
 */
export function lsDeviation(flsAxisActive: boolean, ilsDeviation: number, flsDeviation: number): number {
  return flsAxisActive ? flsDeviation : ilsDeviation;
}

/** The approach capability of an FLS approach, shown in FMA column 4 instead of CAT1 / CAT2 / CAT3 */
export enum FlsCapability {
  None,
  FApp,
  FAppRaw,
  RawOnly,
}

export interface FlsCapabilityInputs {
  /** the F-LOC beam is the lateral source (false on a LOC approach) */
  flsLateralActive: boolean;
  /** an FLS approach is selected: the F-G/S beam is the vertical source */
  flsVerticalActive: boolean;
  /** LOC or G/S is armed, captured or tracked */
  approachModesArmedOrEngaged: boolean;
  flsLocValid: boolean;
  flsGsValid: boolean;
  /** the FMS navigation is in GPS PRIMARY */
  gpsPrimary: boolean;
  /** the FMS navigation accuracy is HIGH */
  navAccuracyHigh: boolean;
  /** the NAV FM / GPS POS DISAGREE condition */
  fmGpsPositionDisagree: boolean;
}

/**
 * The FLS capability as the FG monitors it: F-APP needs GPS PRIMARY, F-APP + RAW a HIGH navigation accuracy, both with
 * valid FLS deviations. Invalid deviations or an FM / GPS position disagree downgrade it to RAW ONLY. On a LOC approach
 * the lateral deviation comes from the real localizer, so only the F-G/S deviation counts.
 * Not monitored: the ADR, IRS and GPS receiver counts of the capability table (the FBW FMS has no such inputs).
 */
export function flsCapability(inputs: FlsCapabilityInputs): FlsCapability {
  const flsApproach = inputs.flsLateralActive || inputs.flsVerticalActive;
  if (!flsApproach || !inputs.approachModesArmedOrEngaged) {
    return FlsCapability.None;
  }
  const deviationsValid = inputs.flsGsValid && (!inputs.flsLateralActive || inputs.flsLocValid);
  if (!deviationsValid || inputs.fmGpsPositionDisagree || !inputs.navAccuracyHigh) {
    return FlsCapability.RawOnly;
  }
  return inputs.gpsPrimary ? FlsCapability.FApp : FlsCapability.FAppRaw;
}

/**
 * The LS title of the PFD: FLS when the FLS beam replaces the localizer, LOC/FLS on a LOC approach flown with the
 * F-G/S beam, ILS otherwise.
 */
export function lsTitleText(flsLateralActive: boolean, flsVerticalActive: boolean): 'ILS' | 'FLS' | 'LOC/FLS' {
  if (flsLateralActive) {
    return 'FLS';
  }
  return flsVerticalActive ? 'LOC/FLS' : 'ILS';
}
