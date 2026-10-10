// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { cruiseSatRow } from './cruiseSat';

// A380 FCOM l.42335-42345: ALT/SAT pair at the cruise flight level, entered by the crew
describe('CRZ tab SAT row', () => {
  it('shows the SAT at the cruise flight level and lets it be entered', () => {
    expect(cruiseSatRow(350, -52)).toEqual({ flightLevel: 350, sat: -52, satEditable: true });
  });

  it('has nothing to enter without a cruise flight level', () => {
    expect(cruiseSatRow(null, null)).toEqual({ flightLevel: null, sat: null, satEditable: false });
  });

  it('shows no SAT without a cruise flight level, even if an entry is left over', () => {
    expect(cruiseSatRow(null, -52)).toEqual({ flightLevel: null, sat: null, satEditable: false });
  });
});
