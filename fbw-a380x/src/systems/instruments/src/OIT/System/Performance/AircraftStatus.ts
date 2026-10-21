// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { LogbookItem, TechLogbookState, deferredItems } from '../TechLogbook';

/*
 * The AIRCRAFT STATUS of the FLT OPS performance applications: the MEL and CDL items of the aircraft, which SYNCHRO
 * LOGBOOK takes from the deferred items of the eLogbook for the whole FLT OPS domain (T.O PERF, LDG PERF and
 * LOADSHEET share them). The performance databases of the laptops have no MEL or CDL penalty, so no item changes a
 * computation: the applications list the items that affect it, and the crew applies their penalties by hand.
 */

/** A MEL or CDL item of the AIRCRAFT STATUS panel, from the eLogbook (yellow) */
export interface AircraftStatusItem {
  /** The eLogbook report reference of the item */
  readonly ref: string;
  /** The ATA reference of the deferred defect, cc-ss-xx */
  readonly ata: string;
  /** The MEL or CDL item reference */
  readonly reference: string;
  readonly title: string;
}

/** The aircraft status of the FLT OPS domain */
export interface FltOpsAircraftStatus {
  readonly melItems: readonly AircraftStatusItem[];
  readonly cdlItems: readonly AircraftStatusItem[];
  /** NUMBER OF NEGLIGIBLE ITEMS of the CDL subpanel: missing parts without performance penalty */
  readonly negligibleCdlItems: number;
  /** The crew entered the number of negligible items (cyan), else it comes from the eLogbook (yellow) */
  readonly negligibleCdlItemsByCrew: boolean;
}

export const EMPTY_AIRCRAFT_STATUS: FltOpsAircraftStatus = {
  melItems: [],
  cdlItems: [],
  negligibleCdlItems: 0,
  negligibleCdlItemsByCrew: false,
};

export type PerformanceApplication = 'T.O PERF' | 'LDG PERF' | 'LOADSHEET';

/**
 * Design choice: the ATA chapters of the deferred MEL items that change the computation of each application. T.O
 * PERF and LDG PERF: air conditioning (packs), auto flight (autoland, LDG PERF only), flight controls, hydraulics, ice
 * protection, landing gear and brakes, pneumatic and the engines. LOADSHEET: the cargo fire protection (a compartment
 * that cannot be loaded) and the fuel (the fuel distribution).
 */
const MEL_IMPACT_CHAPTERS: Readonly<Record<PerformanceApplication, readonly string[]>> = {
  'T.O PERF': ['21', '27', '29', '30', '32', '36', '70', '71', '72', '73', '75', '76', '77', '78', '79', '80'],
  'LDG PERF': ['21', '22', '27', '29', '30', '32', '36', '70', '71', '72', '73', '75', '76', '77', '78', '79', '80'],
  LOADSHEET: ['26', '28'],
};

/** Design choice: the CDL items without performance penalty: the static dischargers; the other missing parts add drag */
const NEGLIGIBLE_CDL_SECTIONS: readonly string[] = ['23-61'];

/**
 * @param item a deferred eLogbook item
 * @returns the item of the AIRCRAFT STATUS panel
 */
function fromLogbook(item: LogbookItem): AircraftStatusItem {
  return {
    ref: item.ref,
    ata: item.ata,
    reference: item.deferral?.reference ?? '',
    title: item.title,
  };
}

/**
 * SYNCHRO LOGBOOK: the aircraft status becomes the deferred MEL and CDL items of the eLogbook; the items the crew
 * added in an application are lost. The CDL items without penalty count as negligible items.
 * @param logbook the eLogbook
 * @returns the aircraft status of the FLT OPS domain
 */
export function aircraftStatusFromLogbook(logbook: TechLogbookState): FltOpsAircraftStatus {
  const cdl = deferredItems(logbook, 'CDL');
  return {
    melItems: deferredItems(logbook, 'MEL').map(fromLogbook),
    cdlItems: cdl.filter((item) => !isNegligibleCdlItem(item.ata)).map(fromLogbook),
    negligibleCdlItems: cdl.filter((item) => isNegligibleCdlItem(item.ata)).length,
    negligibleCdlItemsByCrew: false,
  };
}

/**
 * @param ata the ATA reference of a CDL item
 * @returns whether the missing part has no performance penalty
 */
function isNegligibleCdlItem(ata: string): boolean {
  return NEGLIGIBLE_CDL_SECTIONS.includes(ata.substring(0, 5));
}

/**
 * @param item a MEL item
 * @param application the application
 * @returns whether the inoperative system changes the computation of the application
 */
function melItemAffects(item: AircraftStatusItem, application: PerformanceApplication): boolean {
  return MEL_IMPACT_CHAPTERS[application].includes(item.ata.substring(0, 2));
}

/**
 * @param item a MEL or CDL item
 * @returns the text of the item in the panels, e.g. 21-51-01 PACK 1 INOP
 */
export function aircraftStatusItemText(item: AircraftStatusItem): string {
  return item.reference !== '' ? `${item.reference} ${item.title}` : item.title;
}

/** A line of the reminder area of the AIRCRAFT STATUS panel */
export interface ReminderLine {
  readonly text: string;
  /** A title line (MEL ITEMS, CDL ITEMS), white */
  readonly title: boolean;
  /** An entry of the crew (cyan), else data of the eLogbook (yellow) */
  readonly byCrew: boolean;
}

/**
 * The reminder area of an application: the MEL items that affect it and the number of the others, then (T.O PERF and
 * LDG PERF) the CDL items and the number of negligible ones; "NO PERFORMANCE IMPACT" (T.O PERF, LDG PERF) or
 * "NORMAL" (LOADSHEET) without any deferred item.
 * @param status the aircraft status
 * @param application the application
 * @returns the lines
 */
export function reminderLines(status: FltOpsAircraftStatus, application: PerformanceApplication): ReminderLine[] {
  const withCdl = application !== 'LOADSHEET';
  const cdlItems = withCdl ? status.cdlItems : [];
  const negligible = withCdl ? status.negligibleCdlItems : 0;
  if (status.melItems.length === 0 && cdlItems.length === 0 && negligible === 0) {
    return [{ text: withCdl ? 'NO PERFORMANCE IMPACT' : 'NORMAL', title: false, byCrew: false }];
  }
  const impactWord = application === 'LOADSHEET' ? 'IMPACT' : 'PERFORMANCE IMPACT';
  const lines: ReminderLine[] = [];
  if (status.melItems.length > 0) {
    lines.push({ text: 'MEL ITEMS', title: true, byCrew: false });
    const affecting = status.melItems.filter((item) => melItemAffects(item, application));
    for (const item of affecting) {
      lines.push({ text: aircraftStatusItemText(item), title: false, byCrew: false });
    }
    const others = status.melItems.filter((item) => !melItemAffects(item, application));
    if (others.length > 0) {
      lines.push({
        text: `${others.length} MEL ITEM${others.length > 1 ? 'S' : ''} WITH NO ${impactWord}`,
        title: false,
        byCrew: false,
      });
    }
  }
  if (cdlItems.length > 0 || negligible > 0) {
    lines.push({ text: 'CDL ITEMS', title: true, byCrew: false });
    for (const item of cdlItems) {
      lines.push({ text: `${aircraftStatusItemText(item)} (1 MISSING)`, title: false, byCrew: false });
    }
    if (negligible > 0) {
      lines.push({
        text: `${negligible} NEGLIGIBLE CDL ITEM${negligible > 1 ? 'S' : ''}`,
        title: false,
        byCrew: status.negligibleCdlItemsByCrew,
      });
    }
  }
  return lines;
}

/**
 * The items the computation of an application cannot take into account: the MEL items that affect it and, for T.O
 * PERF and LDG PERF, the CDL items and more than three negligible items (from the fourth one each adds drag).
 * @param status the aircraft status
 * @param application the application
 * @returns the item texts, empty when the computation is complete
 */
export function itemsNotInComputation(status: FltOpsAircraftStatus, application: PerformanceApplication): string[] {
  const texts = status.melItems.filter((item) => melItemAffects(item, application)).map(aircraftStatusItemText);
  if (application !== 'LOADSHEET') {
    texts.push(...status.cdlItems.map(aircraftStatusItemText));
    if (status.negligibleCdlItems > 3) {
      texts.push(`${status.negligibleCdlItems} NEGLIGIBLE CDL ITEMS`);
    }
  }
  return texts;
}

/**
 * DELETE of the AIRCRAFT STATUS panel.
 * @param status the aircraft status
 * @param ref the report reference of the item
 * @returns the status without the item
 */
export function deleteAircraftStatusItem(status: FltOpsAircraftStatus, ref: string): FltOpsAircraftStatus {
  return {
    ...status,
    melItems: status.melItems.filter((item) => item.ref !== ref),
    cdlItems: status.cdlItems.filter((item) => item.ref !== ref),
  };
}
