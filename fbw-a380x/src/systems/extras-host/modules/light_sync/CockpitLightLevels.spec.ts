// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';

import { cockpitLightLevels } from './CockpitLightLevels';

const APRON = 2;
const RUNWAY = 4;
const CRUISE = 6;

// The automatic brightness is clamped to [15, 85] by LightSync
const DAY = 85;
const DUSK = 60;
const NIGHT = 15;

describe('cockpitLightLevels', () => {
  it('leaves every light off in daylight', () => {
    expect(cockpitLightLevels(DAY, APRON)).toEqual({ integral: 0, mainPanelFlood: 0, pedestalFlood: 0, ambient: 0 });
  });

  it('lights the panels at dusk, when the brightness is still above 50', () => {
    const levels = cockpitLightLevels(DUSK, CRUISE);
    expect(levels.integral).toBeGreaterThan(0);
    expect(levels.mainPanelFlood).toBeGreaterThan(0);
    expect(levels.pedestalFlood).toBeGreaterThan(0);
  });

  it('sets usable night levels with the main panel and pedestal floods clearly on', () => {
    const levels = cockpitLightLevels(NIGHT, CRUISE);
    expect(levels.integral).toBeGreaterThanOrEqual(50);
    expect(levels.mainPanelFlood).toBeGreaterThanOrEqual(50);
    expect(levels.pedestalFlood).toBeGreaterThanOrEqual(40);
  });

  it('gets brighter as it gets darker', () => {
    const dusk = cockpitLightLevels(DUSK, APRON);
    const night = cockpitLightLevels(NIGHT, APRON);
    expect(night.integral).toBeGreaterThan(dusk.integral);
    expect(night.mainPanelFlood).toBeGreaterThan(dusk.mainPanelFlood);
    expect(night.pedestalFlood).toBeGreaterThan(dusk.pedestalFlood);
    expect(night.ambient).toBeGreaterThan(dusk.ambient);
  });

  it('keeps the ambient light modest and only on for a parked start', () => {
    const parked = cockpitLightLevels(NIGHT, APRON);
    expect(parked.ambient).toBeGreaterThan(0);
    expect(parked.ambient).toBeLessThan(parked.mainPanelFlood);
    expect(cockpitLightLevels(NIGHT, RUNWAY).ambient).toBe(0);
    expect(cockpitLightLevels(NIGHT, CRUISE).ambient).toBe(0);
  });

  it('stays within the knob range', () => {
    for (let brightness = 0; brightness <= 100; brightness += 5) {
      const levels = cockpitLightLevels(brightness, APRON);
      for (const level of [levels.integral, levels.mainPanelFlood, levels.pedestalFlood, levels.ambient]) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(100);
      }
    }
  });
});
