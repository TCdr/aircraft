// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FM_GPS_POS_DISAGREE_PHASE_INHIBITION,
  FwsNavPositionAlerts,
  isLsTuningDifferent,
  LS_TUNING_DISAGREE_PHASE_INHIBITION,
} from './FwsNavPositionAlerts';

const ils = { frequency: 109.5, course: 254 };
const otherIls = { frequency: 110.3, course: 254 };

describe('NAV FM / GPS POS DISAGREE (A380 FCOM PRO-ABN-ECAM-10-34-10)', () => {
  it('follows the FMS condition', () => {
    const alerts = new FwsNavPositionAlerts();
    alerts.update(0.1, true, ils, ils);
    expect(alerts.fmGpsPosDisagree.get()).toBe(true);
    alerts.update(0.1, false, ils, ils);
    expect(alerts.fmGpsPosDisagree.get()).toBe(false);
  });

  it('is inhibited in the phases of the FCOM figure', () => {
    expect(FM_GPS_POS_DISAGREE_PHASE_INHIBITION).toEqual([1, 3, 4, 5, 6, 12]);
  });
});

describe('NAV LS TUNING DISAGREE (A380 FCOM PRO-ABN-ECAM-10-34-10)', () => {
  it('compares the frequency and the course of the two MMRs', () => {
    expect(isLsTuningDifferent(ils, { ...ils })).toBe(false);
    expect(isLsTuningDifferent(ils, otherIls)).toBe(true);
    expect(isLsTuningDifferent(ils, { ...ils, course: 253 })).toBe(true);
    expect(isLsTuningDifferent({ frequency: 108.1, course: 359.9 }, { frequency: 108.1, course: 0.2 })).toBe(false);
  });

  it('confirms the difference for 3 s and resets when the tuning agrees again', () => {
    const alerts = new FwsNavPositionAlerts();
    alerts.update(2, false, ils, otherIls);
    expect(alerts.lsTuningDisagree.get()).toBe(false);
    alerts.update(1, false, ils, otherIls);
    expect(alerts.lsTuningDisagree.get()).toBe(true);
    alerts.update(0.1, false, ils, ils);
    expect(alerts.lsTuningDisagree.get()).toBe(false);
    alerts.update(2.9, false, ils, otherIls);
    expect(alerts.lsTuningDisagree.get()).toBe(false);
  });

  it('is shown in phases 8 and 9 only', () => {
    expect(LS_TUNING_DISAGREE_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
  });
});
