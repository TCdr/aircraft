// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether an InputField entry is handled (dataHandlerDuringValidation, onModified, value update): a changed value, or
 * the same non-empty value for a field that loads data again on each entry.
 * @param newValue the parsed entry
 * @param oldValue the value shown before the entry
 * @param handleSameValueEntry whether the field handles an entry equal to its value
 */
export function isInputFieldEntryHandled<T>(
  newValue: T | null,
  oldValue: T | null,
  handleSameValueEntry: boolean,
): boolean {
  return newValue !== oldValue || (handleSameValueEntry && newValue !== null);
}

/**
 * Whether a handled InputField entry is stored (value) and passed to onModified: not when dataHandlerDuringValidation
 * rejected it, by returning false or by throwing.
 * @param dataHandlerResult what dataHandlerDuringValidation returned (undefined without a handler)
 * @param dataHandlerThrew whether dataHandlerDuringValidation threw
 */
export function isInputFieldEntryApplied(dataHandlerResult: boolean | void, dataHandlerThrew: boolean): boolean {
  return !dataHandlerThrew && dataHandlerResult !== false;
}

/**
 * A space typed on a PC keyboard: the sim does not always send the keypress of the space bar, so the field also takes
 * it on keydown. When both events arrive, one space is entered.
 */
export class SpaceKeyDeduplicator {
  /** The two events of one key press come within this time, ms */
  private static readonly SAME_PRESS_MS = 150;

  private lastKeyDownMs = -Infinity;

  /** @param nowMs the time of the keydown, which always enters its space */
  public recordKeyDown(nowMs: number): void {
    this.lastKeyDownMs = nowMs;
  }

  /**
   * @param nowMs the time of the event
   * @returns whether the keypress of a space enters a space: not when the keydown of the same press already did
   */
  public onKeyPress(nowMs: number): boolean {
    const alreadyEntered = nowMs - this.lastKeyDownMs <= SpaceKeyDeduplicator.SAME_PRESS_MS;
    this.lastKeyDownMs = -Infinity;
    return !alreadyEntered;
  }
}
