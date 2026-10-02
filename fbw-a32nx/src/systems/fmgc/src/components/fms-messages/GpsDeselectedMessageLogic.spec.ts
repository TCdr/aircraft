// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GpsDeselectedMessageLogic } from './GpsDeselectedMessageLogic';

describe('GPS IS DESELECTED message (A320 FCOM DSC-22_20, A380 FCOM DSC-22-FMS-20-30)', () => {
  it('is sent 80 NM before the T/D when the GPS is deselected', () => {
    const logic = new GpsDeselectedMessageLogic();
    expect(logic.update(true, false, 200)).toBe(null);
    expect(logic.update(true, false, 81)).toBe(null);
    expect(logic.update(true, false, 80)).toBe('send');
    // once only
    expect(logic.update(true, false, 60)).toBe(null);
  });

  it('is sent again at the transition to the approach phase', () => {
    const logic = new GpsDeselectedMessageLogic();
    logic.update(true, false, 50);
    expect(logic.update(true, false, -30)).toBe(null);
    expect(logic.update(true, true, null)).toBe('send');
    expect(logic.update(true, true, null)).toBe(null);
  });

  it('is not sent with the GPS selected', () => {
    const logic = new GpsDeselectedMessageLogic();
    expect(logic.update(false, false, 50)).toBe(null);
    expect(logic.update(false, true, null)).toBe(null);
  });

  it('is recalled when the GPS is selected again', () => {
    const logic = new GpsDeselectedMessageLogic();
    expect(logic.update(true, false, 70)).toBe('send');
    expect(logic.update(false, false, 65)).toBe('recall');
    expect(logic.update(false, false, 60)).toBe(null);
  });

  it('is sent when the GPS is deselected within 80 NM of the T/D', () => {
    const logic = new GpsDeselectedMessageLogic();
    expect(logic.update(false, false, 40)).toBe(null);
    expect(logic.update(true, false, 39)).toBe('send');
  });
});
