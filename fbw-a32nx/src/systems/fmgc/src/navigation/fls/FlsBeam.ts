// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ApproachType, ApproachWaypointDescriptor, MathUtils } from '@flybywiresim/fbw-sdk';
import { bearingTo, Coordinates, distanceTo, placeBearingDistance } from 'msfs-geo';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';

/**
 * The non precision approaches with an FLS beam, and whether its F-LOC replaces the localizer (true). LOC and back
 * course approaches fly the real localizer with the F-G/S.
 */
const FLS_LATERAL_BY_APPROACH_TYPE: Partial<Record<ApproachType, boolean>> = {
  [ApproachType.Vor]: true,
  [ApproachType.VorDme]: true,
  [ApproachType.Vortac]: true,
  [ApproachType.Ndb]: true,
  [ApproachType.NdbDme]: true,
  [ApproachType.Rnav]: true,
  [ApproachType.Gps]: true,
  [ApproachType.Fms]: true,
  [ApproachType.Loc]: false,
  [ApproachType.LocBackcourse]: false,
};

/** No FLS beam when the final approach course is more than this away from the runway course, in degrees */
const MAX_COURSE_TO_RUNWAY_ANGLE = 50;

/** The MAP is on the runway threshold within this distance, in NM */
const MAP_ON_THRESHOLD_TOLERANCE = 0.14;

/** An anchor point this close to the runway threshold takes the threshold ident, in NM */
const ANCHOR_AT_THRESHOLD_TOLERANCE = 0.1;

/** Threshold crossing height without one in the database, in feet */
const DEFAULT_THRESHOLD_CROSSING_HEIGHT = 50;

/** Design choice: the slope of a final approach leg without a flight path angle in the database, in degrees */
const DEFAULT_FLS_SLOPE = 3;

export interface FlsBeamInputs {
  approachType: ApproachType;
  /** the final approach course to the MAP, in degrees true, null when unknown */
  finalCourse: number | null;
  missedApproachPoint: {
    ident: string;
    location: Coordinates;
    /** its altitude constraint, in feet, undefined without one */
    altitude: number | undefined;
    /** the flight path angle of its leg in the database, in degrees (negative), undefined without one */
    verticalAngle: number | undefined;
  };
  runway: {
    /** e.g. RW33L */
    ident: string;
    airportIdent: string;
    /** degrees true */
    bearing: number;
    thresholdLocation: Coordinates;
    /** feet */
    thresholdElevation: number;
    /** feet, 0 or less without one */
    thresholdCrossingHeight: number;
  };
  /** the destination temperature of the PERF APPR page, in °C, null without one */
  approachTemperature: number | null;
}

/** The FLS beam of a non precision approach: a line through the anchor point along the final course and slope */
export interface FlsBeamGeometry {
  anchorLocation: Coordinates;
  /** NM along the final course from the MAP to the anchor point, 0 when the anchor is the MAP or the threshold */
  mapToAnchorDistance: number;
  /** indicated altitude (QNH) of the anchor point, in feet */
  anchorAltitude: number;
  /** the final approach course, in degrees true */
  course: number;
  /** indicated slope, in degrees (positive) */
  slope: number;
  /** the anchor point ident: the airport and runway (e.g. LFBO33L), the end point (e.g. EP33L) or the MAP */
  ident: string;
  anchorAtThreshold: boolean;
  /** the F-LOC replaces the localizer; false on LOC and back course approaches */
  lateral: boolean;
}

/**
 * The FLS beam of a non precision approach, anchored at the threshold crossing height:
 * - MAP on the runway threshold: at the threshold.
 * - MAP before the threshold: at the pseudo end point (EPxxx) where the slope from the MAP reaches the threshold
 *   crossing height, along the final course.
 * - MAP beyond the threshold: at the MAP (the final end point of the database).
 * Below ISA at the destination, the anchor height above the threshold and the slope are the indicated ones.
 * @returns the beam, or null without one (an approach type without FLS, or a final course more than 50° from the
 * runway course)
 */
export function computeFlsBeam(inputs: FlsBeamInputs): FlsBeamGeometry | null {
  const { missedApproachPoint: map, runway } = inputs;
  const lateral = FLS_LATERAL_BY_APPROACH_TYPE[inputs.approachType];
  if (lateral === undefined) {
    return null;
  }
  const course = inputs.finalCourse ?? runway.bearing;
  if (Math.abs(MathUtils.diffAngle(course, runway.bearing)) > MAX_COURSE_TO_RUNWAY_ANGLE) {
    return null;
  }

  const slope = map.verticalAngle ? Math.abs(map.verticalAngle) : DEFAULT_FLS_SLOPE;
  const crossingHeight =
    runway.thresholdCrossingHeight > 0 ? runway.thresholdCrossingHeight : DEFAULT_THRESHOLD_CROSSING_HEIGHT;
  const anchorTrueAltitude = runway.thresholdElevation + crossingHeight;
  const runwayDesignator = runway.ident.replace(/^RW/, '');
  const thresholdIdent = runway.airportIdent + runwayDesignator;

  const mapToThreshold = distanceTo(map.location, runway.thresholdLocation);
  let anchorLocation = runway.thresholdLocation;
  let mapToAnchorDistance = 0;
  let ident = thresholdIdent;
  if (mapToThreshold > MAP_ON_THRESHOLD_TOLERANCE) {
    const thresholdAhead =
      mapToThreshold *
      Math.cos(
        MathUtils.diffAngle(course, bearingTo(map.location, runway.thresholdLocation)) * MathUtils.DEGREES_TO_RADIANS,
      );
    if (thresholdAhead > 0) {
      mapToAnchorDistance =
        map.altitude !== undefined
          ? Math.max(0, map.altitude - anchorTrueAltitude) /
            Math.tan(slope * MathUtils.DEGREES_TO_RADIANS) /
            MathUtils.FEET_TO_NAUTICAL_MILES
          : thresholdAhead;
      anchorLocation = placeBearingDistance(map.location, course, mapToAnchorDistance);
      ident =
        Math.abs(mapToAnchorDistance - thresholdAhead) < ANCHOR_AT_THRESHOLD_TOLERANCE
          ? thresholdIdent
          : `EP${runwayDesignator}`;
    } else {
      anchorLocation = map.location;
      ident = map.ident;
    }
  }

  const coldRatio = coldTemperatureRatio(inputs.approachTemperature, runway.thresholdElevation);
  return {
    anchorLocation,
    mapToAnchorDistance,
    anchorAltitude: runway.thresholdElevation + crossingHeight * coldRatio,
    course,
    slope:
      coldRatio === 1
        ? slope
        : Math.atan(Math.tan(slope * MathUtils.DEGREES_TO_RADIANS) * coldRatio) * MathUtils.RADIANS_TO_DEGREES,
    ident,
    anchorAtThreshold: ident === thresholdIdent,
    lateral,
  };
}

/**
 * The ratio of the indicated to the true height above the destination when it is colder than ISA: the ISA temperature
 * over the actual temperature (the usual altimeter temperature error), 1 at or above ISA.
 * @param temperature the destination temperature, in °C, null without one
 * @param elevation in feet
 */
function coldTemperatureRatio(temperature: number | null, elevation: number): number {
  if (temperature === null) {
    return 1;
  }
  const isaKelvin = 288.15 - 0.0019812 * elevation;
  const actualKelvin = 273.15 + temperature;
  return actualKelvin < isaKelvin && actualKelvin > 0 ? isaKelvin / actualKelvin : 1;
}

/** Leg data the FLS beam reads from the flight plan */
interface FlsLeg {
  isDiscontinuity: boolean;
  ident?: string;
  definition?: {
    approachWaypointDescriptor?: ApproachWaypointDescriptor;
    altitude1?: number;
    verticalAngle?: number;
    waypoint?: { location: Coordinates };
  };
}

/** @returns the index of the first MAP leg from the active leg on, -1 without one */
export function missedApproachPointLegIndex(plan: ReadonlyFlightPlan): number {
  const legs = plan.allLegs as readonly FlsLeg[];
  return legs.findIndex(
    (leg, index) =>
      index >= plan.activeLegIndex &&
      !leg.isDiscontinuity &&
      leg.definition?.approachWaypointDescriptor === ApproachWaypointDescriptor.MissedApproachPoint,
  );
}

/**
 * The FLS beam inputs of a flight plan
 * @returns the inputs, or null without an approach with a MAP ahead or a destination runway
 */
export function flsBeamInputs(plan: ReadonlyFlightPlan): FlsBeamInputs | null {
  const approach = plan.approach;
  const runway = plan.destinationRunway;
  const airport = plan.destinationAirport;
  if (!approach || !runway || !airport) {
    return null;
  }
  const legs = plan.allLegs as readonly FlsLeg[];
  const mapIndex = missedApproachPointLegIndex(plan);
  const mapLeg = mapIndex >= 0 ? legs[mapIndex] : undefined;
  const mapLocation = mapLeg?.definition?.waypoint?.location;
  if (!mapLeg || !mapLocation) {
    return null;
  }
  const previous = legs[mapIndex - 1];
  const previousLocation = previous && !previous.isDiscontinuity ? previous.definition?.waypoint?.location : undefined;

  return {
    approachType: approach.type,
    finalCourse: previousLocation ? bearingTo(previousLocation, mapLocation) : null,
    missedApproachPoint: {
      ident: mapLeg.ident ?? '',
      location: mapLocation,
      altitude: mapLeg.definition?.altitude1,
      verticalAngle: mapLeg.definition?.verticalAngle,
    },
    runway: {
      ident: runway.ident,
      airportIdent: airport.ident,
      bearing: runway.bearing,
      thresholdLocation: runway.thresholdLocation,
      thresholdElevation: runway.thresholdLocation.alt ?? airport.location.alt ?? 0,
      thresholdCrossingHeight: runway.thresholdCrossingHeight,
    },
    approachTemperature: plan.performanceData.approachTemperature.get(),
  };
}

/** @returns the FLS beam of the approach of a flight plan, null without one */
export function flsBeamOfPlan(plan: ReadonlyFlightPlan | null): FlsBeamGeometry | null {
  const inputs = plan ? flsBeamInputs(plan) : null;
  return inputs ? computeFlsBeam(inputs) : null;
}
