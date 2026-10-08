// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  fadecFaultItemsChecked,
  fadecFaultItemsShown,
  isReverserInoperative,
  isReverserSelectedInFlight,
  isThrLeverInClimbDetent,
  reverserInopItemsShown,
  reverserSelectedItemsShown,
  reverserUnlockedItemsChecked,
  reverserUnlockedItemsShown,
  thrLeverFaultInfo,
  thrLeverFaultItemsChecked,
  thrLeverFaultItemsShown,
} from './FadecReverserAlerts';

// The EcamMessages modules cannot be imported in a test (circular imports with their enums): read the source instead
const ata70 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');
const itemCount = (key: number) => {
  const start = ata70.indexOf(`  ${key}: {`);
  expect(start, `${key}`).toBeGreaterThan(0);
  return (ata70.slice(start, ata70.indexOf('\n  },', start)).match(/\{ name: /g) ?? []).length;
};

describe('ENG FADEC FAULT', () => {
  it('asks to adjust the thrust lever by hand only with the A/THR engaged', () => {
    expect(fadecFaultItemsShown(true)).toEqual([true, true, true, true, true]);
    expect(fadecFaultItemsShown(false)).toEqual([false, true, true, true, true]);
    expect(fadecFaultItemsShown(false)).toHaveLength(itemCount(701800013));
  });

  it('checks the lever at idle and the master off', () => {
    expect(fadecFaultItemsChecked(true, false)).toEqual([false, false, false, true, false]);
    expect(fadecFaultItemsChecked(true, true)).toEqual([false, false, false, true, true]);
  });
});

describe('ENG THR LEVER FAULT', () => {
  it('is IDLE ONLY on ground and CLB ONLY in flight', () => {
    expect(thrLeverFaultItemsShown(true, false)).toEqual([true, true, false, false]);
    expect(thrLeverFaultItemsShown(false, false)).toEqual([false, false, true, true]);
  });

  it('adds the landing distance line for the engines with a reverser', () => {
    expect(thrLeverFaultItemsShown(false, true)).toEqual([false, false, true, true, true]);
    expect(thrLeverFaultItemsShown(false, true)).toHaveLength(itemCount(701800130));
    expect(thrLeverFaultItemsShown(false, false)).toHaveLength(itemCount(701800129));
    expect(thrLeverFaultItemsChecked(false, true, true)).toEqual([false, false, false, true, false]);
  });

  it('reads the CL detent', () => {
    expect(isThrLeverInClimbDetent(25)).toBe(true);
    expect(isThrLeverInClimbDetent(35)).toBe(false);
  });

  it('gives the STATUS INFO IDLE ONLY on ground, CLB ONLY in flight', () => {
    expect(thrLeverFaultInfo(true, true)).toEqual({ idleOnly: true, clbOnly: false });
    expect(thrLeverFaultInfo(true, false)).toEqual({ idleOnly: false, clbOnly: true });
    expect(thrLeverFaultInfo(false, false)).toEqual({ idleOnly: false, clbOnly: false });
  });
});

describe('ENG 2(3) reverser alerts', () => {
  it('checks the takeoff performance before takeoff only', () => {
    expect(reverserInopItemsShown(true)).toEqual([true, true]);
    expect(reverserInopItemsShown(false)).toEqual([false, true]);
    for (const key of [701800137, 701800141, 701800145]) {
      expect(reverserInopItemsShown(true)).toHaveLength(itemCount(key));
    }
  });

  it('REVERSER UNLOCKED shuts the engine down on ground, and in flight if buffet', () => {
    expect(reverserUnlockedItemsShown(true)).toEqual([true, true, true, false, false]);
    expect(reverserUnlockedItemsShown(false)).toEqual([true, true, false, true, true]);
    expect(reverserUnlockedItemsShown(false)).toHaveLength(itemCount(701800149));
    expect(reverserUnlockedItemsChecked(true, true)).toEqual([false, true, true, false, true]);
  });

  it('REVERSER SELECTED triggers in flight only, with the lever line of the selected reversers', () => {
    expect(isReverserSelectedInFlight(-6, false)).toBe(true);
    expect(isReverserSelectedInFlight(-6, true)).toBe(false);
    expect(isReverserSelectedInFlight(0, false)).toBe(false);
    expect(reverserSelectedItemsShown(true, false)).toEqual([true, false, false]);
    expect(reverserSelectedItemsShown(true, true)).toEqual([false, false, true]);
    expect(reverserSelectedItemsShown(true, true)).toHaveLength(itemCount(701800154));
  });

  it('makes the reverser inoperative with a fault, a control fault, a failed lock or a thrust lever fault', () => {
    expect(isReverserInoperative(false, false, false, false)).toBe(false);
    expect(isReverserInoperative(true, false, false, false)).toBe(true);
    expect(isReverserInoperative(false, true, false, false)).toBe(true);
    expect(isReverserInoperative(false, false, true, false)).toBe(true);
    expect(isReverserInoperative(false, false, false, true)).toBe(true);
  });
});

describe('FwsAbnormalSensed wiring of the FADEC, thrust lever and reverser alerts', () => {
  const fws = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const block = (key: number) => {
    const start = fws.indexOf(`    ${key}: {`);
    expect(start, `${key}`).toBeGreaterThan(0);
    return fws.slice(start, fws.indexOf('\n    },', start));
  };

  it('wires every alert as an amber caution', () => {
    const keys = [
      [701800013, 701800014, 701800015, 701800016],
      [701800021, 701800022, 701800023, 701800024],
      [701800025, 701800026, 701800027, 701800028],
      [701800129, 701800130, 701800131, 701800132],
      [701800137, 701800138, 701800139, 701800140, 701800141, 701800142],
      [701800145, 701800146, 701800149, 701800150, 701800154],
    ].flat();
    for (const key of keys) {
      expect(block(key), `${key}`).toContain('failure: 2,');
    }
  });

  it('uses the FCOM flight phase inhibitions', () => {
    expect(block(701800013)).toContain('flightPhaseInhib: FADEC_FAULT_PHASE_INHIBITION,');
    expect(block(701800130)).toContain('flightPhaseInhib: THR_LEVER_FAULT_PHASE_INHIBITION,');
    expect(block(701800149)).toContain('flightPhaseInhib: REVERSER_UNLOCKED_PHASE_INHIBITION,');
    expect(block(701800154)).toContain('flightPhaseInhib: REVERSER_SELECTED_PHASE_INHIBITION,');
  });
});
