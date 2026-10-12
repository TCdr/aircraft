// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { WindEntry } from '../flightplanning/data/wind';
import { historyWindRows } from './historyWindRows';

const wind = (altitude: number, magnitude = 20): WindEntry => ({ altitude, vector: { direction: 1, magnitude } });

// A380 FCOM l.42171: the winds are "measured, and stored for the CRZ FL, FL 250, FL 150, and FL 050"
describe('history wind rows', () => {
  it('uses the measured wind of the previous flight for the CRZ FL, not the one interpolated for the planned level', () => {
    // Previous flight cruised at FL380 (30 kt), the plan now has FL350: the FMS list has 5 entries
    const fmsList = [wind(38000, 30), wind(35000, 99), wind(25000), wind(15000), wind(5000)];

    const rows = historyWindRows(fmsList, 350, 38000);

    expect(rows.map((w) => w.altitude)).toEqual([38000, 25000, 15000, 5000]);
    expect(rows[0].vector.magnitude).toBe(30);
    expect(rows.map((w) => w.isCruiseLevel)).toEqual([true, false, false, false]);
  });

  it('uses the entry of the planned CRZ FL while no cruise wind was recorded', () => {
    const fmsList = [wind(35000, 99), wind(25000), wind(15000), wind(5000)];

    const rows = historyWindRows(fmsList, 350, null);

    expect(rows.map((w) => w.altitude)).toEqual([35000, 25000, 15000, 5000]);
    expect(rows.map((w) => w.isCruiseLevel)).toEqual([true, false, false, false]);
  });

  it('shows the recorded cruise level while no CRZ FL is planned', () => {
    const fmsList = [wind(38000), wind(25000), wind(15000), wind(5000)];
    expect(historyWindRows(fmsList, null, 38000).map((w) => w.altitude)).toEqual([38000, 25000, 15000, 5000]);
  });

  it('marks a fixed level as the CRZ FL when that is where the previous flight cruised', () => {
    const fmsList = [wind(35000, 99), wind(25000), wind(15000), wind(5000)];

    const rows = historyWindRows(fmsList, 350, 25000);

    expect(rows.map((w) => w.altitude)).toEqual([25000, 15000, 5000]);
    expect(rows.map((w) => w.isCruiseLevel)).toEqual([true, false, false]);
  });

  it('never has more than 4 rows', () => {
    const fmsList = [wind(41000), wind(38000), wind(35000), wind(25000), wind(15000), wind(5000)];
    expect(historyWindRows(fmsList, 350, 38000)).toHaveLength(4);
  });
});
