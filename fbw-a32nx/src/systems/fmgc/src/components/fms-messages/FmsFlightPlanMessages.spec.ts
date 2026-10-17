// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AltitudeDescriptor, WaypointConstraintType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import {
  constraintsAboveCruiseLevel,
  cruiseLevelConstraintAction,
  doesTrackInterceptLeg,
  isEngineOutSpeedSettingWrong,
  isNoNavInterception,
  isUplinkedFlightNumberDifferent,
  isValidA380FlightNumber,
  selectedSpeedAsCas,
} from './FmsMessageConditions';

describe('constraints at or above the CRZ FL', () => {
  const at = (altitude1: number) => ({ altitudeDescriptor: AltitudeDescriptor.AtAlt1, altitude1 });

  it('deletes the AT, AT OR ABOVE and AT OR BELOW constraints at or above the CRZ FL', () => {
    expect(cruiseLevelConstraintAction(at(35_000), 35_000)).toEqual({ kind: 'delete' });
    expect(cruiseLevelConstraintAction(at(36_000), 35_000)).toEqual({ kind: 'delete' });
    expect(
      cruiseLevelConstraintAction({ altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt1, altitude1: 37_000 }, 35_000),
    ).toEqual({ kind: 'delete' });
    expect(
      cruiseLevelConstraintAction({ altitudeDescriptor: AltitudeDescriptor.AtOrBelowAlt1, altitude1: 39_000 }, 35_000),
    ).toEqual({ kind: 'delete' });
  });

  it('keeps the constraints below the CRZ FL', () => {
    expect(cruiseLevelConstraintAction(at(34_900), 35_000)).toBe(null);
    expect(
      cruiseLevelConstraintAction({ altitudeDescriptor: AltitudeDescriptor.AtOrBelowAlt1, altitude1: 11_000 }, 35_000),
    ).toBe(null);
    expect(cruiseLevelConstraintAction(undefined, 35_000)).toBe(null);
  });

  it('deletes a window whose lower limit is at or above the CRZ FL', () => {
    expect(
      cruiseLevelConstraintAction(
        { altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2, altitude1: 26_000, altitude2: 24_000 },
        24_000,
      ),
    ).toEqual({ kind: 'delete' });
  });

  it('cuts a window across the CRZ FL to its lower limit', () => {
    expect(
      cruiseLevelConstraintAction(
        { altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2, altitude1: 26_000, altitude2: 20_000 },
        24_000,
      ),
    ).toEqual({ kind: 'keepLower', lowerAltitude: 20_000 });
    expect(
      cruiseLevelConstraintAction(
        { altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2, altitude1: 23_000, altitude2: 20_000 },
        24_000,
      ),
    ).toBe(null);
  });

  it('ignores the glide slope constraints the FMS does not use', () => {
    expect(
      cruiseLevelConstraintAction(
        { altitudeDescriptor: AltitudeDescriptor.AtAlt1GsMslAlt2, altitude1: 30_000, altitude2: 3_000 },
        24_000,
      ),
    ).toBe(null);
  });

  it('lists the legs not flown yet, before the missed approach, with their climb or descent kind', () => {
    const legs = [
      { isDiscontinuity: false, altitudeConstraint: at(30_000), constraintType: WaypointConstraintType.CLB },
      { isDiscontinuity: false, altitudeConstraint: at(25_000), constraintType: WaypointConstraintType.CLB },
      { isDiscontinuity: true },
      { isDiscontinuity: false, altitudeConstraint: at(26_000), constraintType: WaypointConstraintType.DES },
      { isDiscontinuity: false, altitudeConstraint: at(5_000), constraintType: WaypointConstraintType.DES },
      // missed approach
      { isDiscontinuity: false, altitudeConstraint: at(40_000), constraintType: WaypointConstraintType.CLB },
    ];
    expect(constraintsAboveCruiseLevel(legs, 1, 5, 24_000)).toEqual([
      { index: 1, isDescent: false, action: { kind: 'delete' } },
      { index: 3, isDescent: true, action: { kind: 'delete' } },
    ]);
    expect(constraintsAboveCruiseLevel(legs, 0, 5, 41_000)).toEqual([]);
  });
});

describe('CHECK FLT NBR', () => {
  it('is raised when the uplinked flight number differs from the one of the request', () => {
    expect(isUplinkedFlightNumberDifferent('AIB1234', 'AIB5678')).toBe(true);
    expect(isUplinkedFlightNumberDifferent('aib1234', 'AIB1234 ')).toBe(false);
  });

  it('is not raised without a flight number in the request, or in the uplink', () => {
    expect(isUplinkedFlightNumberDifferent(null, 'AIB5678')).toBe(false);
    expect(isUplinkedFlightNumberDifferent('', 'AIB5678')).toBe(false);
    expect(isUplinkedFlightNumberDifferent('AIB1234', undefined)).toBe(false);
  });
});

describe('RECEIVED FLT NUMBER NOT VALID', () => {
  it('accepts 1 to 10 alphanumeric characters', () => {
    expect(isValidA380FlightNumber('AFR1')).toBe(true);
    expect(isValidA380FlightNumber('SIA0321ABC')).toBe(true);
  });

  it('rejects an empty, too long or not alphanumeric flight number', () => {
    expect(isValidA380FlightNumber('')).toBe(false);
    expect(isValidA380FlightNumber(null)).toBe(false);
    expect(isValidA380FlightNumber('SIA0321ABCD')).toBe(false);
    expect(isValidA380FlightNumber('SIA 321')).toBe(false);
    expect(isValidA380FlightNumber('SIA-321')).toBe(false);
  });
});

describe('CHECK EO SPD SETTING', () => {
  it('is raised in engine out, in climb or cruise, with a selected speed more than 10 kt from green dot', () => {
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Climb, false, 250, 230)).toBe(true);
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Cruise, false, 215, 230)).toBe(true);
  });

  it('accepts a selected speed within green dot +/- 10 kt', () => {
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Cruise, false, 240, 230)).toBe(false);
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Cruise, false, 220, 230)).toBe(false);
  });

  it('is not raised in ALT / ALT*, in managed speed, without engine out, or in another phase', () => {
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Cruise, true, 280, 230)).toBe(false);
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Cruise, false, null, 230)).toBe(false);
    expect(isEngineOutSpeedSettingWrong(false, FmgcFlightPhase.Cruise, false, 280, 230)).toBe(false);
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Descent, false, 280, 230)).toBe(false);
    expect(isEngineOutSpeedSettingWrong(true, FmgcFlightPhase.Climb, false, 280, null)).toBe(false);
  });
});

describe('NO NAV INTERCEPTION', () => {
  // a leg from 1 degree west to 1 degree east along the equator, the TO waypoint east
  const from = { lat: 0, long: -1 };
  const to = { lat: 0, long: 1 };
  const south = { lat: -0.5, long: 0 };

  it('intercepts a leg the track crosses before the TO waypoint', () => {
    expect(doesTrackInterceptLeg(south, 0, from, to)).toBe(true);
    expect(doesTrackInterceptLeg(south, 45, from, to)).toBe(true);
    expect(doesTrackInterceptLeg(south, 315, from, to)).toBe(true);
  });

  it('does not intercept a leg the track moves away from, or crosses beyond the TO waypoint', () => {
    expect(doesTrackInterceptLeg(south, 180, from, to)).toBe(false);
    // 30 NM south of the leg, a track of 80 degrees reaches the equator about 170 NM east, past the TO waypoint
    expect(doesTrackInterceptLeg(south, 80, from, to)).toBe(false);
  });

  it('does not intercept with a track parallel to the leg', () => {
    expect(doesTrackInterceptLeg(south, 90, from, to)).toBe(false);
  });

  it('intercepts when the aircraft is on the leg', () => {
    expect(doesTrackInterceptLeg({ lat: 0, long: 0.2 }, 90, from, to)).toBe(true);
    expect(doesTrackInterceptLeg({ lat: 0.001, long: 0.2 }, 0, from, to)).toBe(true);
  });

  it('works across the antimeridian', () => {
    expect(doesTrackInterceptLeg({ lat: -0.5, long: 179.9 }, 0, { lat: 0, long: 179 }, { lat: 0, long: -179 })).toBe(
      true,
    );
  });
});

describe('CHECK EO SPD SETTING selected speed as a CAS', () => {
  it('takes a selected speed as it is, and turns a selected Mach into its CAS at the present altitude', () => {
    expect(selectedSpeedAsCas(240, false, 250, 0.6)).toBe(240);
    expect(selectedSpeedAsCas(0.8, true, 250, 0.84)).toBeCloseTo(238.1, 1);
  });

  it('has no CAS without a selected value or a present Mach', () => {
    expect(selectedSpeedAsCas(-1, false, 250, 0.6)).toBe(null);
    expect(selectedSpeedAsCas(0.8, true, 250, 0)).toBe(null);
  });
});

describe('NO NAV INTERCEPTION conditions', () => {
  const leg = { start: { lat: 0, long: -1 }, end: { lat: 0, long: 1 } };
  const south = { lat: -0.5, long: 0 };

  it('is raised in HDG/TRK with NAV armed, in flight, when the track does not intercept the active leg', () => {
    expect(isNoNavInterception(true, true, true, leg, south, 180)).toBe(true);
    expect(isNoNavInterception(true, true, true, leg, south, 0)).toBe(false);
  });

  it('is not raised in NAV, without NAV armed, on the ground, or without a TF leg or a position', () => {
    expect(isNoNavInterception(false, true, true, leg, south, 180)).toBe(false);
    expect(isNoNavInterception(true, false, true, leg, south, 180)).toBe(false);
    expect(isNoNavInterception(true, true, false, leg, south, 180)).toBe(false);
    expect(isNoNavInterception(true, true, true, null, south, 180)).toBe(false);
    expect(isNoNavInterception(true, true, true, leg, null, 180)).toBe(false);
    expect(isNoNavInterception(true, true, true, leg, south, NaN)).toBe(false);
  });
});
