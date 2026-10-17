// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isRmpNavaidTuningActive } from './RmpNavaidTuning';

/*
 * The FMS hands the navaid tuning over to the RMPs: the A320 RMP NAV keys, and on the A380 RMP 1 or RMP 2 in RAD NAV
 * STBY mode (RMP 3 does not tune navaids). The A380X discretes must take the tuning away from the FMS too.
 */
describe('RMP navaid tuning discretes', () => {
  const reader =
    (set: string[]) =>
    (name: string): number =>
      set.includes(name) ? 1 : 0;

  it('A380X: RMP 1 or RMP 2 in STBY RAD NAV mode', () => {
    expect(isRmpNavaidTuningActive(reader(['L:A380X_RMP_1_STBY_NAV']))).toBe(true);
    expect(isRmpNavaidTuningActive(reader(['L:A380X_RMP_2_STBY_NAV']))).toBe(true);
  });

  it('A380X: RMP 3 does not tune the navaids', () => {
    expect(isRmpNavaidTuningActive(reader(['L:A380X_RMP_3_STBY_NAV']))).toBe(false);
  });

  it('A32NX: the RMP NAV keys, unchanged', () => {
    expect(isRmpNavaidTuningActive(reader(['L:A32NX_RMP_L_NAV_BUTTON_SELECTED']))).toBe(true);
    expect(isRmpNavaidTuningActive(reader(['L:A32NX_RMP_R_NAV_BUTTON_SELECTED']))).toBe(true);
  });

  it('the FMS tunes when no discrete is set', () => {
    expect(isRmpNavaidTuningActive(reader([]))).toBe(false);
  });
});
