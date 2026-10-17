// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData, NXLogicConfirmNode, NXLogicMemoryNode } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';

/**
 * Trigger logic of the L/G alerts of the FWS that are made from the two landing gear control and indicating systems
 * (LGCIS 1 and 2, the LGCIU discrete words of the common Rust landing gear): L/G CTL 1(2)(1+2) FAULT, GEAR NOT LOCKED
 * DOWN, GEAR NOT LOCKED UP, DOORS NOT CLOSED and SYSTEM DISAGREE. The model has three gears (nose, left, right; the
 * wing gears follow the body gears), so each "per gear" bit below exists three times.
 *
 * LGCIU discrete words (fbw-common landing_gear/mod.rs, discrete_word_1..4):
 * - word 1 bits 11/12/13: left/right/nose gear not uplocked and the lever not down
 * - word 1 bits 14/15/16: left/right/nose gear not downlocked and the lever down
 * - word 1 bits 17/18/19: left/right/nose door not closed and locked
 * - word 1 bits 23/24/25: left/right/nose gear downlocked
 * - word 1 bit 29: gear lever down
 * - word 2 bit 29: control fault (spare on the A380 model)
 * - word 3 bits 11/12/13: left/right/nose gear not uplocked
 * - word 3 bits 25/26/27: left/right/nose door fully open
 * - word 4 bit 29: LGCIU system fault
 */

/** The LGCIU discrete words the FWS uses, from one LGCIS */
export interface LgciuWords {
  word1: Arinc429WordData;
  word2: Arinc429WordData;
  word3: Arinc429WordData;
  word4: Arinc429WordData;
}

// Word 1 (see the word list at the top of the file; per gear bits in the order left, right, nose)
const NOT_UPLOCKED_LEVER_UP_BITS = [11, 12, 13];
const NOT_DOWNLOCKED_LEVER_DOWN_BITS = [14, 15, 16];
const DOOR_NOT_CLOSED_BITS = [17, 18, 19];
const DOWNLOCKED_BITS = [23, 24, 25];
const LEVER_DOWN_BIT = 29;
// Word 3
const NOT_UPLOCKED_BITS = [11, 12, 13];
const DOOR_FULLY_OPEN_BITS = [25, 26, 27];

/** L/G GEAR NOT LOCKED DOWN: a gear is still not downlocked about 60 s after the lever went down */
const GEAR_NOT_LOCKED_DOWN_DELAY_S = 60;
/** L/G GEAR NOT LOCKED UP: a gear is still not locked up about 40 s after the lever went up */
const GEAR_NOT_LOCKED_UP_DELAY_S = 40;
/**
 * L/G GEAR NOT LOCKED UP stays until the gears are locked up again for this time (design choice: the 5 s of the
 * A32NX GEAR NOT UPLOCKED reset, PseudoFWC gearLockedUpFor5Seconds), so it survives the L/G LEVER DOWN of its procedure.
 */
const GEAR_LOCKED_UP_RESET_S = 5;
/**
 * L/G GEAR NOT LOCKED DOWN shows the gravity extension lines when the gear is still not down after 120 s.
 * Design choice: counted from the alert onset.
 */
const GEAR_NOT_LOCKED_DOWN_GRAVITY_DELAY_S = 120;
/**
 * L/G DOORS NOT CLOSED: no time is published. Design choice: a door is not closed 30 s after the
 * gear stopped moving (all gears locked up or all locked down). 30 s is the LGCIU transit fault time
 * (MAX_TRANSITION_DURATION in landing_gear/mod.rs), longer than any door closing after a normal gear cycle.
 */
const DOORS_NOT_CLOSED_DELAY_S = 30;
/**
 * L/G SYSTEM DISAGREE: no time is published. Design choice: the two LGCIS disagree for 5 s, so the
 * small time skew of two sensors passing their target during a normal gear cycle never triggers it.
 */
const SYSTEM_DISAGREE_DELAY_S = 5;

/**
 * A bit of an LGCIU word, or null when the word is not valid (failure warning or no computed data).
 * @param word the LGCIU word
 * @param bit the bit number
 * @returns the bit, or null without valid data
 */
function bitOrNull(word: Arinc429WordData, bit: number): boolean | null {
  return word.bitValueOr(bit, null);
}

/**
 * The FWS vote of the two LGCIS for an abnormal gear condition (as the A32NX FWC, PseudoFWC "l/g not uplocked"): with
 * both LGCIS valid both must see it, with one valid that one decides, with none the condition is false.
 * @param lgcis1 what LGCIS 1 sees, null without valid data
 * @param lgcis2 what LGCIS 2 sees, null without valid data
 * @returns whether the FWS takes the condition as true
 */
export function lgcisVote(lgcis1: boolean | null, lgcis2: boolean | null): boolean {
  if (lgcis1 !== null && lgcis2 !== null) {
    return lgcis1 && lgcis2;
  }
  return lgcis1 === true || lgcis2 === true;
}

/**
 * Whether any gear is in a voted abnormal state.
 * @param lgcis1 the words of LGCIS 1
 * @param lgcis2 the words of LGCIS 2
 * @param wordOf which word holds the bits
 * @param bits the bit of each gear
 * @param invert true when the bit is the normal state (the abnormal state is the bit not set)
 * @returns whether at least one gear is in the abnormal state for the FWS
 */
function anyGearVoted(
  lgcis1: LgciuWords,
  lgcis2: LgciuWords,
  wordOf: (words: LgciuWords) => Arinc429WordData,
  bits: number[],
  invert = false,
): boolean {
  return bits.some((bit) => {
    const a = bitOrNull(wordOf(lgcis1), bit);
    const b = bitOrNull(wordOf(lgcis2), bit);
    return lgcisVote(a === null ? null : a !== invert, b === null ? null : b !== invert);
  });
}

/**
 * Whether one LGCIS is failed for the FWS: L/G CTL 1(2) FAULT when one LGCIS is failed, L/G CTL 1+2 FAULT when both
 * are failed or both send invalid data. The LGCIU sets its system fault bit (word 4 bit 29, also the spare control
 * fault bit word 2 bit 29) after an internal error or a gear transit of more than 30 s; without power all its words
 * are failure warnings.
 * @param words the words of that LGCIS
 * @returns whether that LGCIS is failed
 */
export function lgcisFault(words: LgciuWords): boolean {
  const noValidWord = [words.word1, words.word2, words.word3, words.word4].every(
    (w) => w.bitValueOr(11, null) === null,
  );
  return words.word4.bitValueOr(29, false) || words.word2.bitValueOr(29, false) || noValidWord;
}

/** L/G CTL 1, 2 and 1+2 FAULT, which never show together */
export interface LgcisFaultAlerts {
  ctl1: boolean;
  ctl2: boolean;
  ctl12: boolean;
}

/**
 * Splits the LGCIS fault conditions into the three alerts.
 * @param lgcis1Fault LGCIS 1 failed
 * @param lgcis2Fault LGCIS 2 failed
 * @returns the alerts
 */
export function splitLgcisFaults(lgcis1Fault: boolean, lgcis2Fault: boolean): LgcisFaultAlerts {
  return {
    ctl1: lgcis1Fault && !lgcis2Fault,
    ctl2: lgcis2Fault && !lgcis1Fault,
    ctl12: lgcis1Fault && lgcis2Fault,
  };
}

/**
 * L/G SYSTEM DISAGREE condition before its confirm time: a proximity sensor of LGCIS 1 senses another position than
 * the redundant sensor of LGCIS 2. Each LGCIS reads its own proximity sensors (the flyPad "Proximity sensor
 * damage ... #1 / #2" failures). Compared: the gear uplock, gear downlock, door closed and door fully open sensors.
 * Both LGCIS must give valid words. The derived bits that include the gear lever (word 1 bits 11-16) and the shock
 * absorber bits are not compared (design choice).
 * @param lgcis1 the words of LGCIS 1
 * @param lgcis2 the words of LGCIS 2
 * @returns whether a sensor pair disagrees
 */
export function lgcisSensorDisagree(lgcis1: LgciuWords, lgcis2: LgciuWords): boolean {
  const pairs: [(w: LgciuWords) => Arinc429WordData, number[]][] = [
    [(w) => w.word1, [...DOOR_NOT_CLOSED_BITS, ...DOWNLOCKED_BITS]],
    [(w) => w.word3, [...NOT_UPLOCKED_BITS, ...DOOR_FULLY_OPEN_BITS]],
  ];
  return pairs.some(([wordOf, bits]) =>
    bits.some((bit) => {
      const a = bitOrNull(wordOf(lgcis1), bit);
      const b = bitOrNull(wordOf(lgcis2), bit);
      return a !== null && b !== null && a !== b;
    }),
  );
}

/**
 * Remembers whether the flight crew recycled the landing gear lever after an alert came up: the lever went to the other
 * position and back. Used to tick the "L/G ... RECYCLE" lines and to show the "IF NOT SUCCESSFUL" lines.
 */
export class LeverRecycleMonitor {
  private initialLeverDown: boolean | null = null;

  private movedAway = false;

  private recycled = false;

  /**
   * @param alertActive whether the alert is active
   * @param leverDown whether the gear lever is down
   * @returns whether the lever was recycled since the alert came up
   */
  public update(alertActive: boolean, leverDown: boolean): boolean {
    if (!alertActive) {
      this.initialLeverDown = null;
      this.movedAway = false;
      this.recycled = false;
    } else if (this.initialLeverDown === null) {
      this.initialLeverDown = leverDown;
    } else if (leverDown !== this.initialLeverDown) {
      this.movedAway = true;
    } else if (this.movedAway) {
      this.recycled = true;
    }
    return this.recycled;
  }

  /** @returns whether the lever was recycled since the alert came up */
  public get(): boolean {
    return this.recycled;
  }
}

/** EcamLimitations keys of the L/G procedures */
const MAX_SPEED_250 = '260400002';
const MAX_SPEED_220 = '320400001';
const GRVTY_EXTN_ONLY = '320400002';
const NO_LG_RETRACTION = '320400006';
const AVOID_EXCESS_G_LOAD = '320400007';

/**
 * Speed above 250 kt or M .55, the L/G door speed of the L/G procedures. Design choice: the current speed, not the
 * speed when the alert came up, so the lines follow the speed reduction.
 * @param casKt the computed airspeed in knots
 * @param mach the Mach number
 * @returns whether the speed is above 250 kt or M .55
 */
export function aboveGearDoorSpeed(casKt: number, mach: number): boolean {
  return casKt > 250 || mach > 0.55;
}

/**
 * Lines of L/G CTL 1+2 FAULT (ata31-32-33.ts 320800035: [MFD SURV] GPWS OFF, NO L/G RETRACTION). NO L/G RETRACTION
 * shows when an engine is running and all L/Gs were already locked down when the alert came up.
 * @param gearDownAtFailure all L/Gs were locked down when the alert came up
 * @param engineRunning at least one engine is running
 * @returns which lines show
 */
export function lgCtl12Items(gearDownAtFailure: boolean, engineRunning: boolean): boolean[] {
  return [true, gearDownAtFailure && engineRunning];
}

/**
 * ECAM limitations of L/G CTL 1+2 FAULT, ALL PHASES: NO L/G RETRACTION if all L/Gs were
 * locked down when the failure appeared, else MAX SPEED 220 KT and L/G GRVTY EXTN ONLY for the gravity extension
 * (design choice: one or the other, as the L/G is either down already or still to be extended by gravity).
 * @param gearDownAtFailure all L/Gs were locked down when the alert came up
 * @returns the EcamLimitations keys
 */
export function lgCtl12Limitations(gearDownAtFailure: boolean): string[] {
  return gearDownAtFailure ? [NO_LG_RETRACTION] : [MAX_SPEED_220, GRVTY_EXTN_ONLY];
}

/**
 * PFD limitations of L/G CTL 1+2 FAULT: MAX SPEED 220 KT for the gravity extension.
 * @param gearDownAtFailure all L/Gs were locked down when the alert came up
 * @returns the EcamLimitations keys
 */
export function lgCtl12PfdLimitations(gearDownAtFailure: boolean): string[] {
  return gearDownAtFailure ? [] : [MAX_SPEED_220];
}

/**
 * Lines of L/G GEAR NOT LOCKED DOWN (ata31-32-33.ts 320800039: L/G (AFTER 60 S) RECYCLE, FOR L/G GRVTY EXTN : MAX SPEED
 * 220 KT, L/G LEVER UP, L/G GRVTY DOWN, L/G LEVER DOWN, LDG WITH ABNORM L/G PROC APPLY): the recycle in flight, the
 * gravity extension when the L/G is still not down after 120 s, LDG WITH ABNORM L/G PROC when the gravity extension
 * did not work (after the lever is down again with the gravity extension selected).
 * @param inFlight the aircraft is in flight
 * @param gravityDue the alert has been active for 120 s
 * @param gravityExtensionDone the L/G GRVTY switch is DOWN and the lever DOWN again
 * @returns which lines show
 */
export function gearNotLockedDownItems(
  inFlight: boolean,
  gravityDue: boolean,
  gravityExtensionDone: boolean,
): boolean[] {
  const gravity = inFlight && gravityDue;
  return [inFlight, gravity, gravity, gravity, gravity, gravity && gravityExtensionDone];
}

/**
 * Ticks of L/G GEAR NOT LOCKED DOWN (same lines as gearNotLockedDownItems).
 * @param recycled the lever was recycled since the alert came up
 * @param leverDown the gear lever is down
 * @param gravitySwitchDown the L/G GRVTY switch is DOWN
 * @returns which lines are ticked
 */
export function gearNotLockedDownChecked(recycled: boolean, leverDown: boolean, gravitySwitchDown: boolean): boolean[] {
  return [recycled, false, !leverDown || gravitySwitchDown, gravitySwitchDown, gravitySwitchDown && leverDown, false];
}

/**
 * Lines of L/G GEAR NOT LOCKED UP (ata31-32-33.ts 320800040: SPEED REDUCE BELOW 250/.55, L/G LEVER RECYCLE, L/G LEVER
 * DOWN, MAX SPEED : 250/.55, FUEL CONSUMPT INCREASD, FMS PRED UNRELIABLE, AVOID EXCESS G LOAD): with a door not
 * closed, the speed and recycle lines, then L/G LEVER DOWN and MAX SPEED once the recycle did not work; with all doors
 * closed, AVOID EXCESS G LOAD. The fuel lines (STATUS INFO) show in flight.
 * @param inFlight the aircraft is in flight
 * @param doorOpen at least one L/G door is not closed
 * @param aboveSpeed the speed is above 250 kt or M .55
 * @param recycled the lever was recycled since the alert came up
 * @returns which lines show
 */
export function gearNotLockedUpItems(
  inFlight: boolean,
  doorOpen: boolean,
  aboveSpeed: boolean,
  recycled: boolean,
): boolean[] {
  if (!inFlight) {
    return [false, false, false, false, false, false, false];
  }
  return doorOpen
    ? [aboveSpeed, true, recycled, recycled, true, true, false]
    : [false, false, false, false, true, true, true];
}

/**
 * Ticks of L/G GEAR NOT LOCKED UP (same lines as gearNotLockedUpItems).
 * @param aboveSpeed the speed is above 250 kt or M .55
 * @param recycled the lever was recycled since the alert came up
 * @param leverDown the gear lever is down
 * @returns which lines are ticked
 */
export function gearNotLockedUpChecked(aboveSpeed: boolean, recycled: boolean, leverDown: boolean): boolean[] {
  return [!aboveSpeed, recycled, recycled && leverDown, false, false, false, false];
}

/**
 * ECAM and PFD limitations of L/G GEAR NOT LOCKED UP, ALL PHASES: MAX SPEED 250/.55 and AVOID EXCESS G LOAD when the
 * gear is downlocked with at least one door not closed.
 * @param allDownlocked all gears are locked down
 * @param doorOpen at least one L/G door is not closed
 * @returns the EcamLimitations keys
 */
export function gearNotLockedUpLimitations(allDownlocked: boolean, doorOpen: boolean): string[] {
  return allDownlocked && doorOpen ? [MAX_SPEED_250, AVOID_EXCESS_G_LOAD] : [];
}

/**
 * Lines of L/G DOORS NOT CLOSED (ata31-32-33.ts 320800036, 12 lines: [0] NO L/G RETRACTION and [1] MAX SPEED for a BLG
 * door not folded, [2] MAX SPEED and [3] L/G RECYCLE below 250/.55, [4] SPEED REDUCE, [5] L/G RECYCLE and [6] MAX SPEED
 * above 250/.55, [7..9] the L/G RETRACTN RQRD lines, [10] FUEL CONSUMPT and [11] FMS PRED). The BLG door folding is
 * not modelled and the [7..9] lines have no published condition, so they never show. The fuel lines (STATUS INFO)
 * show in flight with an engine running.
 * @param inFlight the aircraft is in flight
 * @param aboveSpeed the speed is above 250 kt or M .55
 * @param engineRunning at least one engine is running
 * @returns which lines show
 */
export function doorsNotClosedItems(inFlight: boolean, aboveSpeed: boolean, engineRunning: boolean): boolean[] {
  const below = inFlight && !aboveSpeed;
  const above = inFlight && aboveSpeed;
  const fuel = inFlight && engineRunning;
  return [false, false, below, below, above, above, above, false, false, false, fuel, fuel];
}

/**
 * Ticks of L/G DOORS NOT CLOSED (same lines as doorsNotClosedItems).
 * @param aboveSpeed the speed is above 250 kt or M .55
 * @param recycled the lever was recycled since the alert came up
 * @returns which lines are ticked
 */
export function doorsNotClosedChecked(aboveSpeed: boolean, recycled: boolean): boolean[] {
  return [false, false, false, recycled, !aboveSpeed, recycled, false, false, false, false, false, false];
}

/**
 * ECAM and PFD limitations of L/G DOORS NOT CLOSED: MAX SPEED 250/.55 in flight.
 * @param inFlight the aircraft is in flight
 * @returns the EcamLimitations keys
 */
export function doorsNotClosedLimitations(inFlight: boolean): string[] {
  return inFlight ? [MAX_SPEED_250] : [];
}

/** The L/G alert conditions of the FWS, made from the two LGCIS. One instance in FwsCore. */
export class FwsGearAlerts {
  public readonly lgCtl1Fault = Subject.create(false);

  public readonly lgCtl2Fault = Subject.create(false);

  public readonly lgCtl12Fault = Subject.create(false);

  public readonly gearNotLockedDown = Subject.create(false);

  public readonly gearNotLockedUp = Subject.create(false);

  public readonly doorsNotClosed = Subject.create(false);

  public readonly systemDisagree = Subject.create(false);

  /** At least one gear door not closed (for the GEAR NOT LOCKED UP lines and STATUS) */
  public readonly anyDoorNotClosed = Subject.create(false);

  public readonly allGearsDownlocked = Subject.create(false);

  public readonly leverDown = Subject.create(false);

  /** All L/Gs were locked down when L/G CTL 1+2 FAULT came up: NO L/G RETRACTION */
  public readonly ctl12WithGearDown = Subject.create(false);

  /** GEAR NOT LOCKED DOWN has been active for 120 s: the gravity extension lines show */
  public readonly notLockedDownGravityDue = Subject.create(false);

  /** The lever was recycled since GEAR NOT LOCKED DOWN came up */
  public readonly notLockedDownRecycled = Subject.create(false);

  /** The lever was recycled since GEAR NOT LOCKED UP came up */
  public readonly notLockedUpRecycled = Subject.create(false);

  /** The lever was recycled since DOORS NOT CLOSED came up */
  public readonly doorsRecycled = Subject.create(false);

  private readonly notDownlockedConfirm = new NXLogicConfirmNode(GEAR_NOT_LOCKED_DOWN_DELAY_S);

  private readonly notDownlockedMemory = new NXLogicMemoryNode(false);

  private readonly notUplockedConfirm = new NXLogicConfirmNode(GEAR_NOT_LOCKED_UP_DELAY_S);

  private readonly uplockedConfirm = new NXLogicConfirmNode(GEAR_LOCKED_UP_RESET_S);

  private readonly notUplockedMemory = new NXLogicMemoryNode(false);

  private readonly doorsConfirm = new NXLogicConfirmNode(DOORS_NOT_CLOSED_DELAY_S);

  private readonly disagreeConfirm = new NXLogicConfirmNode(SYSTEM_DISAGREE_DELAY_S);

  private readonly notLockedDownRecycle = new LeverRecycleMonitor();

  private readonly notLockedUpRecycle = new LeverRecycleMonitor();

  private readonly doorsRecycle = new LeverRecycleMonitor();

  private notLockedDownTimeS = 0;

  /**
   * @param deltaTimeMs the frame time in milliseconds (as the NXLogic nodes take it)
   * @param lgcis1 the words of LGCIS 1
   * @param lgcis2 the words of LGCIS 2
   * @param onGround whether the aircraft is on ground for the FWS
   * @param gravityExtensionSelected whether the L/G GRVTY switch is DOWN
   */
  public update(
    deltaTimeMs: number,
    lgcis1: LgciuWords,
    lgcis2: LgciuWords,
    onGround: boolean,
    gravityExtensionSelected: boolean,
  ): void {
    const faults = splitLgcisFaults(lgcisFault(lgcis1), lgcisFault(lgcis2));
    const anyWord1Valid = lgcis1.word1.bitValueOr(11, null) !== null || lgcis2.word1.bitValueOr(11, null) !== null;
    const allDownlocked = anyWord1Valid && !anyGearVoted(lgcis1, lgcis2, (w) => w.word1, DOWNLOCKED_BITS, true);
    const ctl12WasActive = this.lgCtl12Fault.get();
    this.lgCtl1Fault.set(faults.ctl1);
    this.lgCtl2Fault.set(faults.ctl2);
    this.lgCtl12Fault.set(faults.ctl12);
    if (faults.ctl12 && !ctl12WasActive) {
      // Latched at the onset: the NO L/G RETRACTION / gravity extension choice depends on the gear at the failure
      this.ctl12WithGearDown.set(allDownlocked);
    } else if (!faults.ctl12) {
      this.ctl12WithGearDown.set(false);
    }

    const leverDown = lgcisVote(bitOrNull(lgcis1.word1, LEVER_DOWN_BIT), bitOrNull(lgcis2.word1, LEVER_DOWN_BIT));
    const allUplocked = !anyGearVoted(lgcis1, lgcis2, (w) => w.word3, NOT_UPLOCKED_BITS);
    const anyDoorNotClosed = anyGearVoted(lgcis1, lgcis2, (w) => w.word1, DOOR_NOT_CLOSED_BITS);
    this.allGearsDownlocked.set(allDownlocked);
    this.leverDown.set(leverDown);
    this.anyDoorNotClosed.set(anyDoorNotClosed);

    // GEAR NOT LOCKED DOWN: lever down and a gear not downlocked for 60 s, kept through the recycle and gravity
    // extension (lever up) until all gears are locked down (as the A32NX GEAR NOT DOWNLOCKED memory).
    const notDownlockedLeverDown = anyGearVoted(lgcis1, lgcis2, (w) => w.word1, NOT_DOWNLOCKED_LEVER_DOWN_BITS);
    const notLockedDown = this.notDownlockedMemory.write(
      this.notDownlockedConfirm.write(notDownlockedLeverDown, deltaTimeMs),
      allDownlocked,
    );
    this.gearNotLockedDown.set(notLockedDown);
    this.notLockedDownTimeS = notLockedDown ? this.notLockedDownTimeS + deltaTimeMs / 1000 : 0;
    this.notLockedDownGravityDue.set(notLockedDown && this.notLockedDownTimeS >= GEAR_NOT_LOCKED_DOWN_GRAVITY_DELAY_S);
    this.notLockedDownRecycled.set(this.notLockedDownRecycle.update(notLockedDown, leverDown));

    // GEAR NOT LOCKED UP: lever up and a gear not uplocked for 40 s, kept through the recycle and L/G LEVER DOWN until
    // the gears are locked up for 5 s. Reset on ground (design choice: after landing the gear is down by design).
    const notUplockedLeverUp = anyGearVoted(lgcis1, lgcis2, (w) => w.word1, NOT_UPLOCKED_LEVER_UP_BITS);
    const notLockedUp = this.notUplockedMemory.write(
      this.notUplockedConfirm.write(notUplockedLeverUp, deltaTimeMs),
      this.uplockedConfirm.write(allUplocked, deltaTimeMs) || onGround,
    );
    this.gearNotLockedUp.set(notLockedUp);
    this.notLockedUpRecycled.set(this.notLockedUpRecycle.update(notLockedUp, leverDown));

    // DOORS NOT CLOSED: a door not closed 30 s after the gears stopped in a locked position. Not after a gravity
    // extension (design choice): the L/G doors stay open after a gravity extension, as expected.
    const gearStopped = (leverDown && allDownlocked) || (!leverDown && allUplocked);
    const doorsNotClosed = this.doorsConfirm.write(
      gearStopped && anyDoorNotClosed && !gravityExtensionSelected,
      deltaTimeMs,
    );
    this.doorsNotClosed.set(doorsNotClosed);
    this.doorsRecycled.set(this.doorsRecycle.update(doorsNotClosed, leverDown));

    this.systemDisagree.set(this.disagreeConfirm.write(lgcisSensorDisagree(lgcis1, lgcis2), deltaTimeMs));
  }
}
