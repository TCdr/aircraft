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

/**
 * A380 FCOM DSC-70-90 EGT RED LINE (a380_fcom.txt l.113199-113201): "A red arc appears above the EGT red line. The EGT
 * red line is at 1 002 °C." (FBW used 900 °C, the upstream gauge value.)
 */
const EGT_RED_C = 1002;
/**
 * A380 FCOM DSC-70-90 EGT LIMIT (l.113185-113192): "The amber line indicates the maximum EGT. [...] 970 °C, during all
 * other phases." (FBW used 850 °C, the upstream gauge value.)
 */
export const EGT_LIMIT_C = 970;

/**
 * A380 FCOM DSC-70-90 EGT INDICATIONS (l.113170-113177): "The EGT indication appears in red: During takeoff, if the EGT
 * is: At or above 1 022 °C, or At or above 1 002 °C, for more than 20 s. During all other phases, if the EGT is at or
 * above 1 002 °C."
 */
export const EGT_TAKEOFF_RED_C = 1022;
export const EGT_TAKEOFF_RED_LINE_SECONDS = 20;

/**
 * A380 FCOM DSC-70-90 EGT LIMIT (a380_fcom.txt l.113189-113192): "The maximum EGT is: 745 °C, during the ground start
 * sequence; 865 °C, during engine relight in flight; 970 °C, during all other phases." The start values are the FCOM
 * ones: the FADEC start EGT model is built on them (fadec_a380x StartSequence_A380X.hpp, the hot start overshoot goes
 * "above the 745 °C start limit").
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
function isStartSequence(engineState: number): boolean {
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
 * takeoff, or When thrust reversers are selected [...]". Nor with the alpha floor protection active.
 * @param limitType the thrust limit type
 * @param alphaFloorActive the alpha floor protection is active (autothrust mode A.FLOOR)
 * @returns true when the amber limit (line and amber colour) applies
 */
export function egtLimitMarkVisible(limitType: number, alphaFloorActive: boolean): boolean {
  return (
    limitType !== ThrustLimitType.Flex &&
    limitType !== ThrustLimitType.Toga &&
    limitType !== ThrustLimitType.Reverse &&
    !alphaFloorActive
  );
}

/**
 * "During takeoff" of the EGT indications: the takeoff thrust limits FLEX and TOGA, as for "The amber indication does not
 * appear: During takeoff" (egtLimitMarkVisible). TOGA also covers the go-around.
 * @param limitType the thrust limit type
 * @returns true at FLEX or TOGA
 */
export function isTakeoffThrust(limitType: number): boolean {
  return limitType === ThrustLimitType.Flex || limitType === ThrustLimitType.Toga;
}

/**
 * The red EGT indication (a380_fcom.txt l.113170-113177): during takeoff at or above 1 022 °C, or at or above the 1 002 °C
 * red line for more than 20 s; during all other phases at or above the red line.
 * @param egt the EGT shown, in degrees Celsius
 * @param limitType the thrust limit type
 * @param secondsAtOrAboveRedLine how long the EGT has been at or above the red line (EgtRedLineTimer)
 * @returns true when the EGT indication is red
 */
export function isEgtRed(egt: number, limitType: number, secondsAtOrAboveRedLine: number): boolean {
  if (isTakeoffThrust(limitType)) {
    return egt >= EGT_TAKEOFF_RED_C || (egt >= EGT_RED_C && secondsAtOrAboveRedLine > EGT_TAKEOFF_RED_LINE_SECONDS);
  }
  return egt >= EGT_RED_C;
}

/**
 * The time the EGT has been at or above the red line without a break, for the 20 s of the takeoff red indication
 * (isEgtRed). A value that is not a finite number restarts it; a negative time step (sim time set back) adds nothing.
 */
export class EgtRedLineTimer {
  private seconds = 0;

  /**
   * @param egt the EGT shown, in degrees Celsius
   * @param deltaSeconds the time since the previous update, in seconds
   */
  update(egt: number, deltaSeconds: number): void {
    if (Number.isFinite(egt) && egt >= EGT_RED_C) {
      this.seconds += Math.max(0, deltaSeconds);
    } else {
      this.seconds = 0;
    }
  }

  get secondsAtOrAboveRedLine(): number {
    return this.seconds;
  }
}

/**
 * Colour of the EGT value and needle (A380 FCOM DSC-70-90 EGT INDICATIONS): red as isEgtRed, amber above the EGT limit
 * where the amber limit applies.
 * In alpha floor the red line applies at once, as for the ENG EGT OVER LIMIT alert (the takeoff tolerance applies to
 * the takeoff only).
 * @param egt the EGT shown, in degrees Celsius
 * @param limitType the thrust limit type
 * @param limit the EGT limit (egtLimit), the normal one by default
 * @param secondsAtOrAboveRedLine how long the EGT has been at or above the red line (EgtRedLineTimer), 0 by default
 * @param alphaFloorActive the alpha floor protection is active, false by default
 * @returns 'Red', 'Amber' or 'Green'
 */
export function egtColour(
  egt: number,
  limitType: number,
  limit = EGT_LIMIT_C,
  secondsAtOrAboveRedLine = 0,
  alphaFloorActive = false,
): 'Red' | 'Amber' | 'Green' {
  const redLineLimitType = alphaFloorActive ? ThrustLimitType.None : limitType;
  if (isEgtRed(egt, redLineLimitType, secondsAtOrAboveRedLine)) {
    return 'Red';
  }
  if (egt > limit && egtLimitMarkVisible(limitType, alphaFloorActive)) {
    return 'Amber';
  }
  return 'Green';
}

/*
 * Design choice: the EWD shows the FADEC EGT (L:A32NX_ENGINE_EGT:n) uncapped. The FADEC EGT follows its target through a
 * first-order lag (no overshoot), and the healthy target stays below the limits at the thrust limits of the flight
 * envelope. The stall and EGT overtemperature failures (a380_systems engine_malfunction.rs) add their EGT offset to the
 * FADEC EGT, so an EGT above the limits shows (A380 FCOM DSC-70-90 EGT INDICATIONS, a380_fcom.txt l.113156-113207):
 * amber above the EGT limit, red above the red line, a red mark at the highest value.
 */

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
