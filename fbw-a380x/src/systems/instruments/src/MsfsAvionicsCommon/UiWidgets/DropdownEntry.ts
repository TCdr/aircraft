// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SubscribableArray } from '@microsoft/msfs-sdk';

/**
 * The list index of a DropdownMenu entry with keyboardEntryAllowed: the clicked item, or for a keyboard entry (index -1)
 * the item with the typed text.
 * @param values the items of the dropdown
 * @param index the index given to onModified (-1 for a keyboard entry)
 * @param text the typed text of a keyboard entry
 * @returns the index of the item, or null when the typed text is no item (empty entry)
 */
export function dropdownEntryIndex(
  values: SubscribableArray<string>,
  index: number | null,
  text: string,
): number | null {
  if (index !== -1) {
    return index;
  }
  const typedIndex = values.getArray().indexOf(text);
  return typedIndex >= 0 ? typedIndex : null;
}

/**
 * An onModified handler for a DropdownMenu with keyboardEntryAllowed: the given handler always gets a list index, the
 * typed item's for a keyboard entry, and is not called for a typed text that is no item (the dropdown raises its
 * errorOnNotInList).
 * @param values the items of the dropdown
 * @param handler what to do with the list index
 */
export function onDropdownEntry(
  values: SubscribableArray<string>,
  handler: (index: number) => void,
): (index: number | null, text: string) => void {
  return (index, text) => {
    const entryIndex = dropdownEntryIndex(values, index, text);
    if (entryIndex !== null) {
      handler(entryIndex);
    }
  };
}
