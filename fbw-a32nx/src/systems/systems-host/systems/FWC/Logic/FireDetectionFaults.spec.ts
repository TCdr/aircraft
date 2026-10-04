// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { fireDetectionFaultAlerts } from './FireDetectionFaults';

describe('ENG 1(2) / APU fire detection fault cautions (A320 FCOM DSC-26-20-10, PRO-ABN-ENG, PRO-ABN-APU)', () => {
  it('shows no caution with both loops healthy', () => {
    expect(fireDetectionFaultAlerts(false, false, false)).toEqual({
      loopAFault: false,
      loopBFault: false,
      detectionFault: false,
    });
  });

  it('shows FIRE LOOP A FAULT when only loop A is failed', () => {
    expect(fireDetectionFaultAlerts(true, false, false)).toEqual({
      loopAFault: true,
      loopBFault: false,
      detectionFault: false,
    });
  });

  it('shows FIRE LOOP B FAULT when only loop B is failed', () => {
    expect(fireDetectionFaultAlerts(false, true, false)).toEqual({
      loopAFault: false,
      loopBFault: true,
      detectionFault: false,
    });
  });

  it('shows FIRE DET FAULT instead of the two LOOP FAULT cautions when both loops are failed', () => {
    expect(fireDetectionFaultAlerts(true, true, false)).toEqual({
      loopAFault: false,
      loopBFault: false,
      detectionFault: true,
    });
  });

  it('shows FIRE DET FAULT alone when the FDU is failed, with healthy or failed loops', () => {
    for (const [loopAFailed, loopBFailed] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]) {
      expect(fireDetectionFaultAlerts(loopAFailed, loopBFailed, true)).toEqual({
        loopAFault: false,
        loopBFault: false,
        detectionFault: true,
      });
    }
  });
});
