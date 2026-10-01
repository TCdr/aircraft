// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { directToEtaSeconds, formatUtc } from './DirectToEta';

describe('DIR TO time of arrival estimate', () => {
  it('adds the time at the ground speed to the UTC, in whole minutes', () => {
    // 100 NM at 400 kt = 15 min from 10:00:30
    expect(directToEtaSeconds(100, 400, 10 * 3600 + 30)).toBe(10 * 3600 + 15 * 60);
  });

  it('wraps past midnight', () => {
    expect(directToEtaSeconds(200, 400, 23 * 3600 + 45 * 60)).toBe(15 * 60);
  });

  it('is not estimated on the ground or without a distance', () => {
    expect(directToEtaSeconds(100, 10, 3600)).toBeNull();
    expect(directToEtaSeconds(null, 400, 3600)).toBeNull();
  });

  it('formats HH:MM', () => {
    expect(formatUtc(11 * 3600 + 17 * 60)).toBe('11:17');
    expect(formatUtc(5 * 60)).toBe('00:05');
    expect(formatUtc(null)).toBe('--:--');
  });
});
