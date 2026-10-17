// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The engine limits of the EWD, also used by the FWC alert ENG 1(2) N1/N2/EGT OVER LIMIT (systems-host
 * FWC/Logic/EngineParameterAlerts) so that the alert and the gauge colours agree.
 * - EGT: the certified maximum gas temperatures of the CFM56-5B: 940 °C at takeoff thrust (TOGA, FLX), 905 °C at the
 *   continuous ratings (CLB, MCT, MREV), 725 °C otherwise (idle, cruise without a rated limit, start). No absolute red
 *   line is certified: the red limit keeps a 35 °C margin above the takeoff limit (975 °C). The amber limit mark is
 *   always drawn. Design choice (checked in the sim): these certified values rather than the 725 / 915 °C amber and
 *   950 °C red limits of the CFM56-5B cockpit display; the 1060 °C LEAP-1A maximum EGT is not used (not confirmed).
 *   A red mark keeps the highest EGT reached once the red limit is exceeded.
 * FBW models the LEAP-1A (A320-251N). Design choice: the N1 and N2 red lines are the LEAP-1A ones, 101 % N1
 * (100 % = 3851 rpm) and 116.5 % N2 (100 % = 16645 rpm), with no separate transient limit or time. The red colour, red
 * marks and red cross are those of the CFM56-5B display, whose red limits (N1 104 %, N2 105 %) would show ENG N2 OVER
 * LIMIT at every TOGA lift-off: the LEAP-1A runs above 105 % N2 at TOGA.
 * - N1: amber above the N1 limit (the TO/GA N1), red above the LEAP-1A 101 %. A red mark keeps the highest N1 reached
 *   once the red limit is exceeded. The TOGA N1 of the sim stays well below it (86-89 % in the recorded take-offs; at
 *   most about 96.5 % in the FADEC TO/GA limit tables, hot and high).
 * - N2: red above the LEAP-1A 116.5 %, with a red cross that stays. It is also the N2 of the fuel flow protection of
 *   the sim engine (engines.cfg max_n2_protection = 116.5).
 * The red marks and the red cross go away at the next engine start sequence on ground.
 */

export const EGT_TAKEOFF_LIMIT_DEGREES = 940;
export const EGT_CONTINUOUS_LIMIT_DEGREES = 905;
export const EGT_START_LIMIT_DEGREES = 725;
export const EGT_RED_LIMIT_DEGREES = EGT_TAKEOFF_LIMIT_DEGREES + 35;
/** The LEAP-1A N1 red line (see above): the red N1, red arc and red mark of the EWD and the N1 limit of the FWC alert */
export const N1_RED_LIMIT_PERCENT = 101;
/** The LEAP-1A N2 red line (see above): the red N2 and red cross of the EWD and the N2 limit of the FWC alert */
export const N2_RED_LIMIT_PERCENT = 116.5;

export type LimitColor = 'Green' | 'Amber' | 'Red';

/** The thrust limit types of L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE */
export enum ThrustLimitType {
  None = 0,
  Clb = 1,
  Mct = 2,
  Flex = 3,
  Toga = 4,
  Mrev = 5,
}

/** The amber EGT limit of the thrust limit type (certified values, see above) */
export function egtAmberLimit(thrustLimitType: number): number {
  switch (thrustLimitType) {
    // TOGA, and FLX (a de-rated take-off, certified under the same take-off rating)
    case ThrustLimitType.Toga:
    case ThrustLimitType.Flex:
      return EGT_TAKEOFF_LIMIT_DEGREES;
    // CLB, MCT, MREV (continuous-type ratings)
    case ThrustLimitType.Clb:
    case ThrustLimitType.Mct:
    case ThrustLimitType.Mrev:
      return EGT_CONTINUOUS_LIMIT_DEGREES;
    // Idle, cruise, and engine start - no rated thrust limit active
    default:
      return EGT_START_LIMIT_DEGREES;
  }
}

/** Amber above the amber EGT limit, red above the red limit */
export function egtColor(egt: number, amberLimit: number): LimitColor {
  if (egt > EGT_RED_LIMIT_DEGREES) {
    return 'Red';
  }
  return egt > amberLimit ? 'Amber' : 'Green';
}

/**
 * Design choice: the N1 turns amber 0.5 % above the N1 limit, so that the small overshoot of the thrust control loop at
 * TOGA does not flash the N1 amber at every takeoff.
 */
export const N1_LIMIT_AMBER_MARGIN_PERCENT = 0.5;

/** Amber above the N1 limit, red above the N1 red limit */
export function n1Color(n1: number, n1Limit: number): LimitColor {
  if (n1 > N1_RED_LIMIT_PERCENT) {
    return 'Red';
  }
  return n1Limit > 0 && n1 > n1Limit + N1_LIMIT_AMBER_MARGIN_PERCENT ? 'Amber' : 'Green';
}

/** Red above the N2 red limit */
export function n2Color(n2: number): LimitColor {
  return n2 > N2_RED_LIMIT_PERCENT ? 'Red' : 'Green';
}

/**
 * The exceedance memory of a parameter: once the value exceeds the red limit it keeps the highest value reached, until the
 * next engine start sequence on ground (the EGT and N1 red marks, the N2 red cross).
 */
export class ExceedanceMemory {
  private highest = 0;

  private exceededLimit = false;

  constructor(private readonly redLimit: number) {}

  /**
   * @param groundStartSequence an engine start sequence on ground is in progress: clears the memory
   * @param valueValid the FADEC sends the parameter (L:A32NX_FADEC_POWERED_ENGn). A parameter that is not available is shown
   *   as amber XX instead of its value: a stale or not yet initialised value is no exceedance. A value that is not a
   *   finite number is not one either, and leaves the highest value as it is.
   */
  update(value: number, groundStartSequence: boolean, valueValid: boolean): void {
    if (groundStartSequence) {
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

/** The engine start sequence on ground: L:A32NX_ENGINE_STATE Starting (2) or Restarting (3), on ground */
export function isGroundStartSequence(engineState: number, onGround: boolean): boolean {
  return onGround && (engineState === 2 || engineState === 3);
}
