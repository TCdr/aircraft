// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ApproachType, ApproachWaypointDescriptor, Runway } from '@flybywiresim/fbw-sdk';
import { bearingTo, distanceTo, placeBearingDistance } from 'msfs-geo';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { FacilityCache } from '../../../../../../../fbw-common/src/systems/navdata/client/backends/Msfs/FacilityCache';
import {
  JS_FacilityAirport,
  RunwayDesignatorChar,
} from '../../../../../../../fbw-common/src/systems/navdata/client/backends/Msfs/FsTypes';
import { MsfsMapping } from '../../../../../../../fbw-common/src/systems/navdata/client/backends/Msfs/Mapping';
import {
  computeFlsBeam,
  flsBeamInputs,
  FlsBeamInputs,
  flsBeamOfPlan,
  missedApproachPointLegIndex,
} from './FlsBeam';

const FEET_PER_NM = 6076.12;
const threshold = { lat: 43.6, long: 1.37 };
const runwayBearing = 330;
/** a point on the extended centreline, a distance (NM) before the threshold (negative: beyond it) */
const onFinal = (distance: number) => placeBearingDistance(threshold, runwayBearing + 180, distance);

const vorApproach: FlsBeamInputs = {
  approachType: ApproachType.VorDme,
  finalCourse: runwayBearing,
  missedApproachPoint: {
    ident: 'RW33L',
    location: onFinal(0),
    altitude: 550,
    verticalAngle: -3,
  },
  runway: {
    ident: 'LFBO33L',
    airportIdent: 'LFBO',
    bearing: runwayBearing,
    thresholdLocation: threshold,
    thresholdElevation: 500,
    thresholdCrossingHeight: 50,
  },
  approachTemperature: null,
};

const withMap = (map: Partial<FlsBeamInputs['missedApproachPoint']>): FlsBeamInputs => ({
  ...vorApproach,
  missedApproachPoint: { ...vorApproach.missedApproachPoint, ...map },
});

describe('FLS beam geometry', () => {
  it('is anchored on the threshold at the TCH when the MAP is on the threshold', () => {
    const beam = computeFlsBeam(withMap({ location: onFinal(0.1) }));
    expect(beam?.anchorLocation).toEqual(threshold);
    expect(beam).toMatchObject({
      mapToAnchorDistance: 0,
      anchorAltitude: 550,
      course: runwayBearing,
      slope: 3,
      ident: 'LFBO33L',
      anchorAtThreshold: true,
      lateral: true,
    });
  });

  it('is anchored on a pseudo end point along the final course when the MAP is before the threshold', () => {
    // MAP 2 NM before the threshold at 1500 ft: the 3° slope reaches 550 ft about 3 NM after the MAP
    const beam = computeFlsBeam(withMap({ ident: 'MAP33', location: onFinal(2), altitude: 1_500 }));
    const toEndPoint = 950 / Math.tan((3 * Math.PI) / 180) / FEET_PER_NM;
    expect(beam?.ident).toBe('EP33L');
    expect(beam?.anchorAtThreshold).toBe(false);
    expect(beam?.mapToAnchorDistance).toBeCloseTo(toEndPoint, 3);
    expect(beam?.anchorAltitude).toBe(550);
    expect(distanceTo(beam!.anchorLocation, onFinal(2 - toEndPoint))).toBeLessThan(0.01);
    expect(beam!.anchorLocation.lat).toBeGreaterThan(threshold.lat);
    expect(beam!.anchorLocation.long).toBeLessThan(threshold.long);
  });

  it('places the end point on the final course, not on the runway centreline, for an offset approach', () => {
    const map = placeBearingDistance(threshold, runwayBearing + 180 + 20, 2);
    const finalCourse = runwayBearing + 20;
    const beam = computeFlsBeam({ ...withMap({ location: map, altitude: 1_500 }), finalCourse });
    expect(beam?.course).toBe(finalCourse);
    expect(bearingTo(map, beam!.anchorLocation)).toBeCloseTo(finalCourse, 1);
    expect(distanceTo(map, beam!.anchorLocation)).toBeCloseTo(beam!.mapToAnchorDistance, 3);
  });

  it('takes the threshold ident when the end point is within 0.1 NM of the threshold', () => {
    const mapAltitude = 550 + 2 * FEET_PER_NM * Math.tan((3 * Math.PI) / 180);
    const beam = computeFlsBeam(withMap({ location: onFinal(2), altitude: mapAltitude }));
    expect(beam?.ident).toBe('LFBO33L');
    expect(beam?.anchorAtThreshold).toBe(true);
    expect(distanceTo(beam!.anchorLocation, threshold)).toBeLessThan(0.01);
  });

  it('is anchored on the MAP (final end point) when the MAP is beyond the threshold', () => {
    const map = onFinal(-0.5);
    const beam = computeFlsBeam(withMap({ ident: 'EP33L', location: map }));
    expect(beam?.anchorLocation).toEqual(map);
    expect(beam).toMatchObject({
      mapToAnchorDistance: 0,
      anchorAltitude: 550,
      ident: 'EP33L',
      anchorAtThreshold: false,
    });
  });

  it('flies the final leg course, or the runway course without one', () => {
    expect(computeFlsBeam({ ...vorApproach, finalCourse: 335 })?.course).toBe(335);
    expect(computeFlsBeam({ ...vorApproach, finalCourse: null })?.course).toBe(runwayBearing);
  });

  it('takes the database flight path angle, or 3° without one', () => {
    expect(computeFlsBeam(withMap({ verticalAngle: -3.2 }))?.slope).toBeCloseTo(3.2, 6);
    expect(computeFlsBeam(withMap({ verticalAngle: undefined }))?.slope).toBe(3);
  });

  it('takes the database TCH, or threshold + 50 ft without one', () => {
    const withTch = (thresholdCrossingHeight: number) =>
      computeFlsBeam({ ...vorApproach, runway: { ...vorApproach.runway, thresholdCrossingHeight } });
    expect(withTch(45)?.anchorAltitude).toBe(545);
    expect(withTch(0)?.anchorAltitude).toBe(550);
  });

  it('replaces the localizer on VOR, NDB, RNAV and GPS approaches, not on LOC and back course approaches', () => {
    for (const approachType of [
      ApproachType.Vor,
      ApproachType.VorDme,
      ApproachType.Vortac,
      ApproachType.Ndb,
      ApproachType.NdbDme,
      ApproachType.Rnav,
      ApproachType.Gps,
      ApproachType.Fms,
    ]) {
      expect(computeFlsBeam({ ...vorApproach, approachType })?.lateral).toBe(true);
    }
    expect(computeFlsBeam({ ...vorApproach, approachType: ApproachType.Loc })?.lateral).toBe(false);
    expect(computeFlsBeam({ ...vorApproach, approachType: ApproachType.LocBackcourse })?.lateral).toBe(false);
  });

  it('is not computed for an ILS, IGS, LDA or SDF approach, nor for a final course more than 50° off the runway', () => {
    for (const approachType of [ApproachType.Ils, ApproachType.Igs, ApproachType.Lda, ApproachType.Sdf]) {
      expect(computeFlsBeam({ ...vorApproach, approachType })).toBe(null);
    }
    expect(computeFlsBeam({ ...vorApproach, finalCourse: runwayBearing + 51 })).toBe(null);
    expect(computeFlsBeam({ ...vorApproach, finalCourse: runwayBearing - 51 })).toBe(null);
    expect(computeFlsBeam({ ...vorApproach, finalCourse: runwayBearing + 45 })).not.toBe(null);
  });

  it('is corrected for a destination temperature below ISA (indicated heights above the threshold)', () => {
    // ISA at 500 ft is 14 °C: at -20 °C the indicated heights are about 13 % higher
    const beam = computeFlsBeam({ ...vorApproach, approachTemperature: -20 });
    const ratio = (288.15 - 0.0019812 * 500) / 253.15;
    expect(beam?.anchorAltitude).toBeCloseTo(500 + 50 * ratio, 3);
    expect(beam?.slope).toBeCloseTo((Math.atan(Math.tan((3 * Math.PI) / 180) * ratio) * 180) / Math.PI, 6);
    expect(computeFlsBeam({ ...vorApproach, approachTemperature: 30 })?.slope).toBe(3);
  });
});

describe('FLS beam inputs of a flight plan', () => {
  const faf = onFinal(5);
  const map = onFinal(1);
  const leg = (ident: string, location: typeof faf, descriptor?: ApproachWaypointDescriptor) => ({
    isDiscontinuity: false,
    ident,
    definition: { approachWaypointDescriptor: descriptor, altitude1: 900, verticalAngle: -3.1, waypoint: { location } },
  });
  const approachLegs = [
    leg('OLD', onFinal(20), ApproachWaypointDescriptor.MissedApproachPoint),
    leg('FAF33', faf, ApproachWaypointDescriptor.FinalApproachFix),
    leg('MAP33', map, ApproachWaypointDescriptor.MissedApproachPoint),
    leg('MISS1', onFinal(-5)),
    leg('MISS2', onFinal(-10)),
  ];
  const plan = (activeLegIndex: number, allLegs = approachLegs) =>
    ({
      approach: { type: ApproachType.Rnav },
      destinationRunway: {
        ident: 'LFBO33L',
        airportIdent: 'LFBO',
        bearing: runwayBearing,
        thresholdLocation: { ...threshold, alt: 499 },
        // the navdata gives the altitude of the crossing point: here 52 ft above the threshold
        thresholdCrossingHeight: 551,
      },
      destinationAirport: { ident: 'LFBO', location: { ...threshold, alt: 500 } },
      allLegs,
      activeLegIndex,
      performanceData: { approachTemperature: { get: () => -5 } },
    }) as unknown as ReadonlyFlightPlan;

  it('reads the first MAP ahead and the course of the leg into it', () => {
    expect(missedApproachPointLegIndex(plan(1))).toBe(2);
    expect(flsBeamInputs(plan(1))).toEqual({
      approachType: ApproachType.Rnav,
      finalCourse: (bearingTo(map, faf) + 180) % 360,
      missedApproachPoint: { ident: 'MAP33', location: map, altitude: 900, verticalAngle: -3.1 },
      runway: {
        ident: 'LFBO33L',
        airportIdent: 'LFBO',
        bearing: runwayBearing,
        thresholdLocation: { ...threshold, alt: 499 },
        thresholdElevation: 499,
        thresholdCrossingHeight: 52,
      },
      approachTemperature: -5,
    });
  });

  it('takes the final course where the leg arrives at the MAP, not where it leaves the previous fix', () => {
    // near the pole an east-west leg of 5 NM turns by 0.4° between its two ends
    const polarMap = { lat: 78.25, long: 15.5 };
    const polarLegs = [
      leg('FAF28', placeBearingDistance(polarMap, 90, 5), ApproachWaypointDescriptor.FinalApproachFix),
      leg('MAP28', polarMap, ApproachWaypointDescriptor.MissedApproachPoint),
    ];
    expect(flsBeamInputs(plan(0, polarLegs))?.finalCourse).toBeCloseTo(270, 3);
  });

  it('keeps the MAP that was just sequenced, until the approach is strung again behind the missed approach', () => {
    expect(missedApproachPointLegIndex(plan(3))).toBe(2);
    expect(flsBeamOfPlan(plan(3))).not.toBe(null);
    expect(flsBeamOfPlan(plan(3))).toEqual(flsBeamOfPlan(plan(2)));
  });

  it('keeps the end point of a MAP well before the threshold when that MAP is sequenced', () => {
    const earlyMapLegs = [
      leg('FAF33', faf, ApproachWaypointDescriptor.FinalApproachFix),
      leg('MAP33', onFinal(2), ApproachWaypointDescriptor.MissedApproachPoint),
      leg('MISS1', onFinal(-5)),
    ];
    const beamToMap = flsBeamOfPlan(plan(1, earlyMapLegs));
    expect(beamToMap).toMatchObject({ ident: 'EP33L', anchorAtThreshold: false });
    expect(flsBeamOfPlan(plan(2, earlyMapLegs))).toEqual(beamToMap);
  });

  it('has no inputs without a MAP ahead or just sequenced', () => {
    expect(missedApproachPointLegIndex(plan(4))).toBe(-1);
    expect(flsBeamInputs(plan(4))).toBe(null);
    expect(flsBeamOfPlan(plan(4))).toBe(null);
    expect(flsBeamOfPlan(null)).toBe(null);
  });

  it('builds the beam of the plan', () => {
    const beam = flsBeamOfPlan(plan(1));
    expect(beam).toMatchObject({ lateral: true, ident: 'LFBO33L' });
    expect(beam?.course).toBeCloseTo(runwayBearing, 1);
    // 52 ft above the threshold at 499 ft, raised for the -5 °C of the plan
    const coldRatio = (288.15 - 0.0019812 * 499) / 268.15;
    expect(beam?.anchorAltitude).toBeCloseTo(499 + 52 * coldRatio, 3);
  });
});

describe('FLS beam to a runway of the MSFS navdata', () => {
  const metresPerFoot = 0.3048;
  /** runway 33L as the navdata backend maps it, its thresholds at an elevation in feet */
  const navdataRunway = async (elevation: number): Promise<Runway> => {
    const noNavaids = { getFacilities: async () => new Map() } as unknown as FacilityCache;
    const runways = await new MsfsMapping(noNavaids, () => {}).mapAirportRunways({
      icao: 'A      LFBO ',
      icaoStruct: { region: 'LF' },
      lat: threshold.lat,
      lon: threshold.long,
      approaches: [],
      runways: [
        {
          designation: '33-15',
          designatorCharPrimary: RunwayDesignatorChar.L,
          designatorCharSecondary: RunwayDesignatorChar.R,
          direction: runwayBearing,
          latitude: threshold.lat,
          longitude: threshold.long,
          length: 3_000,
          width: 45,
          primaryThresholdLength: 0,
          secondaryThresholdLength: 0,
          primaryElevation: elevation * metresPerFoot,
          secondaryElevation: elevation * metresPerFoot,
          surface: 0,
        },
      ],
    } as unknown as JS_FacilityAirport);
    return runways[0];
  };
  /** an RNAV approach to that runway whose 3° final ends at a MAP a distance (NM) before the threshold */
  const planTo = (runway: Runway, mapDistance: number, mapAltitude: number, approachTemperature: number | null) => {
    const before = (distance: number) => placeBearingDistance(runway.thresholdLocation, runwayBearing + 180, distance);
    return {
      approach: { type: ApproachType.Rnav },
      destinationRunway: runway,
      destinationAirport: { ident: 'LFBO', location: runway.thresholdLocation },
      allLegs: [
        { isDiscontinuity: false, ident: 'FAF33', definition: { waypoint: { location: before(6) } } },
        {
          isDiscontinuity: false,
          ident: 'MAP33',
          definition: {
            approachWaypointDescriptor: ApproachWaypointDescriptor.MissedApproachPoint,
            altitude1: mapAltitude,
            verticalAngle: -3,
            waypoint: { location: before(mapDistance) },
          },
        },
      ],
      activeLegIndex: 0,
      performanceData: { approachTemperature: { get: () => approachTemperature } },
    } as unknown as ReadonlyFlightPlan;
  };
  const elevations = [13, 364, 5_431];

  it.each(elevations)('is anchored 50 ft above a threshold at %i ft', async (elevation) => {
    const runway = await navdataRunway(elevation);
    const beam = flsBeamOfPlan(planTo(runway, 0, elevation + 50, null));
    expect(runway.ident).toBe('LFBO33L');
    expect(beam?.anchorAltitude).toBeCloseTo(elevation + 50, 6);
    expect(beam).toMatchObject({ ident: 'LFBO33L', anchorAtThreshold: true, mapToAnchorDistance: 0 });
  });

  it.each(elevations)(
    'ends at EPxxx, 50 ft above a threshold at %i ft, when the MAP is before it',
    async (elevation) => {
      // MAP 1.5 NM before the threshold, at the altitude from which 3° reaches the crossing height 1 NM further on
      const runway = await navdataRunway(elevation);
      const mapAltitude = elevation + 50 + FEET_PER_NM * Math.tan((3 * Math.PI) / 180);
      const beam = flsBeamOfPlan(planTo(runway, 1.5, mapAltitude, null));
      expect(beam?.ident).toBe('EP33L');
      expect(beam?.anchorAtThreshold).toBe(false);
      expect(beam?.mapToAnchorDistance).toBeCloseTo(1, 3);
      expect(beam?.anchorAltitude).toBeCloseTo(elevation + 50, 6);
    },
  );

  it('corrects only the 50 ft above a high threshold for a temperature below ISA', async () => {
    const elevation = 5_431;
    const beam = flsBeamOfPlan(planTo(await navdataRunway(elevation), 0, elevation + 50, -20));
    const ratio = (288.15 - 0.0019812 * elevation) / 253.15;
    expect(beam?.anchorAltitude).toBeCloseTo(elevation + 50 * ratio, 3);
  });
});
