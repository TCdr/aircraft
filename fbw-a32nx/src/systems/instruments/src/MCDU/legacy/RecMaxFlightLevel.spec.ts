// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  engineOutRecMaxFlightLevel,
  maxFlightLevel,
  progRecMaxFlightLevel,
  REC_MAX_FL_LVAR,
  recMaxFlightLevel,
  recMaxFlightLevelLVarValue,
  REC_MAX_LIMIT_FL,
} from './RecMaxFlightLevel';

describe('A32NX FMS REC MAX flight level', () => {
  it('keeps the FMS formula: 68.4 t at ISA gives FL389', () => {
    expect(maxFlightLevel(0, 68.4)).toBe(389);
    expect(recMaxFlightLevel(0, 68.4)).toBe(389);
    expect(recMaxFlightLevel(2, 76)).toBe(368);
  });

  it('uses the hot-day branch above ISA +10', () => {
    // (15 x -0.039 - 2.389) x 70 + 15 x -0.667 + 585.334 = 367.2
    expect(maxFlightLevel(15, 70)).toBe(367);
  });

  it('is limited to FL398 (FCOM: "This field is limited to FL 398")', () => {
    expect(REC_MAX_LIMIT_FL).toBe(398);
    expect(maxFlightLevel(0, 55)).toBe(426);
    expect(recMaxFlightLevel(0, 55)).toBe(398);
  });

  it('has no value without a gross weight', () => {
    expect(recMaxFlightLevel(0, null)).toBeNull();
  });

  it('gives the FCOM one engine inoperative LRC ceilings with one engine out (ISA)', () => {
    // PER-OEI-GEN-10: 70 000 kg, LRC ceiling FL 182; PER-OEI-GEN-15: 62 000 kg, LRC ceiling FL 203
    expect(engineOutRecMaxFlightLevel(70)).toBe(182);
    expect(engineOutRecMaxFlightLevel(62)).toBe(203);
    // between and beyond: a straight line, 2.6 FL per tonne
    expect(engineOutRecMaxFlightLevel(66)).toBe(193);
    expect(engineOutRecMaxFlightLevel(50)).toBe(235);
    expect(engineOutRecMaxFlightLevel(null)).toBeNull();
  });

  it('shows the engine-out REC MAX on the PROG page when one engine is out', () => {
    // FCOM PROG page: "If one engine is out, this field displays the recommended maximum engine-out altitude"
    expect(progRecMaxFlightLevel(0, 70, true)).toBe(182);
    expect(progRecMaxFlightLevel(15, 70, true)).toBe(182);
    expect(progRecMaxFlightLevel(0, 70, false)).toBe(384);
    expect(progRecMaxFlightLevel(0, 55, false)).toBe(398);
    expect(progRecMaxFlightLevel(0, null, true)).toBeNull();
  });

  it('publishes the flight level in L:A32NX_FM_REC_MAX_FL, 0 when not available', () => {
    expect(REC_MAX_FL_LVAR).toBe('L:A32NX_FM_REC_MAX_FL');
    expect(recMaxFlightLevelLVarValue(389)).toBe(389);
    expect(recMaxFlightLevelLVarValue(null)).toBe(0);
    expect(recMaxFlightLevelLVarValue(NaN)).toBe(0);
  });
});
