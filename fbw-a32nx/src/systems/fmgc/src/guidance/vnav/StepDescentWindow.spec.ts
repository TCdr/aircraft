// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isStepDescentInitiation } from './StepDescentWindow';

describe('step descent initiation (FCOM DSC-22_20-60-100, PRO-NOR-SRP-01-50)', () => {
  it('initiates the step descent when reaching the step point (STEP AHEAD, less than 20 NM)', () => {
    expect(isStepDescentInitiation(12)).toBe(true);
    expect(isStepDescentInitiation(0)).toBe(true);
  });

  it('lets the descent phase start when the step descent is further ahead', () => {
    expect(isStepDescentInitiation(20)).toBe(false);
    expect(isStepDescentInitiation(85)).toBe(false);
  });

  it('lets the descent phase start without a step descent', () => {
    expect(isStepDescentInitiation(undefined)).toBe(false);
  });
});
