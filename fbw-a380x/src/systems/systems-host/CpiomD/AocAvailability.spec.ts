// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isAocAvailable } from './AocAvailability';

const atsu = readFileSync(resolve(__dirname, 'atsu.ts'), 'utf-8');

describe('A380X AOC availability (COM NSS/AVNCS DATA XFR FAULT, A380 FCOM l.169942-169947)', () => {
  it('runs with AC BUS 1 powered and at least one SCI', () => {
    expect(isAocAvailable(true, [false, false])).toBe(true);
    expect(isAocAvailable(true, [true, false])).toBe(true);
    expect(isAocAvailable(true, [false, true])).toBe(true);
  });

  it('stops without AC BUS 1 or with both SCIs lost', () => {
    expect(isAocAvailable(false, [false, false])).toBe(false);
    expect(isAocAvailable(true, [true, true])).toBe(false);
  });

  it('the ATSU powers the AOC from the SCI failures', () => {
    expect(atsu).toContain('[A380Failure.Sci1, A380Failure.Sci2]');
    expect(atsu).toContain('isAocAvailable(this.acBus1Powered, this.sciFailed)');
  });
});
