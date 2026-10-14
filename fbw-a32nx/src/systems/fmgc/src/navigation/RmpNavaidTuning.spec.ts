// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isRmpNavaidTuningActive } from './RmpNavaidTuning';

/*
 * The FMS hands the navaid tuning over to the RMPs. A380 FCOM DSC-34-10-60-10 Standby RadNav (a380_fcom.txt
 * l.86641-86649): RMP 1 or RMP 2 in RAD NAV STBY mode tune the navaids, RMP 3 does not. Before, the FMS (NavaidTuner)
 * only read the A320 RMP NAV keys, so the A380X STBY RAD NAV mode never took the tuning away from the FMS.
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
