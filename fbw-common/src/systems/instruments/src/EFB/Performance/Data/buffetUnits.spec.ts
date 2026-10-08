// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { buffetWeightUnitText, roundShownWeight, shownWeightToTonnes, tonnesToShownWeight } from './buffetUnits';

describe('Buffet page weights in the flyPad weight unit', () => {
  it('shows tonnes for kg and thousands of pounds for lb', () => {
    expect(buffetWeightUnitText('kg')).toBe('t');
    expect(buffetWeightUnitText('lb')).toBe('klb');
  });

  it('keeps tonnes unchanged in kg', () => {
    expect(tonnesToShownWeight(68.4, 'kg')).toBe(68.4);
    expect(shownWeightToTonnes(76, 'kg')).toBe(76);
  });

  it('converts tonnes to klb and back (1 lb = 0.4535934 kg)', () => {
    expect(tonnesToShownWeight(68.4, 'lb')).toBeCloseTo(150.796, 3);
    expect(shownWeightToTonnes(167.6, 'lb')).toBeCloseTo(76.022, 3);
    expect(shownWeightToTonnes(tonnesToShownWeight(76, 'lb'), 'lb')).toBeCloseTo(76, 9);
  });

  it('rounds the A/C value to 0.1 of the shown unit', () => {
    expect(roundShownWeight(68.43, 'kg')).toBe(68.4);
    expect(roundShownWeight(68.4, 'lb')).toBe(150.8);
  });
});
