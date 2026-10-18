// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { cruiseSatRow } from './cruiseSat';

// ALT/SAT pair at the cruise flight level, entered by the crew
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

describe('CRZ tab SAT row after the cruise phase', () => {
  // The CRZ winds of the active plan are inactive after the cruise phase; the SAT at CRZ FL with them
  it('is not editable once the cruise is over', () => {
    expect(cruiseSatRow(350, -52, true)).toEqual({ flightLevel: 350, sat: -52, satEditable: false });
  });

  it('stays editable before the end of the cruise', () => {
    expect(cruiseSatRow(350, -52, false).satEditable).toBe(true);
  });
});
