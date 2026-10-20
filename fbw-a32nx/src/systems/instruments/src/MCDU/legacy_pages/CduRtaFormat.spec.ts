// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { TimeConstraintType } from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { formatRta, formatRtaError, formatTimeOfDay } from './CduRtaFormat';

describe('the RTA page formats', () => {
  it('shows the RTA as -HH:MM:SS AT OR BEFORE, +HH:MM:SS AT OR AFTER, HH:MM:SS AT', () => {
    const rta = { ident: 'KONAN', databaseId: 'W    KONAN', utcSeconds: 45_910 };
    expect(formatRta({ ...rta, type: TimeConstraintType.At })).toBe('12:45:10');
    expect(formatRta({ ...rta, type: TimeConstraintType.AtOrBefore })).toBe('-12:45:10');
    expect(formatRta({ ...rta, type: TimeConstraintType.AtOrAfter })).toBe('+12:45:10');
  });

  it('shows the RTA ERROR as the signed time error', () => {
    expect(formatRtaError(75)).toBe('+01:15');
    expect(formatRtaError(-42)).toBe('-00:42');
    expect(formatRtaError(10_000)).toBe('+99:59');
  });
});

describe('the RTA page times', () => {
  it('are HH:MM:SS', () => {
    expect(formatTimeOfDay(10 * 3600 + 12 * 60 + 36)).toBe('10:12:36');
  });
});
