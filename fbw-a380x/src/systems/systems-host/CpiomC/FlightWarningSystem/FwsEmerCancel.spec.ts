// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FwsEmerCancel } from './FwsEmerCancel';

describe('FwsEmerCancel (A380 FCOM DSC-31-40-20, EMER CANC pb)', () => {
  it('keeps a caution cancelled for the rest of the flight, even when it goes and comes back', () => {
    const emerCancel = new FwsEmerCancel();
    emerCancel.cancelCaution('A');
    emerCancel.update([]);
    emerCancel.update(['A']);
    expect(emerCancel.isCancelledCaution('A')).toBe(true);
    expect(emerCancel.cancelledCautions).toEqual(['A']);
  });

  it('silences a warning only while it stays active', () => {
    const emerCancel = new FwsEmerCancel();
    emerCancel.silenceWarnings(['W']);
    emerCancel.update(['W']);
    expect(emerCancel.isSilencedWarning('W')).toBe(true);
    // Triggered a second time: the aural and MASTER WARN come back
    emerCancel.update([]);
    emerCancel.update(['W']);
    expect(emerCancel.isSilencedWarning('W')).toBe(false);
  });

  it('brings back the cancelled cautions still active on RCL for more than 3 s', () => {
    const emerCancel = new FwsEmerCancel();
    emerCancel.cancelCaution('A');
    emerCancel.cancelCaution('B');
    emerCancel.cancelCaution('A');
    expect(emerCancel.recall(['B', 'C'])).toEqual(['B']);
    expect(emerCancel.cancelledCautions).toEqual([]);
    expect(emerCancel.isCancelledCaution('A')).toBe(false);
  });

  it('forgets everything on reset', () => {
    const emerCancel = new FwsEmerCancel();
    emerCancel.cancelCaution('A');
    emerCancel.silenceWarnings(['W']);
    emerCancel.reset();
    expect(emerCancel.cancelledCautions).toEqual([]);
    expect(emerCancel.isSilencedWarning('W')).toBe(false);
  });
});
