// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { areAocDownlinksInhibited, isAocAvailable } from './AocAvailability';

const atsu = readFileSync(resolve(__dirname, 'atsu.ts'), 'utf-8');

describe('A380X AOC availability (COM NSS/AVNCS DATA XFR FAULT)', () => {
  it('runs on either NSS AVNCS ANSU with at least one SCI', () => {
    expect(isAocAvailable([true, true], [false, false])).toBe(true);
    expect(isAocAvailable([false, true], [false, false])).toBe(true);
    expect(isAocAvailable([true, false], [true, false])).toBe(true);
    expect(isAocAvailable([true, true], [false, true])).toBe(true);
  });

  it('stops with both NSS AVNCS ANSUs lost or with both SCIs lost', () => {
    expect(isAocAvailable([false, false], [false, false])).toBe(false);
    expect(isAocAvailable([true, true], [true, true])).toBe(false);
  });

  it('the ATSU powers the AOC from the ANSUs and the SCI failures, no more from AC BUS 1', () => {
    expect(atsu).toContain('[A380Failure.Sci1, A380Failure.Sci2]');
    expect(atsu).toContain('isAocAvailable(this.nssAvncsAnsuHealthy, this.sciFailed)');
    expect(atsu).not.toContain('acBus1');
  });
});

describe('NSS DATA TO AVNCS pb-sw OFF', () => {
  it('inhibits the AOC downlinks only while OFF', () => {
    expect(areAocDownlinksInhibited(true)).toBe(true);
    expect(areAocDownlinksInhibited(false)).toBe(false);
  });

  it('the ATSU feeds the pb-sw state to the AOC', () => {
    expect(atsu).toContain('this.aoc.setDownlinksInhibited(');
  });
});
