// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { AtsuParts, AtsuPowerSwitch, atsuRunStates } from './AtsuFailureStates';

/** Records the power transitions */
class TestParts implements AtsuParts {
  public readonly calls: string[] = [];

  powerUpAtsu(): void {
    this.calls.push('up atsu');
  }

  powerDownAtsu(): void {
    this.calls.push('down atsu');
  }

  powerUpAoc(): void {
    this.calls.push('up aoc');
  }

  powerDownAoc(): void {
    this.calls.push('down aoc');
  }
}

/* The flyPad ATSU failures (A320 FCOM PRO-ABN-DATALINK, a320_fcom.txt l.74467-74531) */
describe('ATSU failures', () => {
  it('the supplied ATSU runs its router, ATC and AOC functions', () => {
    expect(atsuRunStates({ acBus1Powered: true, atsuFailed: false, aocFailed: false })).toEqual({
      atsuRunning: true,
      aocRunning: true,
    });
    expect(atsuRunStates({ acBus1Powered: false, atsuFailed: false, aocFailed: false })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
  });

  it('the failed ATSU stops everything, the failed AOC function stops the company datalink only', () => {
    expect(atsuRunStates({ acBus1Powered: true, atsuFailed: true, aocFailed: false })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
    expect(atsuRunStates({ acBus1Powered: true, atsuFailed: false, aocFailed: true })).toEqual({
      atsuRunning: true,
      aocRunning: false,
    });
  });

  it('powers the parts up and down on the changes only, the AOC after the router up and before it down', () => {
    const parts = new TestParts();
    const power = new AtsuPowerSwitch(parts);

    // first update without supply: everything down, as the former AC BUS 1 handler
    power.update({ atsuRunning: false, aocRunning: false });
    expect(parts.calls).toEqual(['down aoc', 'down atsu']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: true });
    power.update({ atsuRunning: true, aocRunning: true });
    expect(parts.calls).toEqual(['up atsu', 'up aoc']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: false });
    expect(parts.calls).toEqual(['down aoc']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: true });
    power.update({ atsuRunning: false, aocRunning: false });
    expect(parts.calls).toEqual(['up aoc', 'down aoc', 'down atsu']);
  });

  it('the systems-host ATSU applies them with its flyPad failures', () => {
    const atsu = readFileSync(resolve(__dirname, 'atsu.ts'), 'utf-8');
    expect(atsu).toContain('atsuFailed: this.failuresConsumer.isActive(A320Failure.Atsu),');
    expect(atsu).toContain('aocFailed: this.failuresConsumer.isActive(A320Failure.AtsuAoc),');
    expect(atsu).toContain('this.updatePower();');
  });
});
