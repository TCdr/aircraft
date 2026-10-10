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
