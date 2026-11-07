// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/**
 * Where an axis of the LS scales gets its deviation from. Ils and Fls are 0 and 1 so that a Bool SimVar read as a number
 * (FLS axis active or not) is a valid source too.
 */
export enum LsSource {
  Ils = 0,
  Fls = 1,
  Gls = 2,
}

/** A boolean (FLS axis active or not) is accepted for the callers that have no GLS */
export type LsSourceInput = LsSource | boolean;

function resolveLsSource(source: LsSourceInput): LsSource {
  if (source === LsSource.Gls) {
    return LsSource.Gls;
  }
  return source ? LsSource.Fls : LsSource.Ils;
}

/**
 * The source of an axis: the GLS receiver wins over the FLS beam because the FMS clears the FLS beam while a GLS is
 * selected.
 * @param flsAxisActive the FLS beam is the source of this axis
 * @param glsSelected the own side MMR is set to a GLS channel, received or not
 */
export function lsSource(flsAxisActive: boolean, glsSelected: boolean): LsSource {
  if (glsSelected) {
    return LsSource.Gls;
  }
  return flsAxisActive ? LsSource.Fls : LsSource.Ils;
}

/**
 * Whether a LS deviation scale has a deviation to show. An axis that flies the FLS beam shows the FLS deviation, the
 * other axis keeps the ILS receiver (on a LOC approach the lateral scale stays on the real localizer).
 * @param source the source of this axis
 * @param ilsValid the ILS receiver deviation of this axis is valid
 * @param flsValid the FLS deviation of this axis is valid
 * @param glsValid the GLS deviation of this axis is valid
 */
export function isLsDeviationValid(
  source: LsSourceInput,
  ilsValid: boolean,
  flsValid: boolean,
  glsValid: boolean = false,
): boolean {
  switch (resolveLsSource(source)) {
    case LsSource.Gls:
      return !!glsValid;
    case LsSource.Fls:
      return !!flsValid;
    default:
      return !!ilsValid;
  }
}

/**
 * The deviation a LS scale shows, in degrees. All sources use the same sign and scale, so the dot scaling of the scale
 * does not change with the source.
 * @param source the source of this axis
 * @param ilsDeviation the ILS receiver deviation of this axis in degrees
 * @param flsDeviation the FLS deviation of this axis in degrees
 * @param glsDeviation the GLS deviation of this axis in degrees
 */
export function lsDeviation(
  source: LsSourceInput,
  ilsDeviation: number,
  flsDeviation: number,
  glsDeviation: number = 0,
): number {
  switch (resolveLsSource(source)) {
    case LsSource.Gls:
      return glsDeviation;
    case LsSource.Fls:
      return flsDeviation;
    default:
      return ilsDeviation;
  }
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

/** The approach capability of a GLS approach, shown in FMA column 4. There is no CAT 2 or CAT 3 on a GLS. */
export enum GlsCapability {
  None,
  /** A GLS is selected and no approach mode is armed yet: nothing to show, and no CAT word of the flight guidance */
  NotArmed,
  Cat1,
  AutoLand,
}

export interface GlsCapabilityInputs {
  /** the own side MMR is set to a GLS channel, whether or not it receives the station */
  glsSelected: boolean;
  /** LOC or G/S is armed, captured or tracked */
  approachModesArmedOrEngaged: boolean;
  /** LAND, FLARE or ROLL OUT is engaged: they replace the LOC and G/S modes */
  landModesEngaged: boolean;
  /**
   * The flight guidance reports at least CAT 2. Its equipment list (autopilot, two receivers, radio altimeter) is the
   * closest to what the GLS autoland needs, and the guidance treats the GLS words as an ILS.
   */
  flightGuidanceCat2OrBetter: boolean;
  gls1LocValid: boolean;
  gls2LocValid: boolean;
  gls1GsValid: boolean;
  gls2GsValid: boolean;
}

/**
 * The GLS capability: AUTO LAND with the capability of an autoland, CAT 1 otherwise. A CAT 2 or CAT 3 capability of the
 * flight guidance must never reach the FMA on a GLS, so the result has no such value. It holds through LAND, FLARE and
 * ROLL OUT, where the G/S receivers are not required: the G/S is invalid past the glide path intercept point by design.
 */
export function glsCapability(inputs: GlsCapabilityInputs): GlsCapability {
  if (!inputs.glsSelected) {
    return GlsCapability.None;
  }
  if (!inputs.approachModesArmedOrEngaged && !inputs.landModesEngaged) {
    return GlsCapability.NotArmed;
  }
  const bothGlsReceiversValid =
    inputs.gls1LocValid &&
    inputs.gls2LocValid &&
    (inputs.landModesEngaged || (inputs.gls1GsValid && inputs.gls2GsValid));
  return inputs.flightGuidanceCat2OrBetter && bothGlsReceiversValid ? GlsCapability.AutoLand : GlsCapability.Cat1;
}

/**
 * The LS title of the PFD: GLS on a GLS approach, FLS when the FLS beam replaces the localizer, LOC/FLS on a LOC
 * approach flown with the F-G/S beam, ILS otherwise.
 */
export function lsTitleText(
  flsLateralActive: boolean,
  flsVerticalActive: boolean,
  glsSelected: boolean = false,
): 'ILS' | 'FLS' | 'LOC/FLS' | 'GLS' {
  if (glsSelected) {
    return 'GLS';
  }
  if (flsLateralActive) {
    return 'FLS';
  }
  return flsVerticalActive ? 'LOC/FLS' : 'ILS';
}
