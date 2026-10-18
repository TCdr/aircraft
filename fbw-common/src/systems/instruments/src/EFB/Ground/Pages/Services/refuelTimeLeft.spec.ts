// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { RefuelTimeLeft } from './refuelTimeLeft';

// The A380X refuelling recorded with GSX: about 49 kg/s from 38 733 kg towards 156 700 kg
const RATE_KG_PER_S = 49;

const pumped = (estimate: RefuelTimeLeft, fromS: number, toS: number, startKg: number) => {
  for (let s = fromS; s <= toS; s++) {
    estimate.update(s * 1000, startKg + (s - fromS) * RATE_KG_PER_S);
  }
};

describe('refuelling time left', () => {
  it('is the fuel still to load at the measured rate, in whole minutes rounded up', () => {
    const estimate = new RefuelTimeLeft();
    pumped(estimate, 0, 30, 38733);

    const nowKg = 38733 + 30 * RATE_KG_PER_S;
    expect(estimate.minutesLeft(nowKg, 156700)).toBe(Math.ceil((156700 - nowKg) / RATE_KG_PER_S / 60));
  });

  it('decreases while the fuel comes in', () => {
    const estimate = new RefuelTimeLeft();
    pumped(estimate, 0, 30, 38733);
    const early = estimate.minutesLeft(38733 + 30 * RATE_KG_PER_S, 156700);
    pumped(estimate, 31, 600, 38733 + 31 * RATE_KG_PER_S);
    const later = estimate.minutesLeft(38733 + 600 * RATE_KG_PER_S, 156700);

    expect(later).toBeLessThan(early!);
  });

  it('follows a rate change within a minute (another tank, a faster refuel setting)', () => {
    const estimate = new RefuelTimeLeft();
    pumped(estimate, 0, 300, 0);
    for (let s = 301; s <= 400; s++) {
      estimate.update(s * 1000, 300 * RATE_KG_PER_S + (s - 300) * RATE_KG_PER_S * 2);
    }

    const nowKg = 300 * RATE_KG_PER_S + 100 * RATE_KG_PER_S * 2;
    expect(estimate.minutesLeft(nowKg, nowKg + RATE_KG_PER_S * 2 * 590)).toBe(10);
  });

  it('has none before a rate is measured, while no fuel comes in, or once the target is reached', () => {
    const estimate = new RefuelTimeLeft();
    expect(estimate.minutesLeft(1000, 5000)).toBeNull();

    estimate.update(0, 1000);
    estimate.update(2000, 1100);
    expect(estimate.minutesLeft(1100, 5000)).toBeNull();

    const stopped = new RefuelTimeLeft();
    for (let s = 0; s <= 30; s++) {
      stopped.update(s * 1000, 1000);
    }
    expect(stopped.minutesLeft(1000, 5000)).toBeNull();

    const full = new RefuelTimeLeft();
    pumped(full, 0, 30, 1000);
    expect(full.minutesLeft(5000, 5000)).toBeNull();
  });

  it('starts over after a reset', () => {
    const estimate = new RefuelTimeLeft();
    pumped(estimate, 0, 30, 1000);
    estimate.reset();

    expect(estimate.minutesLeft(2470, 5000)).toBeNull();
  });
});
