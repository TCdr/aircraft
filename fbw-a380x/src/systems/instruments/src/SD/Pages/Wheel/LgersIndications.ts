// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData } from '@flybywiresim/fbw-sdk';

/*
 * LGERS indications of the WHEEL SD page, A380 FCOM DSC-32-20-40 (a380_fcom.txt l.81054-81065, l.81105-81109):
 * - L/G CTL: "Displayed when one or more landing gears are not locked in the selected position, after the normal
 *   extension/retraction delay. The L/G GEAR NOT LOCKED DOWN or L/G GEAR NOT LOCKED UP alerts are also displayed."
 *   Same trigger as these two alerts (systems-host FwsGearAlerts.ts): a gear not downlocked 60 s after the lever went
 *   down (l.161245-161246), not uplocked 40 s after it went up (l.161360-161361), with the FWS vote of the two LGCIS.
 * - L/G GRVTY EXTN IN PROGRESS: "appears when the flight crew commands a landing gear gravity extension. The message no
 *   longer appears when all gears are down locked, or after 120 s."
 *
 * LGCIU discrete word 1 bits (fbw-common landing_gear/mod.rs discrete_word_1): 11/12/13 left/right/nose gear not
 * uplocked and the lever not down, 14/15/16 left/right/nose gear not downlocked and the lever down, 23/24/25
 * left/right/nose gear downlocked. The model has three gears (the wing gears follow the body gears).
 */

/** An LGCIU discrete word */
export type LgciuWord = Arinc429WordData;

/** l.161245-161246: "not downlocked after approximately 60 s" */
export const LG_CTL_NOT_LOCKED_DOWN_DELAY_S = 60;
/** l.161360-161361: "not locked up after approximately 40 s" */
export const LG_CTL_NOT_LOCKED_UP_DELAY_S = 40;
/** l.81108: the gravity extension message goes after 120 s */
export const GRAVITY_EXTENSION_MESSAGE_DURATION_S = 120;

const NOT_UPLOCKED_LEVER_UP_BITS = [11, 12, 13];
const NOT_DOWNLOCKED_LEVER_DOWN_BITS = [14, 15, 16];
const DOWNLOCKED_BITS = [23, 24, 25];

/**
 * The FWS vote of the two LGCIS (FwsGearAlerts lgcisVote): with both valid both must see the condition, with one valid
 * that one decides, with none it is false.
 */
function vote(lgcis1: boolean | null, lgcis2: boolean | null): boolean {
  if (lgcis1 !== null && lgcis2 !== null) {
    return lgcis1 && lgcis2;
  }
  return lgcis1 === true || lgcis2 === true;
}

function anyGearVoted(word1Lgcis1: LgciuWord, word1Lgcis2: LgciuWord, bits: number[]): boolean {
  return bits.some((bit) => vote(word1Lgcis1.bitValueOr(bit, null), word1Lgcis2.bitValueOr(bit, null)));
}

/**
 * @param word1Lgcis1 LGCIU 1 discrete word 1
 * @param word1Lgcis2 LGCIU 2 discrete word 1
 * @returns whether all three gears are downlocked for at least one LGCIS
 */
export function allGearsDownlocked(word1Lgcis1: LgciuWord, word1Lgcis2: LgciuWord): boolean {
  return DOWNLOCKED_BITS.every((bit) => word1Lgcis1.bitValueOr(bit, false) || word1Lgcis2.bitValueOr(bit, false));
}

/** L/G CTL of the WHEEL page */
export class LgCtlIndication {
  private notDownlockedS = 0;

  private notUplockedS = 0;

  /**
   * @param deltaS the time since the last update, in seconds
   * @param word1Lgcis1 LGCIU 1 discrete word 1
   * @param word1Lgcis2 LGCIU 2 discrete word 1
   * @returns whether L/G CTL shows
   */
  public update(deltaS: number, word1Lgcis1: LgciuWord, word1Lgcis2: LgciuWord): boolean {
    const notDownlocked = anyGearVoted(word1Lgcis1, word1Lgcis2, NOT_DOWNLOCKED_LEVER_DOWN_BITS);
    const notUplocked = anyGearVoted(word1Lgcis1, word1Lgcis2, NOT_UPLOCKED_LEVER_UP_BITS);
    this.notDownlockedS = notDownlocked ? this.notDownlockedS + deltaS : 0;
    this.notUplockedS = notUplocked ? this.notUplockedS + deltaS : 0;
    return this.notDownlockedS >= LG_CTL_NOT_LOCKED_DOWN_DELAY_S || this.notUplockedS >= LG_CTL_NOT_LOCKED_UP_DELAY_S;
  }
}

/*
 * LANDING GEAR and LANDING GEAR DOORS indications of the WHEEL SD page, A380 FCOM DSC-32-20-40 (a380_fcom.txt
 * l.81086-81103):
 * - Gear (l.81086-81096): "No display: The associated landing gear is uplocked." / "The associated landing gear is
 *   downlocked." / "The associated landing gear is in transit." "LGCIS 1 controls the display of the left triangle and
 *   LGCIS 2 controls the display of the right triangle."
 * - Doors (l.81098-81103): "The landing gear doors are closed and uplocked." / "... in transit." / "... open."
 * - Lost data: "replaced by amber crosses" (the ECAM rule of the SD pages, e.g. l.145294).
 *
 * LGCIU discrete word 1 bits 17/18/19 left/right/nose door not uplocked, 23/24/25 left/right/nose gear downlocked;
 * discrete word 3 bits 11/12/13 left/right/nose gear not uplocked, 25/26/27 left/right/nose door fully open
 * (fbw-common landing_gear/mod.rs discrete_word_1, discrete_word_3). The model has three gears and three doors: the
 * wing gears show the body gear of the same side.
 */

/** The gear (and its door) of the LGCIU discrete words */
export enum LgciuGear {
  Left,
  Right,
  Nose,
}

const GEAR_NOT_UPLOCKED_WORD_3_BIT: Record<LgciuGear, number> = {
  [LgciuGear.Left]: 11,
  [LgciuGear.Right]: 12,
  [LgciuGear.Nose]: 13,
};
const GEAR_DOWNLOCKED_WORD_1_BIT: Record<LgciuGear, number> = {
  [LgciuGear.Left]: 23,
  [LgciuGear.Right]: 24,
  [LgciuGear.Nose]: 25,
};
const DOOR_NOT_UPLOCKED_WORD_1_BIT: Record<LgciuGear, number> = {
  [LgciuGear.Left]: 17,
  [LgciuGear.Right]: 18,
  [LgciuGear.Nose]: 19,
};
const DOOR_FULLY_OPEN_WORD_3_BIT: Record<LgciuGear, number> = {
  [LgciuGear.Left]: 25,
  [LgciuGear.Right]: 26,
  [LgciuGear.Nose]: 27,
};

/** One triangle of a landing gear: what one LGCIS sees */
export enum GearTriangle {
  /** "No display: The associated landing gear is uplocked." */
  Hidden,
  /** Downlocked: green */
  Downlocked,
  /** In transit: red */
  InTransit,
  /** The LGCIS data is lost: amber crosses */
  Invalid,
}

/**
 * The triangle that one LGCIS controls (LGCIS 1 the left one, LGCIS 2 the right one).
 * @param word1 discrete word 1 of that LGCIU
 * @param word3 discrete word 3 of that LGCIU
 * @param gear the gear
 * @returns the triangle
 */
export function gearTriangle(word1: LgciuWord, word3: LgciuWord, gear: LgciuGear): GearTriangle {
  if (!word1.isNormalOperation() || !word3.isNormalOperation()) {
    return GearTriangle.Invalid;
  }
  if (!word3.bitValueOr(GEAR_NOT_UPLOCKED_WORD_3_BIT[gear], false)) {
    return GearTriangle.Hidden;
  }
  return word1.bitValueOr(GEAR_DOWNLOCKED_WORD_1_BIT[gear], false) ? GearTriangle.Downlocked : GearTriangle.InTransit;
}

/** The landing gear door indication */
export enum GearDoorIndication {
  /** Closed and uplocked: green */
  Closed,
  /** In transit: amber */
  InTransit,
  /** Open: amber */
  Open,
  /** The data of both LGCIS is lost: amber crosses */
  Invalid,
}

/**
 * Design choice: the FCOM does not say which LGCIS drives the doors; as the A32NX WHEEL page, a door is not uplocked
 * (or fully open) when one valid LGCIS sees it so.
 * @param word1Lgcis1 LGCIU 1 discrete word 1
 * @param word1Lgcis2 LGCIU 2 discrete word 1
 * @param word3Lgcis1 LGCIU 1 discrete word 3
 * @param word3Lgcis2 LGCIU 2 discrete word 3
 * @param gear the gear of the door
 * @returns the door indication
 */
export function gearDoorIndication(
  word1Lgcis1: LgciuWord,
  word1Lgcis2: LgciuWord,
  word3Lgcis1: LgciuWord,
  word3Lgcis2: LgciuWord,
  gear: LgciuGear,
): GearDoorIndication {
  const lgcis1Valid = word1Lgcis1.isNormalOperation() && word3Lgcis1.isNormalOperation();
  const lgcis2Valid = word1Lgcis2.isNormalOperation() && word3Lgcis2.isNormalOperation();
  if (!lgcis1Valid && !lgcis2Valid) {
    return GearDoorIndication.Invalid;
  }
  const seenBy = (word: LgciuWord, valid: boolean, bit: number) => valid && word.bitValueOr(bit, false);
  const notUplocked =
    seenBy(word1Lgcis1, lgcis1Valid, DOOR_NOT_UPLOCKED_WORD_1_BIT[gear]) ||
    seenBy(word1Lgcis2, lgcis2Valid, DOOR_NOT_UPLOCKED_WORD_1_BIT[gear]);
  if (!notUplocked) {
    return GearDoorIndication.Closed;
  }
  const fullyOpen =
    seenBy(word3Lgcis1, lgcis1Valid, DOOR_FULLY_OPEN_WORD_3_BIT[gear]) ||
    seenBy(word3Lgcis2, lgcis2Valid, DOOR_FULLY_OPEN_WORD_3_BIT[gear]);
  return fullyOpen ? GearDoorIndication.Open : GearDoorIndication.InTransit;
}

/** L/G GRVTY EXTN IN PROGRESS of the WHEEL page */
export class GravityExtensionIndication {
  private wasCommanded = false;

  private remainingS = 0;

  /**
   * @param deltaS the time since the last update, in seconds
   * @param gravityExtensionCommanded the L/G GRVTY switch is DOWN (L:A32NX_LG_GRVTY_SWITCH_POS 2)
   * @param allDownlocked all gears are downlocked (allGearsDownlocked)
   * @returns whether the message shows
   */
  public update(deltaS: number, gravityExtensionCommanded: boolean, allDownlocked: boolean): boolean {
    if (gravityExtensionCommanded && !this.wasCommanded) {
      this.remainingS = GRAVITY_EXTENSION_MESSAGE_DURATION_S;
    } else {
      this.remainingS = Math.max(0, this.remainingS - deltaS);
    }
    this.wasCommanded = gravityExtensionCommanded;
    if (allDownlocked || !gravityExtensionCommanded) {
      this.remainingS = 0;
    }
    return this.remainingS > 0;
  }
}
