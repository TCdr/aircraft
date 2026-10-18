// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OitPageDrafts } from './OitPageDrafts';

const FORM = 'nss-avncs/company-com/pre-flight/departure-delay';

describe('OIT page drafts', () => {
  it('gives the page the entries of its earlier drawing', () => {
    const drafts = new OitPageDrafts();
    expect(drafts.has(FORM)).toBe(false);
    drafts.field<string | null>(FORM, 'station', null).set('LFBO');

    // The page is drawn again: same entry, same value
    expect(drafts.has(FORM)).toBe(true);
    expect(drafts.field<string | null>(FORM, 'station', null).get()).toBe('LFBO');
    expect(drafts.field<string | null>('nss-avncs/refuel', 'station', null).get()).toBe(null);
  });

  it('forgets the pages of a closed application', () => {
    const drafts = new OitPageDrafts();
    drafts.field(FORM, 'station', 'LFBO');
    drafts.field('nss-avncs/refuel', 'pfq', '120000');
    drafts.keepApplications(['nss-avncs/refuel']);
    expect(drafts.has(FORM)).toBe(false);
    expect(drafts.has('nss-avncs/refuel')).toBe(true);

    drafts.keepApplications([]);
    expect(drafts.has('nss-avncs/refuel')).toBe(false);
  });

  it('does not mistake an application for another one with the same start', () => {
    const drafts = new OitPageDrafts();
    drafts.field('nss-avncs/company-com-extra', 'x', 1);
    drafts.keepApplications(['nss-avncs/company-com']);
    expect(drafts.has('nss-avncs/company-com-extra')).toBe(false);
  });
});
