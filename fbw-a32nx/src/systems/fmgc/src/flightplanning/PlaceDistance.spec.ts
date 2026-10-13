// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LegType } from '@flybywiresim/fbw-sdk';
import { distanceTo } from 'msfs-geo';
import { emptyFlightPlan } from './test/FlightPlan';
import { testFms } from './test/TestFms';
import { WaypointFactory } from '@fmgc/flightplanning/waypoints/WaypointFactory';
import { FlightPlanLeg, isDiscontinuity } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { parsePlaceDistance, placeDistancePosition } from './PlaceDistance';
import { WaypointEntryUtils } from './WaypointEntryUtils';
import { PilotWaypointType } from './DataManager';

/** A flight plan along the equator: ALPHA 0/1, BRAVO 0/2 (60 NM further), CHARL 0/3, DELTA 0/4 */
function testPlan() {
  const fp = emptyFlightPlan();
  const fixes = ['ALPHA', 'BRAVO', 'CHARL', 'DELTA'].map((ident, i) =>
    WaypointFactory.fromLocation(ident, { lat: 0, long: i + 1 }),
  );
  fp.enrouteSegment.allLegs.push(
    ...fixes.map((fix, i) =>
      FlightPlanLeg.fromEnrouteFix(fp.enrouteSegment, fix, '', i === 0 ? LegType.IF : LegType.TF),
    ),
  );
  (fp as any).syncSegmentLegsChange(fp.enrouteSegment);
  fp.incrementVersion();
  const index = (ident: string) => fp.allLegs.findIndex((it) => !isDiscontinuity(it) && it.ident === ident);
  return { fp, index };
}

const legs = (fp: ReturnType<typeof emptyFlightPlan>) =>
  fp.allLegs.map((it) => (isDiscontinuity(it) ? 'DISCO' : `${it.ident}/${LegType[it.type]}`));

function fmsErrorOf(f: () => unknown): FmsErrorType | undefined {
  try {
    f();
  } catch (e) {
    if (e instanceof FmsError) {
      return e.type;
    }
    throw e;
  }
  return undefined;
}

describe('PLACE/DIST waypoints (A320 FCOM l.13512, A380 FCOM l.43981-43998)', () => {
  it('parses the PLACE/DIST format, a missing sign is +', () => {
    expect(parsePlaceDistance('BRAVO/10')).toEqual({ place: 'BRAVO', distance: 10 });
    expect(parsePlaceDistance('BRAVO/+10.5')).toEqual({ place: 'BRAVO', distance: 10.5 });
    expect(parsePlaceDistance('LMG/-15')).toEqual({ place: 'LMG', distance: -15 });
    expect(parsePlaceDistance('LMG/999.9').distance).toBe(999.9);
    expect(fmsErrorOf(() => parsePlaceDistance('LMG/10.55'))).toBe(FmsErrorType.FormatError);
    expect(fmsErrorOf(() => parsePlaceDistance('LMG/1000'))).toBe(FmsErrorType.FormatError);
    expect(fmsErrorOf(() => parsePlaceDistance('LMG'))).toBe(FmsErrorType.FormatError);
  });

  it('places the waypoint along the leg after the place, or before it with a negative distance', () => {
    const { fp } = testPlan();
    const after = placeDistancePosition(fp.allLegs, { place: 'BRAVO', distance: 20 }, 0);
    expect(after.place.ident).toBe('BRAVO');
    expect(after.location.lat).toBeCloseTo(0, 5);
    expect(after.location.long).toBeGreaterThan(2);
    expect(distanceTo(after.place.location, after.location)).toBeCloseTo(20, 3);

    const before = placeDistancePosition(fp.allLegs, { place: 'BRAVO', distance: -20 }, 0);
    expect(before.location.long).toBeLessThan(2);
    expect(distanceTo(before.place.location, before.location)).toBeCloseTo(20, 3);
  });

  it('limits the distance to the preceding or following waypoint (FCOM: ENTRY OUT OF RANGE)', () => {
    const { fp } = testPlan();
    // ALPHA-BRAVO is 60 NM
    expect(fmsErrorOf(() => placeDistancePosition(fp.allLegs, { place: 'BRAVO', distance: 61 }, 0))).toBe(
      FmsErrorType.EntryOutOfRange,
    );
    expect(fmsErrorOf(() => placeDistancePosition(fp.allLegs, { place: 'BRAVO', distance: -61 }, 0))).toBe(
      FmsErrorType.EntryOutOfRange,
    );
    // Nothing after the last waypoint
    expect(fmsErrorOf(() => placeDistancePosition(fp.allLegs, { place: 'DELTA', distance: 5 }, 0))).toBe(
      FmsErrorType.EntryOutOfRange,
    );
  });

  it('needs a flight plan waypoint as place, and the revised waypoint when the revision asks for it', () => {
    const { fp, index } = testPlan();
    expect(fmsErrorOf(() => placeDistancePosition(fp.allLegs, { place: 'ZULU', distance: 5 }, 0))).toBe(
      FmsErrorType.NotInDatabase,
    );
    expect(
      fmsErrorOf(() => placeDistancePosition(fp.allLegs, { place: 'BRAVO', distance: 5 }, 0, index('CHARL'))),
    ).toBe(FmsErrorType.PlaceWaypointDisagree);
    expect(placeDistancePosition(fp.allLegs, { place: 'BRAVO', distance: 5 }, 0, index('BRAVO')).placeLegIndex).toBe(
      index('BRAVO'),
    );
  });

  it('creates a PDnn pilot waypoint', () => {
    const { fp } = testPlan();
    const pd = WaypointEntryUtils.createPlaceDistWaypoint(testFms, 'BRAVO/-15', fp.allLegs, 0, false);
    expect(pd.distance).toBe(-15);
    expect(pd.waypoint.ident).toMatch(/^PD\d\d$/);
    const stored = testFms.dataManager.createPlaceDistWaypoint(pd.waypoint, -15, pd.waypoint.location, true);
    expect(stored.type).toBe(PilotWaypointType.Pd);
    expect(stored.waypoint.ident).toMatch(/^PD\d\d$/);
  });

  it('inserts the waypoint on the flight plan path, without discontinuity', async () => {
    const { fp, index } = testPlan();
    const pdAfter = WaypointFactory.fromLocation('PD01', { lat: 0, long: 2.3 });
    await fp.insertPlaceDistanceWaypoint(index('BRAVO'), pdAfter, 18);
    expect(legs(fp)).toEqual(['ALPHA/IF', 'BRAVO/TF', 'PD01/TF', 'CHARL/TF', 'DELTA/TF']);

    const pdBefore = WaypointFactory.fromLocation('PD02', { lat: 0, long: 2.7 });
    await fp.insertPlaceDistanceWaypoint(index('CHARL'), pdBefore, -18);
    expect(legs(fp)).toEqual(['ALPHA/IF', 'BRAVO/TF', 'PD01/TF', 'PD02/TF', 'CHARL/TF', 'DELTA/TF']);
  });
});
