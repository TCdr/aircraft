// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FM_GPS_POS_DISAGREE_PHASE_INHIBITION,
  FmGpsPositionDisagreeAlert,
  isLsTuningDifferent,
  LS_TUNING_DISAGREE_PHASE_INHIBITION,
  LsTuningDisagreeMonitor,
} from './NavPositionAlerts';

describe('NAV FM/GPS POS DISAGREE (A320 FCOM PRO-ABN-NAV)', () => {
  it('follows the FMS condition outside phase 5', () => {
    const alert = new FmGpsPositionDisagreeAlert();
    expect(alert.update(true, 6, 0.1)).toBe(true);
    expect(alert.update(false, 6, 0.1)).toBe(false);
    expect(alert.update(true, 2, 0.1)).toBe(true);
  });

  it('is inhibited for the first 15 s of phase 5 only', () => {
    const alert = new FmGpsPositionDisagreeAlert();
    expect(alert.update(true, 4, 1)).toBe(true); // phase 4 is inhibited by the phase list
    expect(alert.update(true, 5, 1)).toBe(false);
    expect(alert.update(true, 5, 13)).toBe(false);
    expect(alert.update(true, 5, 1.5)).toBe(true);
    // a new phase 5 starts the 15 s again
    alert.update(true, 6, 1);
    expect(alert.update(true, 5, 1)).toBe(false);
  });

  it('is inhibited in the phases of the FCOM figure', () => {
    expect(FM_GPS_POS_DISAGREE_PHASE_INHIBITION).toEqual([1, 3, 4, 8, 10]);
  });
});

describe('NAV LS TUNING DISAGREE (A320 FCOM PRO-ABN-NAV)', () => {
  const ils = { frequency: 109.5, course: 254 };

  it('compares the frequency and the course of the two MMRs', () => {
    expect(isLsTuningDifferent(ils, { ...ils })).toBe(false);
    expect(isLsTuningDifferent(ils, { ...ils, frequency: 110.3 })).toBe(true);
    expect(isLsTuningDifferent(ils, { ...ils, course: 255 })).toBe(true);
    expect(isLsTuningDifferent({ frequency: 108.1, course: 359.8 }, { frequency: 108.1, course: 0.1 })).toBe(false);
    expect(isLsTuningDifferent({ frequency: 108.1, course: 0 }, { frequency: 108.1, course: 180 })).toBe(true);
  });

  it('confirms the difference for 3 s', () => {
    const monitor = new LsTuningDisagreeMonitor();
    const other = { frequency: 110.3, course: 254 };
    expect(monitor.update(ils, other, 1)).toBe(false);
    expect(monitor.update(ils, other, 1.5)).toBe(false);
    expect(monitor.update(ils, other, 0.5)).toBe(true);
    // the same tuning again resets it
    expect(monitor.update(ils, ils, 0.1)).toBe(false);
    expect(monitor.update(ils, other, 2.9)).toBe(false);
  });

  it('is shown in phases 6 and 7 only', () => {
    expect(LS_TUNING_DISAGREE_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 8, 9, 10]);
  });
});
