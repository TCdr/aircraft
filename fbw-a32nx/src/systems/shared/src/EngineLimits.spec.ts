// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  ExceedanceMemory,
  ThrustLimitType,
  egtAmberLimit,
  egtColor,
  isGroundStartSequence,
  n1Color,
  n2Color,
} from './EngineLimits';

describe('EWD engine limits (EGT: CFM56-5B TCDS values confirmed in the sim; N1, N2: FCOM DSC-70-90-40)', () => {
  it('has the EGT amber limit of the thrust limit type: 940 °C at TOGA/FLX, 905 °C at CLB/MCT/MREV, 725 °C otherwise', () => {
    expect(egtAmberLimit(ThrustLimitType.Toga)).toBe(940);
    expect(egtAmberLimit(ThrustLimitType.Flex)).toBe(940);
    expect(egtAmberLimit(ThrustLimitType.Clb)).toBe(905);
    expect(egtAmberLimit(ThrustLimitType.Mct)).toBe(905);
    expect(egtAmberLimit(ThrustLimitType.Mrev)).toBe(905);
    expect(egtAmberLimit(ThrustLimitType.None)).toBe(725);
  });

  it('colours the EGT amber above the amber limit and red above 975 °C (35 °C above the takeoff limit)', () => {
    expect(egtColor(900, 905)).toBe('Green');
    expect(egtColor(910, 905)).toBe('Amber');
    expect(egtColor(975, 940)).toBe('Amber');
    expect(egtColor(976, 940)).toBe('Red');
  });

  it('colours the N1 amber above the N1 limit and red above 104 %', () => {
    expect(n1Color(85, 95)).toBe('Green');
    expect(n1Color(96, 95)).toBe('Amber');
    // the thrust loop overshoot at TOGA stays green
    expect(n1Color(95.3, 95)).toBe('Green');
    expect(n1Color(104.1, 95)).toBe('Red');
  });

  it('colours the N2 red above 105 %', () => {
    expect(n2Color(100)).toBe('Green');
    expect(n2Color(105.2)).toBe('Red');
  });

  it('keeps the highest value once the red limit is exceeded, until the next ground start sequence', () => {
    const memory = new ExceedanceMemory(975);
    memory.update(940, false);
    expect(memory.exceeded).toBe(false);

    memory.update(980, false);
    memory.update(960, false);
    memory.update(900, false);
    expect(memory.exceeded).toBe(true);
    expect(memory.highestValue).toBe(980);

    // an in-flight relight does not reset it
    memory.update(500, isGroundStartSequence(3, false));
    expect(memory.exceeded).toBe(true);

    memory.update(400, isGroundStartSequence(2, true));
    expect(memory.exceeded).toBe(false);
  });
});
