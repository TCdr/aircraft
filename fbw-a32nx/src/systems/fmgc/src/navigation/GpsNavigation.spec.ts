// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GpirsData, gpsNavigationState } from './GpsNavigation';

/** A valid GPIRS position of 40 ft accuracy (0.0066 NM) and a HIL of 0.05 NM */
const valid: GpirsData = { positionValid: true, figureOfMerit: 40 / 6076.115, integrityLimit: 0.05 };
const invalid: GpirsData = { positionValid: false, figureOfMerit: null, integrityLimit: null };

describe('FMS GPS navigation (GPIRS selection, accuracy, GPS PRIMARY)', () => {
  it('selects the onside GPIRS, then GPIRS 3, then the opposite one', () => {
    expect(gpsNavigationState([valid, valid, valid], 2).source).toBe(1);
    expect(gpsNavigationState([invalid, valid, valid], 2).source).toBe(3);
    expect(gpsNavigationState([invalid, valid, invalid], 2).source).toBe(2);
  });

  it('is in GPS PRIMARY with an accurate GPIRS position and its integrity limit within the RNP', () => {
    const state = gpsNavigationState([valid, valid, valid], 0.3);
    expect(state.accuracyHigh).toBe(true);
    expect(state.gpsPrimary).toBe(true);
    // the uncertainty is the figure of merit, at least 0.01 NM
    expect(state.estimatedPositionUncertainty).toBeCloseTo(0.01, 6);
  });

  it('loses GPS PRIMARY when the integrity limit exceeds the RNP, keeping the accuracy HIGH', () => {
    const poorIntegrity: GpirsData = { ...valid, integrityLimit: 0.45 };
    const state = gpsNavigationState([poorIntegrity, invalid, invalid], 0.3);
    expect(state.accuracyHigh).toBe(true);
    expect(state.gpsPrimary).toBe(false);
  });

  it('loses GPS PRIMARY without an integrity limit (fewer than five satellites)', () => {
    const noIntegrity: GpirsData = { ...valid, integrityLimit: null };
    expect(gpsNavigationState([noIntegrity, invalid, invalid], 1).gpsPrimary).toBe(false);
  });

  it('has the accuracy LOW when the uncertainty exceeds the RNP', () => {
    const inaccurate: GpirsData = { positionValid: true, figureOfMerit: 0.4, integrityLimit: 0.2 };
    const state = gpsNavigationState([inaccurate, invalid, invalid], 0.3);
    expect(state.accuracyHigh).toBe(false);
    expect(state.gpsPrimary).toBe(false);
  });

  it('ignores the GPIRS positions when the flight crew has deselected the GPS', () => {
    expect(gpsNavigationState([valid, valid, valid], 0.3, true)).toEqual({
      source: null,
      estimatedPositionUncertainty: null,
      accuracyHigh: false,
      gpsPrimary: false,
    });
  });

  it('is not in GPS mode without a valid GPIRS position', () => {
    expect(gpsNavigationState([invalid, invalid, invalid], 2)).toEqual({
      source: null,
      estimatedPositionUncertainty: null,
      accuracyHigh: false,
      gpsPrimary: false,
    });
  });
});
