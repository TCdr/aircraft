// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  constraintViolationSeconds,
  formatHhmmss,
  parseRtaEntry,
  TimeConstraintType,
  timeErrorSeconds,
} from './TimeConstraint';

describe('timeErrorSeconds', () => {
  it('is ETA - RTA, positive when late', () => {
    expect(timeErrorSeconds(12 * 3600 + 45, 12 * 3600)).toBe(45);
    expect(timeErrorSeconds(12 * 3600 - 45, 12 * 3600)).toBe(-45);
  });

  it('goes the short way across midnight', () => {
    // ETA 00:00:30, RTA 23:59:50: 40 s late, not 23 h early
    expect(timeErrorSeconds(30, 86_390)).toBe(40);
    // ETA 23:59:30, RTA 00:00:10: 40 s early
    expect(timeErrorSeconds(86_370, 10)).toBe(-40);
    // an ETA beyond the day (now + flight time) wraps
    expect(timeErrorSeconds(86_400 + 100, 60)).toBe(40);
  });
});

describe('constraintViolationSeconds', () => {
  it('counts both ways for AT', () => {
    expect(constraintViolationSeconds(50, TimeConstraintType.At)).toBe(50);
    expect(constraintViolationSeconds(-50, TimeConstraintType.At)).toBe(-50);
  });

  it('counts only a late arrival for AT OR BEFORE', () => {
    expect(constraintViolationSeconds(50, TimeConstraintType.AtOrBefore)).toBe(50);
    expect(constraintViolationSeconds(-500, TimeConstraintType.AtOrBefore)).toBe(0);
  });

  it('counts only an early arrival for AT OR AFTER', () => {
    expect(constraintViolationSeconds(500, TimeConstraintType.AtOrAfter)).toBe(0);
    expect(constraintViolationSeconds(-50, TimeConstraintType.AtOrAfter)).toBe(-50);
  });
});

describe('parseRtaEntry', () => {
  it('reads HHMMSS as AT, +HHMMSS as AT OR AFTER, -HHMMSS as AT OR BEFORE', () => {
    expect(parseRtaEntry('124500')).toEqual({ type: TimeConstraintType.At, utcSeconds: 12 * 3600 + 45 * 60 });
    expect(parseRtaEntry('+124500')).toEqual({ type: TimeConstraintType.AtOrAfter, utcSeconds: 45_900 });
    expect(parseRtaEntry('-124510')).toEqual({ type: TimeConstraintType.AtOrBefore, utcSeconds: 45_910 });
  });

  it('accepts HHMM', () => {
    expect(parseRtaEntry('0905')).toEqual({ type: TimeConstraintType.At, utcSeconds: 9 * 3600 + 5 * 60 });
  });

  it('refuses other formats and out of range times', () => {
    expect(parseRtaEntry('2460')).toBeNull();
    expect(parseRtaEntry('250000')).toBeNull();
    expect(parseRtaEntry('12450')).toBeNull();
    expect(parseRtaEntry('*124500')).toBeNull();
    expect(parseRtaEntry('')).toBeNull();
  });
});

describe('formatHhmmss', () => {
  it('formats a time of day, wrapping past midnight', () => {
    expect(formatHhmmss(45_910)).toBe('124510');
    expect(formatHhmmss(86_400 + 61)).toBe('000101');
  });
});
