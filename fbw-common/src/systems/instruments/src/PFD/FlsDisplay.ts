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

const OWN_SIDE_GLS_TOPICS = [
  { channel: 'mmr1GlsChannel', locValid: 'gls1LocValid', gsValid: 'gls1GsValid', failed: 'gls1Failed' },
  { channel: 'mmr2GlsChannel', locValid: 'gls2LocValid', gsValid: 'gls2GsValid', failed: 'gls2Failed' },
] as const;

/**
 * The simvar topics of the GLS data a PFD shows: it reads the MMR of its own side, PFD 1 the MMR 1 and PFD 2 the MMR 2,
 * so that a GLS set on one side does not show on the other side's display.
 */
export function ownSideGlsTopics(displayIndex: number) {
  return OWN_SIDE_GLS_TOPICS[displayIndex === 2 ? 1 : 0];
}

/** The approach capability of a GLS approach, shown in FMA column 4. There is no CAT 2 or CAT 3 on a GLS. */
export enum GlsCapability {
  None,
  /** A GLS is selected and the ILS CAT words would not show yet: nothing to show, not even a CAT word of the guidance */
  NotArmed,
  Cat1,
  AutoLand,
}

export interface GlsCapabilityInputs {
  /** the own side MMR is set to a GLS channel, whether or not it receives the station */
  glsSelected: boolean;
  /**
   * The condition under which the ILS CAT words show on this aircraft: LAND armed (A380X: or its APPR1 condition) or
   * active. LOC or G/S alone does not meet it, so the GLS shows no capability where an ILS would show none.
   */
  catWordsCondition: boolean;
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
  if (!inputs.catWordsCondition && !inputs.landModesEngaged) {
    return GlsCapability.NotArmed;
  }
  const bothGlsReceiversValid =
    inputs.gls1LocValid &&
    inputs.gls2LocValid &&
    (inputs.landModesEngaged || (inputs.gls1GsValid && inputs.gls2GsValid));
  return inputs.flightGuidanceCat2OrBetter && bothGlsReceiversValid ? GlsCapability.AutoLand : GlsCapability.Cat1;
}

export interface GlsFlagInputs {
  /** the LS pb of this side is on */
  lsButton: boolean;
  /** the GLS channel the own side MMR is set to, 0 for none (an MMR with a channel is in GLS mode, received or not) */
  channel: number;
  /** LOC or G/S armed or engaged, or LAND, FLARE or ROLL OUT: a GLS approach is being flown */
  approachModeArmedOrEngaged: boolean;
  /** LAND, FLARE or ROLL OUT is engaged */
  landModesEngaged: boolean;
  locValid: boolean;
  gsValid: boolean;
  /** the GLS of the own side MMR or the ground station is failed */
  glsFailed: boolean;
  /** the aircraft is on the ground */
  onGround: boolean;
}

/**
 * The GLS flag: the GLS is failed, or the LOC or the G/S signal that was received during this approach is lost. A GLS that
 * is not received yet (out of the service volume) is no loss, so each signal has to have been valid first. The G/S is not
 * required in LAND, FLARE and ROLL OUT, as it ends at the glide path intercept point by design. What was received is
 * forgotten when the approach modes drop or the GLS channel changes.
 *
 * A signal counts as received after it has been valid for a confirmation time, never on the frame of a channel change:
 * the channel and the validity are written by different systems in no fixed order, so on that frame the validity can
 * still be the one of the previous station.
 *
 * Design choice: no flag for a lost signal on the ground. ROLL OUT stays engaged during the taxi in, and the receiver
 * makes the LOC invalid far off the centreline or past the stop end, which would flash the flag on every exit.
 */
export class GlsFlagMonitor {
  /** Design choice: a signal must be valid this long to count as received, longer than any frame-order glitch */
  static readonly RECEIVED_CONFIRMATION_MS = 1000;

  private channel = 0;

  private locValidMs = 0;

  private gsValidMs = 0;

  private locWasValid = false;

  private gsWasValid = false;

  /** @returns whether the GLS flag shows */
  update(inputs: GlsFlagInputs, deltaTimeMs: number): boolean {
    const glsSelected = inputs.channel > 0;
    const channelChanged = inputs.channel !== this.channel;
    if (channelChanged || !glsSelected || !inputs.approachModeArmedOrEngaged) {
      this.locWasValid = false;
      this.gsWasValid = false;
      this.locValidMs = 0;
      this.gsValidMs = 0;
    }
    this.channel = inputs.channel;
    if (glsSelected && inputs.approachModeArmedOrEngaged && !channelChanged) {
      const elapsedMs = Math.max(0, deltaTimeMs);
      this.locValidMs = inputs.locValid ? this.locValidMs + elapsedMs : 0;
      const gsExpected = inputs.gsValid && !inputs.landModesEngaged;
      this.gsValidMs = gsExpected ? this.gsValidMs + elapsedMs : 0;
      this.locWasValid = this.locWasValid || this.locValidMs >= GlsFlagMonitor.RECEIVED_CONFIRMATION_MS;
      this.gsWasValid = this.gsWasValid || this.gsValidMs >= GlsFlagMonitor.RECEIVED_CONFIRMATION_MS;
    }

    if (!inputs.lsButton || !glsSelected) {
      return false;
    }
    if (inputs.glsFailed) {
      return true;
    }
    if (!inputs.approachModeArmedOrEngaged || inputs.onGround) {
      return false;
    }
    return (this.locWasValid && !inputs.locValid) || (this.gsWasValid && !inputs.gsValid && !inputs.landModesEngaged);
  }
}

/** The flags and titles of the LS flash for 9 s, then remain steady */
const LS_FLASH_SECONDS = 9;

/**
 * The 9 s flash of a flag or title: it starts on the rising edge of the trigger and ends when the 9 s are over or the
 * trigger drops, so that the display is steady from then on, and starts again on the next rising edge. The trigger must
 * not include what hides the element, or hiding it and showing it again would restart the flash.
 */
export class LsFlashTimer {
  private remainingSeconds = 0;

  private triggered = false;

  /**
   * @param trigger the condition whose rising edge starts the flash
   * @param deltaTimeMs the time since the last update, in milliseconds
   * @returns whether the element flashes now
   */
  update(trigger: boolean, deltaTimeMs: number): boolean {
    if (!trigger) {
      this.triggered = false;
      this.remainingSeconds = 0;
      return false;
    }
    if (!this.triggered) {
      this.remainingSeconds = LS_FLASH_SECONDS;
    }
    this.triggered = true;
    // A sim time jump backwards must not stretch the flash
    this.remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, deltaTimeMs) / 1000);
    return this.remainingSeconds > 0;
  }
}

export interface LsTitleShownInputs {
  lsButton: boolean;
  /** a localizer signal is received (ILS, FLS or GLS) */
  hasLoc: boolean;
  glsSelected: boolean;
  glsFlagShown: boolean;
}

/**
 * Whether the LS title shows. A GLS title shows with the LS pb on and the GLS selected, received or not; an ILS or FLS title
 * needs the signal. The GLS flag takes the place of the title.
 */
export function isLsTitleShown(inputs: LsTitleShownInputs): boolean {
  return inputs.lsButton && (inputs.glsSelected || inputs.hasLoc) && !inputs.glsFlagShown;
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
