// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  REFUEL_ZF_DATA_CLEARED,
  RefuelState,
  enteredRefuelZfData,
  formatRefuelWeight,
  formatZfcg,
  parsePreselectedFuel,
  parseRefuelZfData,
  refuelState,
} from './OisRefuel';

const CAPACITY_KG = 259_755;

describe('OIS REFUEL: preselected fuel quantity', () => {
  it('takes whole kg up to the tank capacity', () => {
    expect(parsePreselectedFuel('150000', 'KG', CAPACITY_KG)).toBe(150_000);
    expect(parsePreselectedFuel(' 0 ', 'KG', CAPACITY_KG)).toBe(0);
    expect(parsePreselectedFuel('259755', 'KG', CAPACITY_KG)).toBe(CAPACITY_KG);
    expect(parsePreselectedFuel('259756', 'KG', CAPACITY_KG)).toBeNull();
  });

  it('takes whole lb, converted to kg, up to the capacity shown in lb', () => {
    expect(parsePreselectedFuel('220462', 'LB', CAPACITY_KG)).toBeCloseTo(100_000, 0);
    // 259 755 kg = 572 662 lb (rounded)
    expect(parsePreselectedFuel('572662', 'LB', CAPACITY_KG)).toBe(CAPACITY_KG);
    expect(parsePreselectedFuel('572663', 'LB', CAPACITY_KG)).toBeNull();
  });

  it('refuses decimals, signs, letters and empty entries', () => {
    expect(parsePreselectedFuel('150.5', 'KG', CAPACITY_KG)).toBeNull();
    expect(parsePreselectedFuel('-100', 'KG', CAPACITY_KG)).toBeNull();
    expect(parsePreselectedFuel('15T', 'KG', CAPACITY_KG)).toBeNull();
    expect(parsePreselectedFuel('', 'KG', CAPACITY_KG)).toBeNull();
    expect(parsePreselectedFuel(null, 'KG', CAPACITY_KG)).toBeNull();
  });
});

describe('OIS REFUEL: display', () => {
  it('shows the weights in whole kg or lb', () => {
    expect(formatRefuelWeight(150_000.4, 'KG')).toBe('150000 KG');
    expect(formatRefuelWeight(100_000, 'LB')).toBe('220462 LB');
    expect(formatRefuelWeight(null, 'KG')).toBe('------ KG');
  });

  it('shows the ZFCG in % MAC with one decimal, dashes without one', () => {
    expect(formatZfcg(36.54)).toBe('36.5 %');
    expect(formatZfcg(0)).toBe('--.- %');
    expect(formatZfcg(null)).toBe('--.- %');
  });

  it('shows refuel or defuel while it runs, PFQ REACHED within 400 kg of the PFQ', () => {
    expect(refuelState(true, 50_000, 150_000)).toBe(RefuelState.Refuelling);
    expect(refuelState(true, 150_000, 100_000)).toBe(RefuelState.Defuelling);
    expect(refuelState(true, 149_700, 150_000)).toBe(RefuelState.PfqReached);
    expect(refuelState(false, 150_400, 150_000)).toBe(RefuelState.PfqReached);
    expect(refuelState(false, 50_000, 150_000)).toBe(RefuelState.Standby);
    expect(refuelState(true, null, 150_000)).toBe(RefuelState.Standby);
  });
});

describe('OIS REFUEL: ZF data for the FQMS', () => {
  it('takes a ZFW in whole kg or lb and a ZFCG in % MAC, within the A380 limits', () => {
    expect(parseRefuelZfData('300000', '36.5', 'KG')).toEqual({
      data: { zfwKg: 300_000, zfcgPercentMac: 36.5 },
      error: null,
    });
    expect(parseRefuelZfData('661387', '36', 'LB').data?.zfwKg).toBeCloseTo(300_000, 0);
    expect(parseRefuelZfData('270000', '23', 'KG').data).toEqual({ zfwKg: 270_000, zfcgPercentMac: 23 });
    expect(parseRefuelZfData('373000', '48', 'KG').data).toEqual({ zfwKg: 373_000, zfcgPercentMac: 48 });
  });

  it('refuses a ZFW or a ZFCG out of the limits, and names the limits', () => {
    expect(parseRefuelZfData('269999', '36.5', 'KG')).toEqual({
      data: null,
      error: 'ZFW OUT OF RANGE (270000 - 373000 KG)',
    });
    expect(parseRefuelZfData('373001', '36.5', 'KG').data).toBeNull();
    expect(parseRefuelZfData('300000', '22.9', 'KG')).toEqual({
      data: null,
      error: 'ZFCG OUT OF RANGE (23.0 - 48.0 %)',
    });
    expect(parseRefuelZfData('300000', '48.1', 'KG').data).toBeNull();
  });

  it('needs both values, whole weights and one decimal of ZFCG at most', () => {
    expect(parseRefuelZfData('300000', null, 'KG')).toEqual({ data: null, error: 'ENTER ZFW AND ZFCG' });
    expect(parseRefuelZfData(null, '36.5', 'KG').error).toBe('ENTER ZFW AND ZFCG');
    expect(parseRefuelZfData('300000.5', '36.5', 'KG').error).toBe('ZFW OUT OF RANGE (270000 - 373000 KG)');
    expect(parseRefuelZfData('300000', '36.55', 'KG').error).toBe('ZFCG OUT OF RANGE (23.0 - 48.0 %)');
  });

  it('clears the entry with zeros, which the FQMS reads as no entry', () => {
    expect(REFUEL_ZF_DATA_CLEARED).toEqual({ zfwKg: 0, zfcgPercentMac: 0 });
  });

  it('shows an entry only when both values are set, as the FQMS takes them', () => {
    expect(enteredRefuelZfData(300_000, 36.5)).toEqual({ zfwKg: 300_000, zfcgPercentMac: 36.5 });
    expect(enteredRefuelZfData(300_000, 0)).toBeNull();
    expect(enteredRefuelZfData(0, 36.5)).toBeNull();
    expect(enteredRefuelZfData(0, 0)).toBeNull();
  });
});
