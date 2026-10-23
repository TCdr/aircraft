// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { cruiseSatRow, editedWaypointSat, waypointSatRow } from './cruiseSat';

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

describe('CRZ tab SAT row after the cruise phase', () => {
  // The CRZ winds of the active plan are inactive after the cruise phase; the SAT at CRZ FL with them
  it('is not editable once the cruise is over', () => {
    expect(cruiseSatRow(350, -52, true)).toEqual({ flightLevel: 350, sat: -52, satEditable: false });
  });

  it('stays editable before the end of the cruise', () => {
    expect(cruiseSatRow(350, -52, false).satEditable).toBe(true);
  });
});

describe('CRZ tab SAT row of a cruise waypoint', () => {
  const planRow = cruiseSatRow(350, -52);

  it('shows the SAT at the cruise flight level for a waypoint without an entry', () => {
    expect(waypointSatRow(planRow, true, null)).toEqual({ flightLevel: 350, sat: -52, enteredByPilot: true });
    expect(waypointSatRow(planRow, false, null).enteredByPilot).toBe(false);
  });

  it('shows the entry of the waypoint, or the one propagated from up-path', () => {
    expect(waypointSatRow(planRow, true, { altitude: 37000, temperature: -58, enteredHere: true })).toEqual({
      flightLevel: 370,
      sat: -58,
      enteredByPilot: true,
    });
    expect(
      waypointSatRow(planRow, true, { altitude: 37000, temperature: -58, enteredHere: false }).enteredByPilot,
    ).toBe(false);
  });
});

describe('CRZ tab SAT entry', () => {
  it('changes the SAT or the ALT of the row one at a time', () => {
    const shown = { flightLevel: 350, sat: -52 };

    expect(editedWaypointSat(shown, { sat: -55 })).toEqual({ altitude: 35000, temperature: -55 });
    expect(editedWaypointSat(shown, { flightLevel: 370 })).toEqual({ altitude: 37000, temperature: -52 });
  });

  it('needs both values', () => {
    expect(editedWaypointSat({ flightLevel: null, sat: null }, { sat: -55 })).toBeNull();
    expect(editedWaypointSat({ flightLevel: 350, sat: null }, { flightLevel: 370 })).toBeNull();
  });
});
