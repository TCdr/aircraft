// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Thrust limit type of the FADEC (L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE, athr_thrust_limit_type in
 * A380FadecComputer_types.h). The EGT gauge used to compare the thrust lever angle in degrees with these numbers.
 */
export enum ThrustLimitType {
  None = 0,
  Clb = 1,
  Mct = 2,
  Flex = 3,
  Toga = 4,
  Reverse = 5,
}

/** EGT at which the indication turns red (FBW engine value) */
const EGT_RED_C = 900;
/** EGT limit, amber above it (FBW engine value) */
const EGT_LIMIT_C = 850;

/**
 * A380 FCOM DSC-70-90 EGT LIMIT (a380_fcom.txt l.113189-113192): "The maximum EGT is: 745 °C, during the ground start
 * sequence; 865 °C, during engine relight in flight; 970 °C, during all other phases." The start values are the FCOM
 * ones: the FADEC start EGT model is built on them (fadec_a380x StartSequence_A380X.hpp, the hot start overshoot goes
 * "above the 745 °C start limit"); the "all other phases" limit stays the FBW gauge value above.
 */
export const EGT_START_LIMIT_C = 745;
export const EGT_RELIGHT_LIMIT_C = 865;

/** L:A32NX_ENGINE_STATE values of a start sequence (fadec_a380x EngineControl_A380X.h: STARTING 2, RESTARTING 3) */
const ENGINE_STATE_STARTING = 2;
const ENGINE_STATE_RESTARTING = 3;

/**
 * @param engineState L:A32NX_ENGINE_STATE
 * @returns whether the engine is in a start sequence (start on ground or relight in flight)
 */
export function isStartSequence(engineState: number): boolean {
  return engineState === ENGINE_STATE_STARTING || engineState === ENGINE_STATE_RESTARTING;
}

/**
 * The maximum EGT of the amber line (l.113189-113192).
 * @param engineState L:A32NX_ENGINE_STATE
 * @param onGround whether the aircraft is on ground
 * @returns the EGT limit in degrees Celsius: the start limit on ground, the relight limit in flight, the normal one
 * otherwise
 */
export function egtLimit(engineState: number, onGround: boolean): number {
  if (isStartSequence(engineState)) {
    return onGround ? EGT_START_LIMIT_C : EGT_RELIGHT_LIMIT_C;
  }
  return EGT_LIMIT_C;
}

/**
 * Whether the amber EGT limit applies. A380 FCOM DSC-70-90 EGT LIMIT: "The amber indication does not appear: During
 * takeoff, or When thrust reversers are selected [...]".
 * @param limitType the thrust limit type
 * @returns true when the amber limit (line and amber colour) applies
 */
export function egtLimitMarkVisible(limitType: number): boolean {
  return (
    limitType !== ThrustLimitType.Flex && limitType !== ThrustLimitType.Toga && limitType !== ThrustLimitType.Reverse
  );
}

/**
 * Colour of the EGT value and needle: red above the red line, amber above the EGT limit (A380 FCOM DSC-70-90 EGT
 * INDICATIONS).
 * @param egt the EGT in degrees Celsius
 * @param limitType the thrust limit type
 * @param limit the EGT limit (egtLimit), the normal one by default
 * @returns 'Red', 'Amber' or 'Green'
 */
export function egtColour(egt: number, limitType: number, limit = EGT_LIMIT_C): 'Red' | 'Amber' | 'Green' {
  if (egt >= EGT_RED_C) {
    return 'Red';
  }
  if (egt > limit && egtLimitMarkVisible(limitType)) {
    return 'Amber';
  }
  return 'Green';
}

/**
 * The EEC trims the EGT to a maximum value: the red line at take-off thrust (FLEX/TOGA), the EGT limit otherwise.
 * @param egt the EGT in degrees Celsius
 * @param limitType the thrust limit type
 * @returns the trimmed EGT
 */
export function trimmedEgt(egt: number, limitType: number): number {
  return Math.min(
    limitType === ThrustLimitType.Flex || limitType === ThrustLimitType.Toga ? EGT_RED_C : EGT_LIMIT_C,
    egt,
  );
}

/*
 * Engine failures (stage B4, a380_systems engine_malfunction.rs): the stall and EGT overtemperature failures add an EGT
 * offset (L:A32NX_ENGINE_n_EGT_OFFSET) that the FADEC adds to its EGT. The EEC trim above stands for the normal EGT
 * control; the failure offset is what it cannot correct (design choice), so the gauge shows the trimmed EGT of the healthy
 * engine plus the offset, and an EGT above the limits becomes visible (A380 FCOM DSC-70-90 EGT INDICATIONS, a380_fcom.txt
 * l.113156-113207: amber above the EGT limit, red above the red line, a red mark at the highest value).
 */

/**
 * The EGT that the EWD shows.
 * Design choice: during a start sequence the EEC trim does not apply (the start fuel schedule sets the EGT), so a hot
 * start or an overshooting relight shows above its start limit (egtLimit).
 * @param egt the FADEC EGT in degrees Celsius, failure offset included
 * @param egtOffset the failure EGT offset in degrees Celsius
 * @param limitType the thrust limit type
 * @param startSequence the engine is in a start sequence (isStartSequence); false by default
 * @returns the trimmed EGT of the healthy engine plus the failure offset
 */
export function displayedEgt(egt: number, egtOffset: number, limitType: number, startSequence = false): number {
  if (startSequence) {
    return egt;
  }
  return trimmedEgt(egt - egtOffset, limitType) + egtOffset;
}

/**
 * The EGT above which ENG EGT OVER LIMIT triggers (a380_fcom.txt l.171488-171494): the red line during takeoff and
 * go-around, with the thrust reversers selected or in alpha floor, the EGT limit at or below MCT. FBW values of the gauge
 * (850 / 900 degC) in place of the GP7270 970 / 1002 degC.
 * @param limitType the thrust limit type
 * @param alphaFloor the alpha floor protection is active
 * @returns the EGT limit in degrees Celsius
 */
export function egtAlertLimit(limitType: number, alphaFloor: boolean): number {
  return egtLimitMarkVisible(limitType) && !alphaFloor ? EGT_LIMIT_C : EGT_RED_C;
}

/**
 * @param displayed the EGT shown on the EWD
 * @param limit the limit
 * @returns true when the shown EGT is above the limit
 */
export function egtExceedanceShown(displayed: number, limit: number): boolean {
  return displayed > limit;
}

/** The EGT red line of the gauge, above which the red exceedance mark appears */
export const EGT_RED_LINE_C = EGT_RED_C;

/** A380 FCOM DSC-70-90 (a380_fcom.txt l.113079, l.113301): the N1 red limit is 111 %, the N2 (FBW N3) one 118.7 % */
export const N1_RED_LIMIT_PERCENT = 111;
export const N3_RED_LIMIT_PERCENT = 118.7;

/**
 * @param n1 the N1 in percent
 * @returns true above the N1 red limit
 */
export function n1Exceeds(n1: number): boolean {
  return n1 > N1_RED_LIMIT_PERCENT;
}

/**
 * The colour of the N1 value (A380 FCOM DSC-70-90 N1 INDICATIONS, a380_fcom.txt l.113073-113079, PDF page 4103): green
 * in the normal range, red above the red limit.
 * @param n1 the N1 in percent
 * @returns the colour class
 */
export function n1Colour(n1: number): 'Red' | 'Green' {
  return n1Exceeds(n1) ? 'Red' : 'Green';
}

/**
 * @param n3 the N3 in percent
 * @returns true above the N2 (FBW N3) red limit
 */
export function n3Exceeds(n3: number): boolean {
  return n3 > N3_RED_LIMIT_PERCENT;
}

/**
 * The red exceedance mark: once the value exceeds the red line it keeps the highest value reached, until the next engine
 * start on ground (a380_fcom.txt l.113205-113207: "The red mark no longer appears after a subsequent engine start on
 * ground").
 */
export class ExceedanceMemory {
  private highest = 0;

  private exceededLimit = false;

  constructor(private readonly redLimit: number) {}

  /**
   * @param value the current value
   * @param groundStart an engine start on ground is in progress
   * @param valueValid the value is shown (the engine parameters are available, no XX). "If a parameter value ... is not
   *   available for display, XX appears, instead of the value" (a380_fcom.txt l.73512-73516): a value that is not shown,
   *   stale or not yet initialised, is no exceedance. A value that is not a finite number is not one either, and leaves
   *   the highest value as it is.
   */
  update(value: number, groundStart: boolean, valueValid: boolean): void {
    if (groundStart) {
      this.highest = 0;
      this.exceededLimit = false;
    }
    if (!valueValid || !Number.isFinite(value)) {
      return;
    }
    if (value > this.redLimit) {
      this.exceededLimit = true;
    }
    if (this.exceededLimit) {
      this.highest = Math.max(this.highest, value);
    }
  }

  get exceeded(): boolean {
    return this.exceededLimit;
  }

  get highestValue(): number {
    return this.highest;
  }
}
