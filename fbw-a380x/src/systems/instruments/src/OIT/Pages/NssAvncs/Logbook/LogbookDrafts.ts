//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

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

export { personalIdAfterButton } from '../../../System/OisDialog';

/**
 * The STORE IN choice shown: the crew's own, else the first storage (OPEN ITEMS, the usual place of a defect).
 * Design choice: the manual's examples show either storage chosen, none preselected; OPEN ITEMS keeps a defect that the
 * crew forgot to route, and the crew can still change it.
 * @param chosen the index chosen, null when none
 * @returns the index to show
 */
export function storeTargetChoice(chosen: number | null): number {
  return chosen ?? 0;
}
