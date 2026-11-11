// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AirportSubsectionCode,
  Approach,
  ApproachType,
  ApproachWaypointDescriptor,
  EnrouteSubsectionCode,
  LegType,
  ProcedureLeg,
  RunwayDesignator,
  SectionCode,
  Waypoint,
  WaypointArea,
} from '@flybywiresim/fbw-sdk';
import { Coordinates, placeBearingDistance } from 'msfs-geo';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { setupTestDatabase } from '@fmgc/flightplanning/test/Database';
import { emptyFlightPlan } from '@fmgc/flightplanning/test/FlightPlan';
import { flsBeamOfPlan, missedApproachPointLegIndex } from './FlsBeam';

const threshold = { lat: 43.66679444444444, long: -79.60958194444444 };
const runwayBearing = 46;
/** a point on the extended centreline, a distance (NM) before the threshold (negative: beyond it) */
const onFinal = (distance: number) => placeBearingDistance(threshold, runwayBearing + 180, distance);

const waypoint = (ident: string, location: Coordinates): Waypoint => ({
  sectionCode: SectionCode.Enroute,
  subSectionCode: EnrouteSubsectionCode.Waypoints,
  databaseId: `WAYPOINT-CY-${ident}`,
  icaoCode: 'CY',
  area: WaypointArea.Terminal,
  ident,
  location,
});

const approachLeg = (
  type: LegType,
  ident: string,
  location: Coordinates,
  extra: Partial<ProcedureLeg>,
): ProcedureLeg => ({
  procedureIdent: 'V06R',
  type,
  overfly: false,
  waypoint: waypoint(ident, location),
  magVar: 0,
  ...extra,
});

/** a VOR approach whose MAP lies 1 NM before the threshold */
const vorApproach: Approach = {
  sectionCode: SectionCode.Airport,
  subSectionCode: AirportSubsectionCode.ApproachProcedures,
  databaseId: 'APPROACH-CYYZ-V06R',
  icaoCode: 'CY',
  ident: 'V06R',
  runwayIdent: 'CYYZ06R',
  runwayNumber: 6,
  runwayDesignator: RunwayDesignator.Right,
  multipleIndicator: '',
  type: ApproachType.Vor,
  authorisationRequired: false,
  missedApproachAuthorisationRequired: false,
  transitions: [],
  legs: [
    approachLeg(LegType.IF, 'FAF06', onFinal(6), {
      approachWaypointDescriptor: ApproachWaypointDescriptor.FinalApproachFix,
    }),
    approachLeg(LegType.TF, 'MA06R', onFinal(1), {
      approachWaypointDescriptor: ApproachWaypointDescriptor.MissedApproachPoint,
      verticalAngle: -3,
    }),
  ],
  missedLegs: [approachLeg(LegType.TF, 'MISS1', onFinal(-8), {})],
};

describe('FLS beam of a flight plan around the missed approach point', () => {
  beforeAll(() => {
    setupTestDatabase();
    vi.spyOn(NavigationDatabaseService.activeDatabase.backendDatabase, 'getApproaches').mockResolvedValue([
      vorApproach,
    ]);
  });

  it('stays the same while the MAP is sequenced and the approach is strung again behind the missed approach', async () => {
    const plan = emptyFlightPlan();
    await plan.setDestinationAirport('CYYZ');
    await plan.setDestinationRunway('CYYZ06R');
    await plan.setApproach(vorApproach.databaseId);
    const mapIndex = missedApproachPointLegIndex(plan);
    while (plan.activeLegIndex < mapIndex) {
      plan.sequence();
    }
    const beamToMap = flsBeamOfPlan(plan);
    expect(beamToMap?.ident).toBe('CYYZ06R');

    plan.sequence();
    // the plan rebuilds its approach after this call returns: until then the only MAP is the one behind
    expect(missedApproachPointLegIndex(plan)).toBe(plan.activeLegIndex - 1);
    expect(flsBeamOfPlan(plan)).toEqual(beamToMap);

    await vi.waitFor(() => expect(missedApproachPointLegIndex(plan)).toBeGreaterThanOrEqual(plan.activeLegIndex));
    expect(flsBeamOfPlan(plan)).toEqual(beamToMap);
  });
});
