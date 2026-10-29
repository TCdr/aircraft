// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  adirsSummary,
  aircraftStateChip,
  jetBridgeMovedByFlypad,
  jetBridgeStatus,
  openDoors,
  PowerInput,
  powerSource,
} from './aircraftState';

describe('powerSource', () => {
  const input = (overrides: Partial<PowerInput>): PowerInput => ({
    acPowered: true,
    extPwrOnline: 0,
    extPwrAvailable: 0,
    apuGenOnline: false,
    engineRunning: false,
    batteryBusPowered: true,
    ...overrides,
  });

  it('follows the network priority: engines, external power, APU', () => {
    expect(powerSource(input({ engineRunning: true, extPwrOnline: 1, apuGenOnline: true }))).toBe('engineGen');
    expect(powerSource(input({ extPwrOnline: 1, apuGenOnline: true }))).toBe('extPwr');
    expect(powerSource(input({ apuGenOnline: true }))).toBe('apu');
  });

  it('is the battery or off without AC power', () => {
    expect(powerSource(input({ acPowered: false, extPwrOnline: 1 }))).toBe('battery');
    expect(powerSource(input({ acPowered: false, batteryBusPowered: false }))).toBe('off');
  });
});

describe('aircraftStateChip', () => {
  it('tells cold and dark, powered and engines running apart', () => {
    expect(aircraftStateChip(false, false)).toBe('coldDark');
    expect(aircraftStateChip(true, false)).toBe('powered');
    expect(aircraftStateChip(true, true)).toBe('enginesRunning');
  });
});

describe('openDoors', () => {
  it('lists the doors that are not fully closed', () => {
    expect(
      openDoors([
        { name: '1L', openFraction: 1 },
        { name: '1R', openFraction: 0 },
        { name: 'CARGO', openFraction: 0.3 },
      ]),
    ).toEqual(['1L', 'CARGO']);
  });
});

describe('adirsSummary', () => {
  it('is aligned only when every ADIRU is', () => {
    expect(adirsSummary([2, 2, 2], [1, 1, 1], 0)).toEqual({ state: 'aligned', minutesLeft: null });
    expect(adirsSummary([2, 1, 2], [1, 1, 1], 400)).toEqual({ state: 'aligning', minutesLeft: 7 });
  });

  it('is off when no ADIRU aligns', () => {
    expect(adirsSummary([0, 0, 0], [0, 0, 0], 0)).toEqual({ state: 'off', minutesLeft: null });
    expect(adirsSummary([], [], 0).state).toBe('off');
  });

  it('ignores the aligned state of an IR whose mode selector is not at NAV', () => {
    // Instant align time reports every ADIRU aligned, knobs at OFF included
    expect(adirsSummary([2, 2, 2], [0, 0, 0], 0)).toEqual({ state: 'off', minutesLeft: null });
    expect(adirsSummary([2, 2, 2], [1, 1, 0], 0).state).toBe('off');
    expect(adirsSummary([2, 2, 2], [1, 2, 1], 0).state).toBe('off');
  });
});

describe('jetBridgeStatus', () => {
  it('is hidden until the flyPad moved the jet bridge', () => {
    expect(jetBridgeStatus(2, false)).toBeNull();
    expect(jetBridgeStatus(4, false)).toBeNull();
  });

  it('follows the Services page button once moved', () => {
    expect(jetBridgeStatus(3, true)).toBe('moving');
    expect(jetBridgeStatus(4, true)).toBe('connected');
    // released: the page goes back to its inactive state
    expect(jetBridgeStatus(2, true)).toBe('notConnected');
  });

  it('counts called and active as moved by the flyPad', () => {
    expect(jetBridgeMovedByFlypad(3)).toBe(true);
    expect(jetBridgeMovedByFlypad(4)).toBe(true);
    expect(jetBridgeMovedByFlypad(1)).toBe(false);
  });
});
