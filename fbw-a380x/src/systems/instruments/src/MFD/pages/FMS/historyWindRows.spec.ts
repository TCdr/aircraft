// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { WindEntry } from '@fmgc/flightplanning/data/wind';
import { historyWindRows } from './historyWindRows';

const wind = (altitude: number): WindEntry => ({ altitude, vector: { direction: 1, magnitude: 20 } });

// A380 FCOM l.42171: winds are "stored for the CRZ FL, FL 250, FL 150, and FL 050"
describe('history wind rows', () => {
  it('shows the CRZ FL and FL 250, 150 and 050, highest first', () => {
    // Previous flight cruised at FL380, the plan now has FL350: the FMS list has 5 entries
    const fmsList = [wind(38000), wind(35000), wind(25000), wind(15000), wind(5000)];
    expect(historyWindRows(fmsList, 350).map((w) => w.altitude)).toEqual([35000, 25000, 15000, 5000]);
  });

  it('keeps the recorded cruise level while no cruise level is planned', () => {
    const fmsList = [wind(38000), wind(25000), wind(15000), wind(5000)];
    expect(historyWindRows(fmsList, null).map((w) => w.altitude)).toEqual([38000, 25000, 15000, 5000]);
  });

  it('does not repeat a level when the cruise level is one of the default levels', () => {
    const fmsList = [wind(38000), wind(25000), wind(15000), wind(5000)];
    expect(historyWindRows(fmsList, 250).map((w) => w.altitude)).toEqual([25000, 15000, 5000]);
  });

  it('never has more than 4 rows', () => {
    const fmsList = [wind(41000), wind(38000), wind(35000), wind(25000), wind(15000), wind(5000)];
    expect(historyWindRows(fmsList, 350)).toHaveLength(4);
  });
});
