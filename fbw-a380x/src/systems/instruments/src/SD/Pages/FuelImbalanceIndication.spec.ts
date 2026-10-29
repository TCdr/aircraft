// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { WING_IMBALANCE_KG, WingImbalanceIndication, WingImbalanceInputs } from './FuelImbalanceIndication';

function inputs(over: Partial<WingImbalanceInputs> = {}): WingImbalanceInputs {
  return {
    onGround: true,
    fuelingInProgress: false,
    feedKg: [20_000, 20_000, 20_000, 20_000],
    innerKg: [30_000, 30_000],
    midKg: [25_000, 25_000],
    outerKg: [5_000, 5_000],
    ...over,
  };
}

describe('FUEL SD wing imbalance underlines', () => {
  it('underlines nothing when balanced', () => {
    const r = new WingImbalanceIndication().update(inputs());
    expect(r.feed).toEqual([false, false, false, false]);
    expect([r.inner, r.mid, r.outer]).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]);
  });

  it('underlines feed tanks 1 and 4 more than 6 600 lb apart on ground', () => {
    const r = new WingImbalanceIndication().update(inputs({ feedKg: [23_100, 20_000, 20_000, 20_000] }));
    expect(WING_IMBALANCE_KG.feed).toBeCloseTo(2_993.7, 1);
    expect(r.feed).toEqual([true, false, false, true]);
  });

  it('underlines the inner, mid and outer pairs on ground at their own thresholds', () => {
    const r = new WingImbalanceIndication().update(
      inputs({ innerKg: [33_100, 30_000], midKg: [27_600, 25_000], outerKg: [6_200, 5_000] }),
    );
    expect(r.inner).toEqual([true, true]);
    expect(r.mid).toEqual([true, true]);
    expect(r.outer).toEqual([true, true]);
  });

  it('underlines nothing while fueling', () => {
    const r = new WingImbalanceIndication().update(
      inputs({ fuelingInProgress: true, feedKg: [30_000, 20_000, 20_000, 20_000] }),
    );
    expect(r.feed).toEqual([false, false, false, false]);
  });

  it('in flight, keeps a feed pair underlined until the lighter tank is no longer lighter', () => {
    const indication = new WingImbalanceIndication();
    expect(indication.update(inputs({ onGround: false, feedKg: [20_000, 23_100, 20_000, 20_000] })).feed).toEqual([
      false,
      true,
      true,
      false,
    ]);
    // Still underlined below the threshold: tank 3 is lighter
    expect(indication.update(inputs({ onGround: false, feedKg: [20_000, 21_000, 20_000, 20_000] })).feed).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(indication.update(inputs({ onGround: false, feedKg: [20_000, 20_000, 20_000, 20_000] })).feed).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('in flight, ignores the inner, mid and outer tanks', () => {
    const r = new WingImbalanceIndication().update(inputs({ onGround: false, outerKg: [9_000, 5_000] }));
    expect(r.outer).toEqual([false, false]);
  });
});
