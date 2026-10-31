// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  COCKPIT_AREAS,
  STANDARD_DEFECTS,
  defectAllocations,
  defectFunctions,
  defectSystems,
  defectsBySystem,
  defectsInZone,
  groundDeferralRule,
  searchDefects,
} from './TechLogbookDefects';

describe('technical logbook standard defects', () => {
  it('has unique titles, an ATA and a known cockpit area for every defect', () => {
    const titles = STANDARD_DEFECTS.map((d) => d.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const defect of STANDARD_DEFECTS) {
      expect(defect.ata).toMatch(/^\d{2}-\d{2}-\d{2}$/);
      expect(COCKPIT_AREAS).toContain(defect.area);
    }
  });

  it('narrows the item selection as SYSTEM, FUNCTION and ALLOCATION are completed', () => {
    expect(defectSystems()).toContain('LIGHTS');
    expect(defectFunctions('FUEL')).toEqual(['CROSSFEED', 'FEED PUMPS', 'QUANTITY INDICATION']);
    expect(defectAllocations('FUEL', 'FEED PUMPS')).toEqual(['FAULT LEGEND', 'INOP SYS']);

    const all = defectsBySystem(null, null, null);
    const fuel = defectsBySystem('FUEL', null, null);
    const pumps = defectsBySystem('FUEL', 'FEED PUMPS', null);
    const legends = defectsBySystem('FUEL', 'FEED PUMPS', 'FAULT LEGEND');
    expect(all).toHaveLength(STANDARD_DEFECTS.length);
    expect(fuel.length).toBeGreaterThan(pumps.length);
    expect(pumps.length).toBeGreaterThan(legends.length);
    expect(legends.map((d) => d.title)).toEqual([
      'MAIN FEED TK 4 PMP P/BSW FAULT LEGEND ILLUMINATES ON OVERHEAD PANEL',
      'STBY FEED TK 4 PMP P/BSW FAULT LEGEND ILLUMINATES ON OVERHEAD PANEL',
    ]);
  });

  it('finds the defects that contain every keyword, whatever the case', () => {
    expect(searchDefects('feed tk 4').map((d) => d.title)).toEqual([
      'MAIN FEED TK 4 PMP P/BSW FAULT LEGEND ILLUMINATES ON OVERHEAD PANEL',
      'STBY FEED TK 4 PMP P/BSW FAULT LEGEND ILLUMINATES ON OVERHEAD PANEL',
    ]);
    expect(searchDefects('windshield heating').map((d) => d.title)).toEqual([
      'INOP SYS L+R WINDSHLDS HEATG',
      'A-ICE L WINDSHIELD HEATG FAULT',
    ]);
    expect(searchDefects('   ')).toEqual([]);
    expect(searchDefects('nothing like this')).toEqual([]);
  });

  it('lists the standard defects of an equipment zone', () => {
    const defects = defectsInZone('GLARESHIELD', 'FCU');
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.every((d) => d.area === 'GLARESHIELD' && d.zone === 'FCU')).toBe(true);
  });
});

describe('simulated ground maintenance deferrals', () => {
  it('defers by the ATA of the item, the most precise reference first', () => {
    expect(groundDeferralRule('28-21-00')).toEqual({
      category: 'MEL',
      classification: 'MEL(o)(m)',
      rectificationInterval: 'C',
      severity: 'MEDIUM',
    });
    expect(groundDeferralRule('33-12-00')).toMatchObject({ category: 'MEL', rectificationInterval: 'D' });
    expect(groundDeferralRule('33-42-00')).toMatchObject({ category: 'MEL', rectificationInterval: 'C' });
    expect(groundDeferralRule('23-61-00')).toMatchObject({ category: 'CDL', classification: 'CDL' });
    expect(groundDeferralRule('56-10-00')).toMatchObject({ category: 'OTHER' });
  });

  it('has maintenance rectify what cannot be deferred, and an item without ATA', () => {
    expect(groundDeferralRule('27-92-00')).toBeNull();
    expect(groundDeferralRule('32-42-00')).toBeNull();
    expect(groundDeferralRule('')).toBeNull();
  });

  it('fills every DEFERRED ITEMS panel from the standard defects, and leaves some to rectify', () => {
    const categories = STANDARD_DEFECTS.map((d) => groundDeferralRule(d.ata)?.category ?? 'RECTIFIED');
    for (const category of ['MEL', 'CDL', 'OTHER', 'RECTIFIED']) {
      expect(categories).toContain(category);
    }
  });
});
