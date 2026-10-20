// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { formatOptStepLine } from './A320OptimumStep';

const target = {
  fromAltitude: 33_000,
  toAltitude: 37_000,
  currentStepDistance: null,
  nextStepDistance: null,
  stepLegIndex: null,
  isOptimum: false,
};
const optimum = { distance: 900, fuelSaving: 1_000, timeSaving: 120 };
const formatFuel = (pounds: number) => (pounds / 1000).toFixed(1);

describe('A320 STEP ALTS OPT STEP line', () => {
  it('proposes the optimum step point with its savings', () => {
    expect(formatOptStepLine(false, { target, optimum }, false, formatFuel)).toEqual({
      label: ['', 'TIME/FUEL'],
      data: ['{cyan}*(OPT)\xa0TO\xa0FL370{end}', '{green}2/1.0{end}'],
    });
  });

  it('is frozen while a time constraint exists in the flight plan', () => {
    const frozen = { label: [''], data: ['(OPT) FROZEN: RTA EXISTS'] };
    expect(formatOptStepLine(false, { target, optimum }, true, formatFuel)).toEqual(frozen);
    expect(formatOptStepLine(true, null, true, formatFuel)).toEqual(frozen);
    expect(formatOptStepLine(false, null, true, formatFuel)).toEqual(frozen);
  });

  it('guides the entry without a step, and shows when no optimum exists', () => {
    expect(formatOptStepLine(false, null, false, formatFuel).data).toEqual([
      '{small}OPT STEP:{end}',
      '{small}ENTER ALT ONLY{end}',
    ]);
    expect(formatOptStepLine(true, { target, optimum: null }, false, formatFuel).data).toEqual(['NO OPTIMAL STEP']);
  });
});
