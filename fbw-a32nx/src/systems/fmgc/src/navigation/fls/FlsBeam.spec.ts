// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ApproachType, ApproachWaypointDescriptor } from '@flybywiresim/fbw-sdk';
import { bearingTo, distanceTo, placeBearingDistance } from 'msfs-geo';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import {
  computeFlsBeam,
  flsBeamInputs,
  FlsBeamInputs,
  flsBeamOfPlan,
  isNoFlsForApproach,
  noFlsApproachKey,
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
    ident: 'RW33L',
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
  const plan = (activeLegIndex: number) =>
    ({
      approach: { type: ApproachType.Rnav },
      destinationRunway: {
        ident: 'RW33L',
        bearing: runwayBearing,
        thresholdLocation: { ...threshold, alt: 499 },
        thresholdCrossingHeight: 52,
      },
      destinationAirport: { ident: 'LFBO', location: { ...threshold, alt: 500 } },
      allLegs: [
        leg('OLD', onFinal(20), ApproachWaypointDescriptor.MissedApproachPoint),
        leg('FAF33', faf, ApproachWaypointDescriptor.FinalApproachFix),
        leg('MAP33', map, ApproachWaypointDescriptor.MissedApproachPoint),
      ],
      activeLegIndex,
      performanceData: { approachTemperature: { get: () => -5 } },
    }) as unknown as ReadonlyFlightPlan;

  it('reads the first MAP ahead and the course of the leg into it', () => {
    expect(missedApproachPointLegIndex(plan(1))).toBe(2);
    expect(flsBeamInputs(plan(1))).toEqual({
      approachType: ApproachType.Rnav,
      finalCourse: bearingTo(faf, map),
      missedApproachPoint: { ident: 'MAP33', location: map, altitude: 900, verticalAngle: -3.1 },
      runway: {
        ident: 'RW33L',
        airportIdent: 'LFBO',
        bearing: runwayBearing,
        thresholdLocation: { ...threshold, alt: 499 },
        thresholdElevation: 499,
        thresholdCrossingHeight: 52,
      },
      approachTemperature: -5,
    });
  });

  it('has no inputs without a MAP ahead', () => {
    expect(missedApproachPointLegIndex(plan(3))).toBe(-1);
    expect(flsBeamInputs(plan(3))).toBe(null);
    expect(flsBeamOfPlan(plan(3))).toBe(null);
    expect(flsBeamOfPlan(null)).toBe(null);
  });

  it('builds the beam of the plan', () => {
    expect(flsBeamOfPlan(plan(1))).toMatchObject({ lateral: true, ident: 'LFBO33L', course: bearingTo(faf, map) });
  });
});

describe('NO FLS FOR THIS APPR', () => {
  const map = onFinal(1);
  const leg = (ident: string, location: typeof map, descriptor?: ApproachWaypointDescriptor) => ({
    isDiscontinuity: false,
    ident,
    definition: { approachWaypointDescriptor: descriptor, altitude1: 900, verticalAngle: -3.1, waypoint: { location } },
  });
  /** a plan whose final leg runs into the MAP along a course the given number of degrees off the runway */
  const planWith = (approachType: ApproachType | undefined, courseOffset = 0, mapAhead = true) =>
    ({
      approach: approachType === undefined ? undefined : { type: approachType, ident: `A${approachType}` },
      destinationRunway: {
        ident: 'RW33L',
        bearing: runwayBearing,
        thresholdLocation: { ...threshold, alt: 499 },
        thresholdCrossingHeight: 52,
      },
      destinationAirport: { ident: 'LFBO', location: { ...threshold, alt: 500 } },
      allLegs: [
        leg('FAF33', placeBearingDistance(map, runwayBearing + courseOffset + 180, 4)),
        leg('MAP33', map, ApproachWaypointDescriptor.MissedApproachPoint),
      ],
      activeLegIndex: mapAhead ? 0 : 2,
      performanceData: { approachTemperature: { get: () => null } },
    }) as unknown as ReadonlyFlightPlan;

  it.each([ApproachType.Lda, ApproachType.Sdf, ApproachType.Tacan])('is raised for a %s approach', (type) => {
    expect(isNoFlsForApproach(planWith(type))).toBe(true);
  });

  it('is raised when the final course is more than 50° off the runway, not at 40°', () => {
    expect(isNoFlsForApproach(planWith(ApproachType.Vor, 60))).toBe(true);
    expect(isNoFlsForApproach(planWith(ApproachType.Vor, -60))).toBe(true);
    expect(isNoFlsForApproach(planWith(ApproachType.Vor, 40))).toBe(false);
  });

  it.each([
    ApproachType.Vor,
    ApproachType.VorDme,
    ApproachType.Vortac,
    ApproachType.Ndb,
    ApproachType.NdbDme,
    ApproachType.Rnav,
    ApproachType.Gps,
    ApproachType.Fms,
    ApproachType.Loc,
    ApproachType.LocBackcourse,
  ])('is not raised for a %s approach with a normal geometry', (type) => {
    expect(isNoFlsForApproach(planWith(type))).toBe(false);
  });

  it.each([
    ApproachType.Ils,
    ApproachType.Gls,
    ApproachType.Mls,
    ApproachType.MlsTypeA,
    ApproachType.MlsTypeBC,
    ApproachType.Igs,
  ])('is not raised for a %s precision approach, whatever its geometry', (type) => {
    expect(isNoFlsForApproach(planWith(type))).toBe(false);
    expect(isNoFlsForApproach(planWith(type, 60))).toBe(false);
  });

  it('is not raised without an approach or a plan, nor for an unknown type', () => {
    expect(isNoFlsForApproach(planWith(undefined))).toBe(false);
    expect(isNoFlsForApproach(null)).toBe(false);
    expect(isNoFlsForApproach(planWith(ApproachType.Unknown))).toBe(false);
  });

  it('is not claimed from missing data: no MAP ahead means no course check', () => {
    expect(isNoFlsForApproach(planWith(ApproachType.Vor, 60, false))).toBe(false);
  });

  it('is still raised for a type without a beam when the geometry cannot be read', () => {
    expect(isNoFlsForApproach(planWith(ApproachType.Lda, 0, false))).toBe(true);
  });

  it('has a key of the airport and approach, null when there is no message', () => {
    expect(noFlsApproachKey(planWith(ApproachType.Lda))).toBe(`LFBO/A${ApproachType.Lda}`);
    expect(noFlsApproachKey(planWith(ApproachType.Sdf))).not.toBe(noFlsApproachKey(planWith(ApproachType.Lda)));
    expect(noFlsApproachKey(planWith(ApproachType.Rnav))).toBe(null);
    expect(noFlsApproachKey(planWith(undefined))).toBe(null);
    expect(noFlsApproachKey(null)).toBe(null);
  });
});
