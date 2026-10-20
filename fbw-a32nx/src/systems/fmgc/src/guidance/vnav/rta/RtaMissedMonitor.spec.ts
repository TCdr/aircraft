// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320_RTA_TOLERANCE, A380_RTA_TOLERANCE, RtaMissedMonitor, rtaTolerances } from './RtaMissedMonitor';

describe('rtaTolerances', () => {
  it('A380: 30 s / 15 s up to 2 000 NM, then 60 s more per 1 000 NM', () => {
    expect(rtaTolerances(A380_RTA_TOLERANCE, 1500)).toEqual({ missedAboveSeconds: 30, madeBelowSeconds: 15 });
    expect(rtaTolerances(A380_RTA_TOLERANCE, 3000)).toEqual({ missedAboveSeconds: 90, madeBelowSeconds: 75 });
  });

  it('A320: 30 s at any distance', () => {
    expect(rtaTolerances(A320_RTA_TOLERANCE, 4000)).toEqual({ missedAboveSeconds: 30, madeBelowSeconds: 30 });
  });
});

describe('RtaMissedMonitor', () => {
  it('A380: missed above 30 s, stays missed until below 15 s', () => {
    const monitor = new RtaMissedMonitor(A380_RTA_TOLERANCE);
    expect(monitor.update(29, 100)).toBe(false);
    expect(monitor.update(31, 100)).toBe(true);
    expect(monitor.update(20, 100)).toBe(true);
    expect(monitor.update(-16, 100)).toBe(true);
    expect(monitor.update(14, 100)).toBe(false);
  });

  it('A380: the tolerance grows with the distance to the waypoint', () => {
    const monitor = new RtaMissedMonitor(A380_RTA_TOLERANCE);
    expect(monitor.update(80, 3000)).toBe(false);
    expect(monitor.update(80, 1000)).toBe(true);
  });

  it('A320: missed and made at 30 s', () => {
    const monitor = new RtaMissedMonitor(A320_RTA_TOLERANCE);
    expect(monitor.update(-31, 100)).toBe(true);
    expect(monitor.update(29, 100)).toBe(false);
  });
});
