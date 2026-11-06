// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const entriesByDictionary = new WeakMap<object, [string, unknown][]>();
const mergedEntriesByDictionaries = new WeakMap<object, WeakMap<object, [string, unknown][]>>();

/**
 * The entries of a dictionary that does not change after it was built, computed once per dictionary object.
 * The flight warning loop runs several times a second over tables of more than a thousand items, and building the
 * entry pairs again on every cycle makes garbage for the whole cockpit. Callers must not modify the returned array.
 */
export function cachedEntries<T>(dictionary: Readonly<Record<string, T>>): readonly [string, T][] {
  let entries = entriesByDictionary.get(dictionary);
  if (entries === undefined) {
    entries = Object.entries(dictionary);
    entriesByDictionary.set(dictionary, entries);
  }
  return entries as [string, T][];
}

/**
 * The entries of the first dictionary followed by those of the second, as one cached array. This is not the entries of
 * the merged dictionary: keys that look like integers are ordered by number within one object, so merging would
 * interleave the two tables.
 */
export function cachedEntriesOfBoth<T>(
  first: Readonly<Record<string, T>>,
  second: Readonly<Record<string, T>>,
): readonly [string, T][] {
  let secondToEntries = mergedEntriesByDictionaries.get(first);
  if (secondToEntries === undefined) {
    secondToEntries = new WeakMap();
    mergedEntriesByDictionaries.set(first, secondToEntries);
  }
  let entries = secondToEntries.get(second);
  if (entries === undefined) {
    entries = [...Object.entries(first), ...Object.entries(second)];
    secondToEntries.set(second, entries);
  }
  return entries as [string, T][];
}
