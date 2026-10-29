// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DisplayUnitID, ALL_DISPLAY_UNITS } from './CdsDisplayUnits';
import { DISPLAY_UNIT_POWER_UP_SLOT_SECONDS, POWER_UP_SLOT_SECONDS, PowerUpGate } from './PowerUpStagger';

describe('power-up slots', () => {
  const inOrder = [
    'CaptPfd',
    'FoPfd',
    'CaptNd',
    'FoNd',
    'Ewd',
    'Sd',
    'CaptMfd',
    'FoMfd',
    'Rmp1',
    'Rmp2',
    'Rmp3',
    'CaptOit',
    'FoOit',
    'Isis1',
    'Isis2',
  ] as const;

  it('gives every powered unit its own slot, in the power-up order', () => {
    expect(Object.keys(POWER_UP_SLOT_SECONDS)).toHaveLength(inOrder.length);
    const slots = inOrder.map((unit) => POWER_UP_SLOT_SECONDS[unit]);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('starts at once and ends within 4 s', () => {
    expect(POWER_UP_SLOT_SECONDS.CaptPfd).toBe(0);
    expect(POWER_UP_SLOT_SECONDS.Isis2).toBeLessThanOrEqual(4);
  });

  it('covers every CDS display unit', () => {
    for (const unit of ALL_DISPLAY_UNITS) {
      expect(DISPLAY_UNIT_POWER_UP_SLOT_SECONDS[unit]).toBeGreaterThanOrEqual(0);
    }
    expect(DISPLAY_UNIT_POWER_UP_SLOT_SECONDS[DisplayUnitID.Ewd]).toBe(POWER_UP_SLOT_SECONDS.Ewd);
  });
});

describe('PowerUpGate', () => {
  it('makes a unit wait from the moment its supply appears', () => {
    const gate = new PowerUpGate(1);
    expect(gate.update(false, 10)).toBe(0);
    expect(gate.update(true, 20)).toBe(1);
    expect(gate.update(true, 20.4)).toBeCloseTo(0.6);
    expect(gate.update(true, 21)).toBe(0);
  });

  it('does not make a unit wait that was supplied long ago', () => {
    const gate = new PowerUpGate(3);
    gate.update(true, 0);
    expect(gate.update(true, 100)).toBe(0);
  });

  it('starts again after a power loss', () => {
    const gate = new PowerUpGate(2);
    gate.update(true, 0);
    gate.update(false, 5);
    expect(gate.update(true, 6)).toBe(2);
  });
});
