// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { MmrOneLandingSystem } from './MmrLandingSystem';

const mmrOneWith = (values: Record<string, number>) => new MmrOneLandingSystem((name) => values[name] ?? 0);

const ilsValues = {
  'L:A32NX_RADIO_RECEIVER_GS_IS_VALID': 1,
  'L:A32NX_RADIO_RECEIVER_GS_DEVIATION': 0.1,
  'L:A32NX_RADIO_RECEIVER_LOC_IS_VALID': 1,
  'L:A32NX_RADIO_RECEIVER_LOC_DEVIATION': 0.2,
};

const glsValues = {
  'L:A32NX_GLS_1_GS_IS_VALID': 1,
  'L:A32NX_GLS_GS_DEVIATION': -0.6,
  'L:A32NX_GLS_1_LOC_IS_VALID': 1,
  'L:A32NX_GLS_LOC_DEVIATION': -0.3,
};

describe('MmrOneLandingSystem', () => {
  it('in ILS mode gives the ILS receiver and ignores the GLS values', () => {
    const mmr = mmrOneWith({ ...ilsValues, ...glsValues, 'L:A32NX_MMR_1_GLS_CHANNEL': 0 });
    expect(mmr.glideSlope()).toEqual({ valid: true, deviation: 0.1 });
    expect(mmr.localizer()).toEqual({ valid: true, deviation: 0.2 });
  });

  it('in GLS mode gives the GLS values and ignores the ILS receiver', () => {
    const mmr = mmrOneWith({ ...ilsValues, ...glsValues, 'L:A32NX_MMR_1_GLS_CHANNEL': 40123 });
    expect(mmr.glideSlope()).toEqual({ valid: true, deviation: -0.6 });
    expect(mmr.localizer()).toEqual({ valid: true, deviation: -0.3 });
  });

  it('in GLS mode without a received GLS is invalid, whatever the ILS receiver shows', () => {
    const mmr = mmrOneWith({
      ...ilsValues,
      ...glsValues,
      'L:A32NX_GLS_1_GS_IS_VALID': 0,
      'L:A32NX_GLS_1_LOC_IS_VALID': 0,
      'L:A32NX_MMR_1_GLS_CHANNEL': 40123,
    });
    expect(mmr.glideSlope().valid).toBe(false);
    expect(mmr.localizer().valid).toBe(false);
  });

  it('keeps the glide slope and localizer valid flags apart', () => {
    const mmr = mmrOneWith({ ...glsValues, 'L:A32NX_GLS_1_LOC_IS_VALID': 0, 'L:A32NX_MMR_1_GLS_CHANNEL': 40123 });
    expect(mmr.glideSlope().valid).toBe(true);
    expect(mmr.localizer().valid).toBe(false);
  });

  it('reads the GLS of MMR 1 only', () => {
    const mmr = mmrOneWith({ 'L:A32NX_GLS_2_GS_IS_VALID': 1, 'L:A32NX_MMR_1_GLS_CHANNEL': 40123 });
    expect(mmr.glideSlope().valid).toBe(false);
  });
});
