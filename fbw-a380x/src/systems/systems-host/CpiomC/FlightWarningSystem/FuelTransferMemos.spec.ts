// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FuelTransferMemoInputs, fuelTransferMemos, TankOutflowMonitor } from './FuelTransferMemos';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const memos = readFileSync(resolve(__dirname, 'FwsMemos.ts'), 'utf-8');

/** The source of one memo entry, from its id to the end of its object */
function memoBlock(id: string): string {
  const start = memos.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return memos.slice(start, memos.indexOf('\n    },', start));
}

const steady: FuelTransferMemoInputs = {
  trimTankOutflow: false,
  outerTanksOutflow: false,
  trimTankKg: 10000,
  outerTanksKg: 8000,
  jettisonInProgress: false,
  fuelingInProgress: false,
  groundTransferInProgress: false,
};

describe('TankOutflowMonitor', () => {
  it('detects fuel leaving the tank over a 10 s window', () => {
    const monitor = new TankOutflowMonitor();
    expect(monitor.update(1000, 1)).toBe(false);
    // 2 kg/s: 20 kg over the window
    for (let s = 1; s < 10; s++) {
      expect(monitor.update(1000 - 2 * s, 1)).toBe(false);
    }
    expect(monitor.update(980, 1)).toBe(true);
    // the tank stops emptying: false after the next complete window
    for (let s = 1; s < 10; s++) {
      expect(monitor.update(980, 1)).toBe(true);
    }
    expect(monitor.update(980, 1)).toBe(false);
  });

  it('ignores a small drift and fuel coming in', () => {
    const monitor = new TankOutflowMonitor();
    monitor.update(1000, 1);
    expect(monitor.update(997, 10)).toBe(false);
    expect(monitor.update(1500, 10)).toBe(false);
  });
});

describe('fuel transfer memos', () => {
  it('FWD XFR IN PROGRESS and OUTR TK XFR IN PROG while fuel leaves the trim (outer) tanks', () => {
    expect(fuelTransferMemos({ ...steady, trimTankOutflow: true }).fwdXfrInProgress).toBe(true);
    expect(fuelTransferMemos({ ...steady, outerTanksOutflow: true }).outerTankXfrInProgress).toBe(true);
    expect(fuelTransferMemos(steady).fwdXfrInProgress).toBe(false);
  });

  it('not during a jettison or a refuel/defuel (their own memos)', () => {
    const flowing = { ...steady, trimTankOutflow: true, outerTanksOutflow: true };
    expect(fuelTransferMemos({ ...flowing, jettisonInProgress: true }).fwdXfrInProgress).toBe(false);
    expect(fuelTransferMemos({ ...flowing, fuelingInProgress: true }).outerTankXfrInProgress).toBe(false);
  });

  it('GND XFR IN PROGRESS during the automatic ground transfer, which is no FWD XFR or OUTR TK XFR', () => {
    const groundTransfer = {
      ...steady,
      trimTankOutflow: true,
      outerTanksOutflow: true,
      groundTransferInProgress: true,
    };
    expect(fuelTransferMemos(groundTransfer).gndXfrInProgress).toBe(true);
    expect(fuelTransferMemos(groundTransfer).fwdXfrInProgress).toBe(false);
    expect(fuelTransferMemos(groundTransfer).outerTankXfrInProgress).toBe(false);
    expect(fuelTransferMemos(steady).gndXfrInProgress).toBe(false);
  });

  it('OUTR TKs XFRD and TRIM TK XFRD when the tanks are empty', () => {
    expect(fuelTransferMemos({ ...steady, outerTanksKg: 0.2 }).outerTanksXfrd).toBe(true);
    expect(fuelTransferMemos({ ...steady, trimTankKg: 0 }).trimTankXfrd).toBe(true);
    expect(fuelTransferMemos(steady).outerTanksXfrd).toBe(false);
    expect(fuelTransferMemos(steady).trimTankXfrd).toBe(false);
  });

  it.each([
    ['280000004', 'fwdXfrInProgress', '[]'],
    ['280000007', 'outerTankXfrInProgress', '[]'],
    ['280000008', 'outerTanksXfrd', '[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]'],
    ['280000012', 'trimTankXfrd', '[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]'],
    ['280000005', 'gndXfrInProgress', '[3, 4, 5, 6, 7, 8, 9, 10]'],
  ])('memo %s is wired to %s with the flight phase inhibition %s', (id, subject, phases) => {
    const block = memoBlock(id);
    expect(block).toContain(`simVarIsActive: this.fws.${subject},`);
    expect(block).toContain(`flightPhaseInhib: ${phases},`);
    expect(block).toContain(`codesToReturn: ['${id}'],`);
  });
});
