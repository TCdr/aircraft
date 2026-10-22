// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FplnLegTrackDistance, activeLegLineTrackAndDistance } from './FplnActiveLegTrackDistance';

const planned: FplnLegTrackDistance = { track: 61, distance: 187 };
const toWaypoint = { bearing: 58.4, distance: 121.6 };

const cruise = {
  planned,
  toWaypoint,
  inFlight: true,
  isActivePlan: true,
  isFirstLineOfActiveLeg: true,
  plannedDistanceAfterLine: 0,
};

describe('the TRK/DIST of the F-PLN active leg', () => {
  it('shows the direct bearing and distance from the aircraft to the TO waypoint in flight', () => {
    expect(activeLegLineTrackAndDistance(cruise)).toEqual({ track: 58.4, distance: 121.6 });
  });

  it('keeps the planned leg values on the ground', () => {
    expect(activeLegLineTrackAndDistance({ ...cruise, inFlight: false })).toEqual(planned);
  });

  it('keeps the planned leg values in the temporary and secondary flight plans', () => {
    expect(activeLegLineTrackAndDistance({ ...cruise, isActivePlan: false })).toEqual(planned);
  });

  it('keeps the planned leg values on every other line', () => {
    expect(activeLegLineTrackAndDistance({ ...cruise, isFirstLineOfActiveLeg: false })).toEqual(planned);
  });

  it('keeps the planned leg values when the FMS has no TO waypoint position, as on a manual leg', () => {
    expect(activeLegLineTrackAndDistance({ ...cruise, toWaypoint: { bearing: -1, distance: -1 } })).toEqual(planned);
    expect(activeLegLineTrackAndDistance({ ...cruise, toWaypoint: { bearing: NaN, distance: NaN } })).toEqual(planned);
  });

  it('shows the distance to a pseudo waypoint ahead on the active leg, the TO waypoint line keeping the rest', () => {
    expect(activeLegLineTrackAndDistance({ ...cruise, plannedDistanceAfterLine: 40 })).toEqual({
      track: 58.4,
      distance: 81.6,
    });
  });

  it('never shows a negative distance when the pseudo waypoint is just behind the aircraft', () => {
    expect(activeLegLineTrackAndDistance({ ...cruise, plannedDistanceAfterLine: 125 }).distance).toBe(0);
  });
});
