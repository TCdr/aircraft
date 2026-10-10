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
