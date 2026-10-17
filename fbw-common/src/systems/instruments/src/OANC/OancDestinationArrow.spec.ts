// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380_OANS_DESTINATION_ARROW_RANGE_NM, isOansDestinationArrowShown } from './OancDestinationArrow';

// The destination arrow: shown when the moving airport map is out of the ND range and the selected range is 5 NM
describe('OANS destination arrow', () => {
  it('A380: map out of range at the 5 NM range', () => {
    expect(isOansDestinationArrowShown(false, 5, A380_OANS_DESTINATION_ARROW_RANGE_NM)).toBe(true);
  });

  it('A380: not at the other ranges, nor with the map in range', () => {
    expect(isOansDestinationArrowShown(false, 2, A380_OANS_DESTINATION_ARROW_RANGE_NM)).toBe(false);
    expect(isOansDestinationArrowShown(false, 0.5, A380_OANS_DESTINATION_ARROW_RANGE_NM)).toBe(false);
    expect(isOansDestinationArrowShown(true, 5, A380_OANS_DESTINATION_ARROW_RANGE_NM)).toBe(false);
  });

  it('without an arrow range (A32NX): unchanged, at any range while the map is out of range', () => {
    expect(isOansDestinationArrowShown(false, 2.5, undefined)).toBe(true);
    expect(isOansDestinationArrowShown(false, 0.5, undefined)).toBe(true);
    expect(isOansDestinationArrowShown(true, 2.5, undefined)).toBe(false);
  });
});
