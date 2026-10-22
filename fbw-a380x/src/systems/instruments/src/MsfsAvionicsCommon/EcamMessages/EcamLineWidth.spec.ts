// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import {
  AbnormalProcedure,
  AbstractChecklistItem,
  ChecklistLineStyle,
  DeferredProcedure,
  isChecklistAction,
  isChecklistCondition,
  isChecklistHeadline,
  WD_LINE_CHARACTERS,
} from './index';
import type { ChecklistState } from '../providers/FwsPublisher';
import { EcamNormalProcedures } from './NormalProcedures';
import { ProcedureLinesGenerator } from './ProcedureLinesGenerator';

/*
 * The procedure tables import the enums of ./index and ./index imports the tables: loaded through ./index, that cycle
 * runs the tables before the enums exist. So ./index gets empty tables here, and each real table is loaded afterwards.
 */
vi.mock('./AbnormalSensed/ata21-22-23', () => ({ EcamAbnormalSensedAta212223: {}, EcamDeferredProcAta212223: {} }));
vi.mock('./AbnormalSensed/ata24', () => ({ EcamAbnormalSensedAta24: {}, EcamDeferredProcAta24: {} }));
vi.mock('./AbnormalSensed/ata26', () => ({ EcamAbnormalSensedAta26: {} }));
vi.mock('./AbnormalSensed/ata27', () => ({ EcamAbnormalSensedAta27: {}, EcamDeferredProcAta27: {} }));
vi.mock('./AbnormalSensed/ata28', () => ({ EcamAbnormalSensedAta28: {} }));
vi.mock('./AbnormalSensed/ata29-30', () => ({ EcamAbnormalSensedAta2930: {}, EcamDeferredProcAta2930: {} }));
vi.mock('./AbnormalSensed/ata31-32-33', () => ({ EcamAbnormalSensedAta313233: {}, EcamDeferredProcAta313233: {} }));
vi.mock('./AbnormalSensed/ata34', () => ({ EcamAbnormalSensedAta34: {}, EcamDeferredProcAta34: {} }));
vi.mock('./AbnormalSensed/ata35-36-42', () => ({ EcamAbnormalSensedAta353642: {} }));
vi.mock('./AbnormalSensed/ata46-49-52-56', () => ({ EcamAbnormalSensedAta46495256: {} }));
vi.mock('./AbnormalSensed/ata70', () => ({ EcamAbnormalSensedAta70: {}, EcamDeferredProcAta70: {} }));
vi.mock('./AbnormalSensed/ata80-rest', () => ({ EcamAbnormalSensedAta80Rest: {}, EcamDeferredProcAta80Rest: {} }));
vi.mock('./AbnormalSensed/secondary-failures', () => ({ EcamAbnormalSecondaryFailures: {} }));

const TABLE_FILES = [
  'ata21-22-23',
  'ata24',
  'ata26',
  'ata27',
  'ata28',
  'ata29-30',
  'ata31-32-33',
  'ata34',
  'ata35-36-42',
  'ata46-49-52-56',
  'ata70',
  'ata80-rest',
  'secondary-failures',
];

/*
 * An abnormal title is drawn in a 680 px wide SVG from x = 10, 16.8 px per character (24 px EIS font + 1.75 px letter
 * spacing): the 41st character starts outside it. A deferred procedure title is preceded by "> ".
 */
const TITLE_CHARACTERS = 40;
const DEFERRED_TITLE_PREFIX_CHARACTERS = 2;
/* The line generator cuts the text after WD_LINE_CHARACTERS - 1 characters, the line component after one more */
const LINE_CHARACTERS = WD_LINE_CHARACTERS - 2;

type ProcedureItem = AbnormalProcedure['items'][number];

// eslint-disable-next-line no-control-regex
const visibleText = (text: string) => text.replace(/\x1b(<\d|\)|'|4)?m/g, '');

/** Every line the E/WD can show for an item, before the cut to the line width (completed and not completed) */
function itemLines(item: ProcedureItem, index: number): string[] {
  if (item.style === ChecklistLineStyle.GreenTable) {
    return []; // two columns split at '|', not one line
  }
  // A timed item shows its time ("AFTER 30 S") while it runs
  const state: ChecklistState = {
    id: '',
    procedureActivated: true,
    itemsChecked: [],
    itemsToShow: [],
    itemsActive: [],
    itemsTimeStamp: Array(index + 1).fill(null),
  };
  const indent = item.level ? '\xa0'.repeat(item.level) : '';
  if (isChecklistAction(item)) {
    return [false, true].map((done) => ProcedureLinesGenerator.getChecklistActionText(item, index, done, state));
  }
  if (isChecklistCondition(item)) {
    const lines = [false, true].map((done) =>
      ProcedureLinesGenerator.getChecklistConditionText(item, index, done, state),
    );
    if (!item.sensed) {
      lines.push(ProcedureLinesGenerator.getChecklistConfirmText(item));
    }
    return lines;
  }
  if (isChecklistHeadline(item)) {
    return [`${item.style === ChecklistLineStyle.CenteredSubHeadline ? '.' : indent}${item.name}`];
  }
  return [`${indent}\xa0${item.name}`];
}

/** The items of these procedures with a line longer than the E/WD line, as "<procedure key> <item name>" */
function tooLongItems(procedures: { [key: string]: { items: AbstractChecklistItem[] } }): string[] {
  return Object.entries(procedures)
    .map(([key, proc]) =>
      (proc.items as ProcedureItem[])
        .filter((item, index) => itemLines(item, index).some((line) => line.length > LINE_CHARACTERS))
        .map((item) => `${key} ${item.name}`),
    )
    .reduce<string[]>((all, items) => all.concat(items), [])
    .filter((item, index, all) => all.indexOf(item) === index);
}

/** The titles of these procedures longer than maxCharacters, as "<procedure key> <title>" */
function tooLongTitles(procedures: { [key: string]: { title?: string } }, maxCharacters: number): string[] {
  return Object.entries(procedures)
    .map(([key, proc]) => [key, visibleText(proc.title ?? '')])
    .filter(([, title]) => title.length > maxCharacters)
    .map(([key, title]) => `${key} ${title}`);
}

async function loadTables() {
  const abnormal: { [key: string]: AbnormalProcedure } = {};
  const deferred: { [key: string]: DeferredProcedure } = {};
  for (const file of TABLE_FILES) {
    const exports = await vi.importActual<{ [name: string]: { [key: string]: unknown } }>(`./AbnormalSensed/${file}`);
    for (const [name, table] of Object.entries(exports)) {
      Object.assign(name.startsWith('EcamDeferred') ? deferred : abnormal, table);
    }
  }
  return { abnormal, deferred };
}

describe('A380X ECAM lines fit the E/WD width', async () => {
  const { abnormal, deferred } = await loadTables();

  it('loads the procedure tables', () => {
    expect(Object.keys(abnormal).length).toBeGreaterThan(500);
    expect(Object.keys(deferred).length).toBeGreaterThan(10);
  });

  it(`abnormal titles have at most ${TITLE_CHARACTERS} characters`, () => {
    expect(tooLongTitles(abnormal, TITLE_CHARACTERS)).toEqual([]);
  });

  it('deferred procedure titles leave room for the "> " in front of them', () => {
    expect(tooLongTitles(deferred, TITLE_CHARACTERS - DEFERRED_TITLE_PREFIX_CHARACTERS)).toEqual([]);
  });

  it(`procedure lines have at most ${LINE_CHARACTERS} characters`, () => {
    expect([...tooLongItems(abnormal), ...tooLongItems(deferred)]).toEqual([]);
  });

  it('the CONFIRM line of a condition keeps no space of its removed WHEN and colon', () => {
    const condition = { name: 'WHEN ANY FEED TK<13000 KG (AUTO RCL) :', sensed: false, condition: true, level: 1 };
    expect(ProcedureLinesGenerator.getChecklistConfirmText(condition)).toBe(
      '\xa0CONFIRM ANY FEED TK<13000 KG (AUTO RCL)',
    );
  });

  it(`normal checklist titles and lines have at most ${LINE_CHARACTERS} characters`, () => {
    expect(tooLongTitles(EcamNormalProcedures, LINE_CHARACTERS)).toEqual([]);
    expect(tooLongItems(EcamNormalProcedures)).toEqual([]);
  });
});
