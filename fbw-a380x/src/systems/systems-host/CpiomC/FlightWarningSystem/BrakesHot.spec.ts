// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isAnyBrakeHot, readReportedBrakeTemperaturesC } from './BrakesHot';
import { createFws, runFwsCycle } from './FwsSpecFixture';

describe('BRAKES HOT from the reported brake temperatures', () => {
  const temps = (hot: number) => Array.from({ length: 16 }, (_, i) => (i === 7 ? hot : 150));

  it('is off with all brakes at 150 °C', () => {
    expect(isAnyBrakeHot(temps(150))).toBe(false);
  });

  it('is on with one brake at 300 °C (equal to, or higher)', () => {
    expect(isAnyBrakeHot(temps(300))).toBe(true);
  });

  it('is off with one brake at 299 °C', () => {
    expect(isAnyBrakeHot(temps(299))).toBe(false);
  });

  it('reads the 16 reported brake temperatures', () => {
    const names: string[] = [];
    readReportedBrakeTemperaturesC((name) => {
      names.push(name);
      return 0;
    });
    expect(names).toHaveLength(16);
    expect(names[0]).toBe('L:A32NX_REPORTED_BRAKE_TEMPERATURE_1');
    expect(names[15]).toBe('L:A32NX_REPORTED_BRAKE_TEMPERATURE_16');
  });

  it('the FWS raises BRAKES HOT from the reported temperatures, not from L:A32NX_BRAKES_HOT', () => {
    const { core, simVars } = createFws(new Set());
    simVars.set('L:A32NX_BRAKES_HOT', 1);
    runFwsCycle(core);
    expect(core.brakesHot.get()).toBe(false);
    simVars.set('L:A32NX_REPORTED_BRAKE_TEMPERATURE_16', 600);
    runFwsCycle(core);
    expect(core.brakesHot.get()).toBe(true);
  });
});
