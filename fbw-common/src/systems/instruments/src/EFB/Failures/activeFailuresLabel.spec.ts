// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { activeFailuresLabel, failuresCountLabel } from './activeFailuresLabel';

const english: Record<string, string> = {
  'Failures.ActiveFailure': 'active failure',
  'Failures.ActiveFailures': 'active failures',
  'Failures.Failure': 'failure',
  'Failures.Failures': 'failures',
};
const translate = (key: string) => english[key] ?? key;

describe('activeFailuresLabel', () => {
  it('uses the singular for one active failure', () => {
    expect(activeFailuresLabel(1, translate)).toBe('1 active failure');
  });

  it('uses the plural for more than one active failure', () => {
    expect(activeFailuresLabel(2, translate)).toBe('2 active failures');
    expect(activeFailuresLabel(12, translate)).toBe('12 active failures');
  });
});

describe('failuresCountLabel', () => {
  it('uses the singular for a chapter with one failure', () => {
    expect(failuresCountLabel(1, translate)).toBe('1 failure');
  });

  it('uses the plural otherwise', () => {
    expect(failuresCountLabel(0, translate)).toBe('0 failures');
    expect(failuresCountLabel(7, translate)).toBe('7 failures');
  });
});
