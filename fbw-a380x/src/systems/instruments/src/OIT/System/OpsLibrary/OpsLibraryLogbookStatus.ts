// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { LogbookItem, TechLogbookState, deferredItems, itemsIn } from '../TechLogbook';
import { AircraftStatusItem, FltOpsAircraftStatus } from '../Performance/AircraftStatus';

/** A deferred item of the LOGBOOK STATUS tables */
export interface LogbookStatusRow {
  /** The eLogbook report reference */
  readonly ref: string;
  /** The report text (yellow) */
  readonly report: string;
  /** The MEL or CDL item that proposes the deferral (cyan link), without a link when the item has no reference */
  readonly proposedItem: string;
  readonly reference: string;
  readonly ata: string;
  readonly title: string;
}

export interface LogbookStatusRows {
  /** OPEN ITEMS: NONE or the number */
  readonly openItems: number;
  readonly mel: readonly LogbookStatusRow[];
  readonly cdl: readonly LogbookStatusRow[];
}

/**
 * @param item a deferred item of the logbook
 * @returns the row of the table
 */
function toRow(item: LogbookItem): LogbookStatusRow {
  const reference = item.deferral?.reference ?? '';
  return {
    ref: item.ref,
    report: item.title,
    proposedItem: reference !== '' ? `${reference} ${item.title}` : '',
    reference,
    ata: item.ata,
    title: item.title,
  };
}

/**
 * The LOGBOOK STATUS tab as the eLogbook pushed it to the FLT OPS domain.
 * @param logbook the eLogbook, null without one
 * @returns the open item count and the deferred MEL and CDL rows
 */
export function logbookStatusRows(logbook: TechLogbookState | null): LogbookStatusRows {
  if (logbook === null) {
    return { openItems: 0, mel: [], cdl: [] };
  }
  return {
    openItems: itemsIn(logbook, 'open').length,
    mel: deferredItems(logbook, 'MEL').map(toRow),
    cdl: deferredItems(logbook, 'CDL').map(toRow),
  };
}

/**
 * @param openItems the number of open items
 * @returns the text of the OPEN ITEMS line
 */
export function openItemsText(openItems: number): string {
  return `OPEN ITEMS: ${openItems === 0 ? 'NONE' : openItems.toFixed(0)}`;
}

/**
 * The entries of the MMEL: the references of the deferred MEL and CDL items, with their titles
 * @param rows the rows of the tables
 * @returns the references with their titles
 */
export function mmelReferencesOf(rows: LogbookStatusRows): { reference: string; title: string }[] {
  return [...rows.mel, ...rows.cdl]
    .filter((row) => row.reference !== '')
    .map((row) => ({ reference: row.reference, title: row.title }));
}

/**
 * Whether an MEL or CDL item is ticked in the MMEL entry: the item is in the AIRCRAFT STATUS of the FLT OPS domain,
 * which the performance applications read.
 * @param status the aircraft status
 * @param reference the MEL or CDL reference of the entry
 * @returns whether an item with that reference is in the status
 */
export function isItemTicked(status: FltOpsAircraftStatus, reference: string): boolean {
  return [...status.melItems, ...status.cdlItems].some((item) => item.reference === reference);
}

/**
 * The tick box of an MMEL entry: ticking selects the item for the performance applications, unticking removes it.
 * The eLogbook is not touched: it belongs to the NSS side.
 * @param status the aircraft status
 * @param row the deferred item
 * @param category the table the item is from
 * @param ticked the new state of the box
 * @returns the aircraft status
 */
export function setItemTicked(
  status: FltOpsAircraftStatus,
  row: LogbookStatusRow,
  category: 'MEL' | 'CDL',
  ticked: boolean,
): FltOpsAircraftStatus {
  const without: FltOpsAircraftStatus = {
    ...status,
    melItems: status.melItems.filter((item) => item.reference !== row.reference),
    cdlItems: status.cdlItems.filter((item) => item.reference !== row.reference),
  };
  if (!ticked) {
    return without;
  }
  const item: AircraftStatusItem = { ref: row.ref, ata: row.ata, reference: row.reference, title: row.title };
  return category === 'MEL'
    ? { ...without, melItems: [...without.melItems, item] }
    : { ...without, cdlItems: [...without.cdlItems, item] };
}
