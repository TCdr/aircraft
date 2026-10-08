// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The engine limits of the EWD, also used by the FWC alert ENG 1(2) N1/N2/EGT OVER LIMIT (systems-host
 * FWC/Logic/EngineParameterAlerts) so that the alert and the gauge colours agree.
 * - EGT: the certified "Maximum permitted gas temperature" figures of the CFM56-5B TCDS (EASA E.003, -5B/P /2P /3 variant
 *   family), confirmed in the sim by the user (commit 8f527e3b0): 940 °C at takeoff thrust (TOGA, FLX), 905 °C at the
 *   continuous ratings (CLB, MCT, MREV), 725 °C otherwise (idle, cruise without a rated limit, start). The TCDS publishes no
 *   absolute red line: the red limit keeps a 35 °C margin above the takeoff limit (975 °C). The amber limit mark is always
 *   drawn. The A320 FCOM (CFM56-5B, DSC-70-90-40, a320_fcom.txt l.64265-64307) gives 725 / 915 °C and a 950 °C red limit;
 *   the user chose the TCDS values (2026-10-06). OPEN QUESTION: FBW models the LEAP-1A, whose limits differ (the CFM LEAP-1A
 *   familiarisation gives an EGT red line of 1060 °C "to be confirmed", N1 101 %, N2 116.5 %).
 *   A red mark keeps the highest EGT reached once the red limit is exceeded (FCOM l.64281-64287).
 * - N1 (FCOM l.64317-64397, also the TCDS red line): amber above the N1 limit (the TO/GA N1), red above 104 %. A red mark
 *   keeps the highest N1 reached once the red limit is exceeded.
 * - N2 (FCOM l.64419-64423): red above 105 %, with a red cross that stays.
 * The red marks and the red cross "no longer appear at the next engine start sequence on ground" (l.64286, 64388, 64422).
 */

export const EGT_TAKEOFF_LIMIT_DEGREES = 940;
export const EGT_CONTINUOUS_LIMIT_DEGREES = 905;
export const EGT_START_LIMIT_DEGREES = 725;
export const EGT_RED_LIMIT_DEGREES = EGT_TAKEOFF_LIMIT_DEGREES + 35;
export const N1_RED_LIMIT_PERCENT = 104;
export const N2_RED_LIMIT_PERCENT = 105;

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

/** The amber EGT limit of the thrust limit type (TCDS values, see above) */
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

/** l.64317-64323: amber above the N1 limit, red above the N1 red limit */
export function n1Color(n1: number, n1Limit: number): LimitColor {
  if (n1 > N1_RED_LIMIT_PERCENT) {
    return 'Red';
  }
  return n1Limit > 0 && n1 > n1Limit + N1_LIMIT_AMBER_MARGIN_PERCENT ? 'Amber' : 'Green';
}

/** l.64419-64421: red above the N2 red limit */
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

  update(value: number, groundStartSequence: boolean): void {
    if (groundStartSequence) {
      this.highest = 0;
      this.exceededLimit = false;
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
