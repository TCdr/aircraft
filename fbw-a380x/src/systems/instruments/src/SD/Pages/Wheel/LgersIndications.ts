// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData } from '@flybywiresim/fbw-sdk';

/*
 * LGERS indications of the WHEEL SD page:
 * - L/G CTL: shown when one or more landing gears are not locked in the selected position after the normal
 *   extension/retraction delay, with the L/G GEAR NOT LOCKED DOWN or L/G GEAR NOT LOCKED UP alert.
 *   Same trigger as these two alerts (systems-host FwsGearAlerts.ts): a gear not downlocked 60 s after the lever went
 *   down, not uplocked 40 s after it went up, with the FWS vote of the two LGCIS.
 * - L/G GRVTY EXTN IN PROGRESS: shown when the crew commands a landing gear gravity extension, until all gears are
 *   downlocked or for 120 s.
 *
 * LGCIU discrete word 1 bits (fbw-common landing_gear/mod.rs discrete_word_1): 11/12/13 left/right/nose gear not
 * uplocked and the lever not down, 14/15/16 left/right/nose gear not downlocked and the lever down, 23/24/25
 * left/right/nose gear downlocked. The model has three gears (the wing gears follow the body gears).
 */

/** An LGCIU discrete word */
export type LgciuWord = Arinc429WordData;

const LG_CTL_NOT_LOCKED_DOWN_DELAY_S = 60;
const LG_CTL_NOT_LOCKED_UP_DELAY_S = 40;
const GRAVITY_EXTENSION_MESSAGE_DURATION_S = 120;

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
