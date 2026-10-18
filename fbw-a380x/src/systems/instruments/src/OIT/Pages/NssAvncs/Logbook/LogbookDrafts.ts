//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { LogbookDialog } from '../../../System/TechLogbookStore';
import { LOGBOOK_URI } from './LogbookFlows';

/** The entries of the LOGBOOK message windows, kept with the other logbook pages until the application closes */
export const LOGBOOK_DIALOG_DRAFTS = `${LOGBOOK_URI.application}/dialog`;

/**
 * The line of a list selection kept by the item it selects, not by its line: the list can change while the crew is
 * away from the page (a new ECAM alert on top, an item stored by the other OIT), and the selection must stay on the
 * same item or go.
 * @param keys the key of each line of the list
 * @param selectedKey the key of the item selected
 * @returns the line of the item, null when nothing is selected or the item left the list
 */
export function selectionIndex(keys: readonly string[], selectedKey: string | null): number | null {
  if (selectedKey === null) {
    return null;
  }
  const index = keys.indexOf(selectedKey);
  return index < 0 ? null : index;
}

/**
 * Whether the PERSONAL ID typed stays when a message window shows: the crew who left the logbook during an
 * identification finds what they typed when the same identification is asked again; any other message starts empty.
 * @param typedFor the identification the personal ID was typed for
 * @param shown the message window shown, null when the window closes
 * @returns whether the personal ID stays
 */
export function keepsPersonalId(
  typedFor: LogbookDialog['identification'] | null,
  shown: LogbookDialog | null,
): boolean {
  return shown === null || (shown.identification ?? null) === typedFor;
}
