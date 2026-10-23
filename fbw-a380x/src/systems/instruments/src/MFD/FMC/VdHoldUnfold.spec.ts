// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  isHoldInPredictions,
  selectUnfoldedHolds,
  shiftDistanceForHolds,
  unfoldHoldsInProfile,
  unfoldHoldsInSymbols,
  VdHold,
} from './VdHoldUnfold';

const hold: VdHold = { ident: 'FRZ', distanceFromAircraft: 40, orbitLength: 10, altitude: 6000 };

describe('isHoldInPredictions', () => {
  it('includes the pattern in managed speed', () => {
    expect(isHoldInPredictions(true, 8, 3)).toBe(true);
  });

  it('leaves the pattern out in selected speed until the entry fix is sequenced', () => {
    expect(isHoldInPredictions(false, 8, 3)).toBe(false);
    expect(isHoldInPredictions(false, 8, 8)).toBe(true);
  });
});

describe('selectUnfoldedHolds', () => {
  const candidate = { legIndex: 8, ...hold };

  it('ignores holds already sequenced and holds not in the predictions', () => {
    expect(selectUnfoldedHolds([candidate], 9, true)).toEqual([]);
    expect(selectUnfoldedHolds([candidate], 3, false)).toEqual([]);
  });

  it('draws a hold being flown in full from the present position', () => {
    const flying = { ...candidate, distanceFromAircraft: -0.4 };
    expect(selectUnfoldedHolds([flying], 8, false)[0].distanceFromAircraft).toBe(0);
  });

  it('keeps the ident of the hold fix', () => {
    expect(selectUnfoldedHolds([candidate], 3, true)[0].ident).toBe('FRZ');
  });

  it('orders the holds by distance', () => {
    const far = { ...candidate, legIndex: 12, distanceFromAircraft: 90 };
    expect(selectUnfoldedHolds([far, candidate], 3, true).map((h) => h.distanceFromAircraft)).toEqual([40, 90]);
  });
});

describe('shiftDistanceForHolds', () => {
  it('keeps the hold fix and everything before it in place', () => {
    expect(shiftDistanceForHolds(25, [hold])).toBe(25);
    expect(shiftDistanceForHolds(40, [hold])).toBe(40);
  });

  it('moves everything after the hold by the pattern length', () => {
    expect(shiftDistanceForHolds(55, [hold])).toBe(65);
  });

  it('adds up several holds', () => {
    expect(shiftDistanceForHolds(100, [hold, { ...hold, distanceFromAircraft: 70, orbitLength: 6 }])).toBe(116);
  });
});

describe('unfoldHoldsInProfile', () => {
  const profile = [
    { distanceFromAircraft: 0, altitude: 9000 },
    { distanceFromAircraft: 40, altitude: 6000 },
    { distanceFromAircraft: 60, altitude: 3000 },
  ];

  it('draws the pattern level and continues the descent after it', () => {
    expect(unfoldHoldsInProfile(profile, [hold])).toEqual([
      { distanceFromAircraft: 0, altitude: 9000 },
      { distanceFromAircraft: 40, altitude: 6000 },
      { distanceFromAircraft: 40, altitude: 6000 },
      { distanceFromAircraft: 50, altitude: 6000 },
      { distanceFromAircraft: 70, altitude: 3000 },
    ]);
  });

  it('leaves the profile alone without holds or when the hold is past the last point', () => {
    expect(unfoldHoldsInProfile(profile, [])).toEqual(profile);
    expect(unfoldHoldsInProfile(profile, [{ ...hold, distanceFromAircraft: 80 }])).toEqual(profile);
  });
});

describe('unfoldHoldsInSymbols', () => {
  const symbol = (ident: string, distanceFromAirplane: number, predictedAltitude = 5000) =>
    ({
      databaseId: `W      ${ident}`,
      ident,
      distanceFromAirplane,
      predictedAltitude,
      location: { lat: 0, long: 0 },
    }) as any;

  it('shows the hold fix again at the end of the pattern, level, and moves later waypoints back', () => {
    const result = unfoldHoldsInSymbols([symbol('ROCCA', 25), symbol('FRZ', 40, 6100), symbol('BOL', 60)], [hold]);

    expect(result.map((s) => [s.ident, s.distanceFromAirplane, s.predictedAltitude])).toEqual([
      ['ROCCA', 25, 5000],
      ['FRZ', 40, 6100],
      ['BOL', 70, 5000],
      ['FRZ', 50, 6000],
    ]);
    expect(new Set(result.map((s) => s.databaseId)).size).toBe(4);
  });

  it('keeps symbols without a distance', () => {
    expect(unfoldHoldsInSymbols([symbol('FRZ', undefined as any)], [hold])[0].distanceFromAirplane).toBeUndefined();
  });
});
