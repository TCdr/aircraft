// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { OitPageDrafts } from '../../../System/OitPageDrafts';
import { LOGBOOK_DIALOG_DRAFTS, personalIdAfterButton, selectionIndex, storeTargetChoice } from './LogbookDrafts';
import { LOGBOOK_URI } from './LogbookFlows';

/** The entries of each logbook page that must outlive a drawing of the page */
const KEPT_ENTRIES: Record<string, readonly string[]> = {
  'OitAvncsLogbookAssistant.tsx': [
    'pilotComment',
    'storeTarget',
    'systemIndex',
    'functionIndex',
    'allocationIndex',
    'keywords',
    'searchedKeywords',
    'freeTextTitle',
    'selectedItem',
  ],
  'OitAvncsLogbookCockpitInterface.tsx': ['area', 'stdDefectMode', 'selectedIndex', 'pilotComment', 'storeTarget'],
  'OitAvncsLogbookFlightData.tsx': ['panel'],
  'OitAvncsLogbookRelease.tsx': ['panel', 'selectedRef', 'servicedCategory'],
  'OitAvncsLogbookOpenItems.tsx': ['unticked', 'selectedRef'],
  'OitAvncsLogbookDeferredItems.tsx': ['panel', 'selectedRef'],
  'OitAvncsLogbookTemporaryItems.tsx': ['selectedItemRef'],
  'OitAvncsLogbookCabinOpenItems.tsx': ['selectedRef'],
  'OitAvncsLogbookHistory.tsx': ['selectedRef'],
};

/**
 * @param file a page file of the logbook folder
 * @returns its source
 */
function source(file: string): string {
  return readFileSync(resolve(__dirname, file), 'utf-8').replace(/\r\n/g, '\n');
}

/**
 * A draft entry: `.field<T>(page,` then the entry name, possibly on the next lines
 * @param code the source of a page
 * @param name the name of the entry
 * @returns whether the page takes the entry from the page drafts
 */
function takesFromDrafts(code: string, name: string): boolean {
  return new RegExp(`\\.field<[^(]*>\\(\\s*[^,()]+,\\s*'${name}'`).test(code);
}

describe('logbook page drafts', () => {
  it('takes what the crew typed or selected from the page drafts', () => {
    for (const file of Object.keys(KEPT_ENTRIES)) {
      const code = source(file);
      expect(code, file).toContain('pageDrafts');
      for (const name of KEPT_ENTRIES[file]) {
        expect(takesFromDrafts(code, name), `${file}: ${name}`).toBe(true);
      }
    }
  });

  it('keeps the personal ID of the identification in the page drafts', () => {
    expect(takesFromDrafts(source('../../Common/OisIdentificationDialog.tsx'), 'personalId')).toBe(true);
  });

  it('never keeps the password of the identification', () => {
    const dialog = source('../../Common/OisIdentificationDialog.tsx');
    expect(takesFromDrafts(dialog, 'password')).toBe(false);
    expect(dialog).toContain('private readonly password = Subject.create<string | null>(null);');
  });

  it('releases the previous input field before it announces the selected one to the sim', () => {
    const inputField = readFileSync(
      resolve(__dirname, '../../../../MsfsAvionicsCommon/UiWidgets/InputField.tsx'),
      'utf-8',
    );
    const onFocus = inputField.slice(inputField.indexOf('public onFocus()'));
    expect(onFocus.indexOf('fieldInEdition.onBlur(true)')).toBeGreaterThan(-1);
    expect(onFocus.indexOf('fieldInEdition.onBlur(true)')).toBeLessThan(onFocus.indexOf("'FOCUS_INPUT_FIELD'"));
  });

  it('lets the STORE IN choice come from the page', () => {
    expect(source('LogbookDefectStorePanel.tsx')).not.toContain('Subject.create<number | null>(null)');
  });

  it('keeps the entries of the logbook pages until the LOGBOOK application closes', () => {
    const drafts = new OitPageDrafts();
    drafts.field<string | null>(`${LOGBOOK_URI.entry}/free-text`, 'freeTextTitle', null).set('CABIN DOOR SEAL');
    drafts.field<string | null>(LOGBOOK_DIALOG_DRAFTS, 'personalId', null).set('JDOE');

    drafts.keepApplications([LOGBOOK_URI.application, 'nss-avncs/company-com']);
    expect(drafts.field<string | null>(`${LOGBOOK_URI.entry}/free-text`, 'freeTextTitle', null).get()).toBe(
      'CABIN DOOR SEAL',
    );
    expect(drafts.field<string | null>(LOGBOOK_DIALOG_DRAFTS, 'personalId', null).get()).toBe('JDOE');

    drafts.keepApplications(['nss-avncs/company-com']);
    expect(drafts.has(`${LOGBOOK_URI.entry}/free-text`)).toBe(false);
    expect(drafts.has(LOGBOOK_DIALOG_DRAFTS)).toBe(false);
  });

  it('finds the selected item again after the list changed', () => {
    expect(selectionIndex(['12:01  ENG 1 FIRE', '11:58  HYD G SYS LO PR'], '11:58  HYD G SYS LO PR')).toBe(1);
    expect(
      selectionIndex(['12:05  BLEED 2 FAULT', '12:01  ENG 1 FIRE', '11:58  HYD G SYS LO PR'], '11:58  HYD G SYS LO PR'),
    ).toBe(2);
    expect(selectionIndex(['12:01  ENG 1 FIRE'], '11:58  HYD G SYS LO PR')).toBe(null);
    expect(selectionIndex(['12:01  ENG 1 FIRE'], null)).toBe(null);
  });

  it('defaults STORE IN to the first storage', () => {
    expect(storeTargetChoice(null)).toBe(0);
    expect(storeTargetChoice(1)).toBe(1);
  });

  it('keeps the personal ID for the next signature unless the identification is cancelled', () => {
    expect(personalIdAfterButton('PILOT1', 'OK')).toBe('PILOT1');
    expect(personalIdAfterButton('PILOT1', 'CANCEL')).toBe(null);
    expect(personalIdAfterButton(null, 'OK')).toBe(null);
  });
});
