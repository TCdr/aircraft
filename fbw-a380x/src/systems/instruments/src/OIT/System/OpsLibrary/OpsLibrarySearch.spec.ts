// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OpsLibraryCatalog, OpsLibraryContentFile } from './OpsLibraryContent';
import { ecamSearchHits, ecamTitleSearchHits, functionalCodeHits, parseFunctionalCode } from './OpsLibrarySearch';

const file: OpsLibraryContentFile = { version: 1, generated: '2026-10-29', manuals: [] };
const catalog = new OpsLibraryCatalog(file, {
  '240001': { title: 'ELEC AC BUS 1 FAULT' },
  '240002': { title: 'ELEC EMER CONFIG' },
  '290001': { title: 'HYD G SYS PRESS LO' },
});
catalog.setMmelReferences([
  { reference: '24-11-01', title: 'AC BUS' },
  { reference: '21-24-01', title: 'CHAPTER 24 ONLY IN THE SECTION' },
]);

describe('parseFunctionalCode', () => {
  it('accepts a chapter, with or without a section', () => {
    expect(parseFunctionalCode('24')).toBe('24');
    expect(parseFunctionalCode(' 24-11 ')).toBe('2411');
    expect(parseFunctionalCode('2411')).toBe('2411');
  });

  it('rejects text that is not a code', () => {
    expect(parseFunctionalCode('2')).toBeNull();
    expect(parseFunctionalCode('APU')).toBeNull();
    expect(parseFunctionalCode('')).toBeNull();
  });
});

describe('ecamSearchHits', () => {
  it('finds the procedure and the MMEL entry of an alert', () => {
    expect(ecamSearchHits(catalog, '240001').map((h) => h.id)).toEqual(['ecam/240001', 'mmel/240001']);
  });

  it('finds nothing for an unknown alert', () => {
    expect(ecamSearchHits(catalog, '999999')).toEqual([]);
  });
});

describe('functionalCodeHits', () => {
  it('a chapter finds its ECAM procedures and MMEL entries', () => {
    const ids = functionalCodeHits(catalog, '24').map((h) => h.id);
    expect(ids).toContain('ecam/240001');
    expect(ids).toContain('ecam/240002');
    expect(ids).toContain('mmel/24-11-01');
    expect(ids).not.toContain('ecam/290001');
    expect(ids).not.toContain('mmel/21-24-01');
  });

  it('a chapter and section narrow the hits', () => {
    expect(functionalCodeHits(catalog, '2411').map((h) => h.id)).toEqual(['mmel/24-11-01']);
  });
});

describe('ecamTitleSearchHits', () => {
  it('finds the alerts whose title has all the words, with their MMEL entries', () => {
    expect(ecamTitleSearchHits(catalog, 'elec bus').map((h) => h.id)).toEqual(['ecam/240001', 'mmel/240001']);
  });

  it('finds nothing for an empty field or unknown words', () => {
    expect(ecamTitleSearchHits(catalog, '  ')).toEqual([]);
    expect(ecamTitleSearchHits(catalog, 'zzz')).toEqual([]);
  });
});
