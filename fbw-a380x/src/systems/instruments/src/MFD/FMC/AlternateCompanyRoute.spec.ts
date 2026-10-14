// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import type { Fix as CoRouteFix } from '@simbridge/Coroute/Fix';
import { Fix } from '@flybywiresim/fbw-sdk';
import {
  alternateRouteEntryError,
  alternateRouteFieldText,
  alternateRouteFixes,
  isAlternateRouteEntryAllowed,
} from './AlternateCompanyRoute';

const navlogFix = (ident: string, lat: number, long: number, extra: Partial<CoRouteFix> = {}): CoRouteFix => ({
  ident,
  name: ident,
  type: 'wpt',
  via_airway: 'DCT',
  is_sid_star: '0',
  pos_lat: String(lat),
  pos_long: String(long),
  ...extra,
});

const fix = (ident: string, lat: number, long: number) => ({ ident, location: { lat, long } }) as unknown as Fix;

describe('INIT page ALTN RTE entry', () => {
  it('is allowed with a primary destination and no pending temporary flight plan', () => {
    expect(isAlternateRouteEntryAllowed('LFPG', false)).toBe(true);
    expect(isAlternateRouteEntryAllowed(undefined, false)).toBe(false);
    expect(isAlternateRouteEntryAllowed('LFPG', true)).toBe(false);
  });

  it('gives DEST / ALTN CPNY RTE DISAGREE when the route does not start at the primary destination', () => {
    expect(alternateRouteEntryError({ originIcao: 'EGLL' }, 'LFPG')).toBe('DEST_ALTN_CPNY_RTE_DISAGREE');
    expect(alternateRouteEntryError({ originIcao: 'LFPG' }, 'LFPG')).toBeNull();
  });

  it('gives NOT IN DATABASE for an unknown route, NOT ALLOWED without a primary destination', () => {
    expect(alternateRouteEntryError(undefined, 'LFPG')).toBe('NOT_IN_DATABASE');
    expect(alternateRouteEntryError({ originIcao: 'LFPG' }, undefined)).toBe('NOT_ALLOWED');
  });

  it('shows the inserted route while the plan keeps its alternate, else NONE', () => {
    const inserted = { ident: 'PGLY01', alternateIcao: 'LFLY' };
    expect(alternateRouteFieldText(inserted, 'LFLY', true)).toBe('PGLY01');
    expect(alternateRouteFieldText(inserted, 'LFML', true)).toBe('NONE');
    expect(alternateRouteFieldText(null, 'LFLY', true)).toBe('NONE');
    expect(alternateRouteFieldText(null, undefined, false)).toBeNull();
  });

  it('inserts the en-route fixes, the database fix nearest to the navlog position', async () => {
    const database: Record<string, Fix[]> = {
      ABC: [fix('ABC', 10, 10), fix('ABC', 48, 2)],
      DEF: [fix('DEF', 47, 3)],
    };
    const navlog = [
      navlogFix('SID1', 49, 2, { is_sid_star: '1' }),
      navlogFix('ABC', 48.1, 2.1),
      navlogFix('TOC', 48, 2),
      navlogFix('XYZ', 47.5, 2.5),
      navlogFix('DEF', 47, 3),
      navlogFix('LFLY', 45.7, 5.1, { type: 'apt' }),
    ];
    const fixes = await alternateRouteFixes(navlog, async (ident) => database[ident] ?? []);
    expect(fixes.map((f) => [f.ident, f.location.lat])).toEqual([
      ['ABC', 48],
      ['DEF', 47],
    ]);
  });
});
