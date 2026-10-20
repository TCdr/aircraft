// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ApproachType, ApproachWaypointDescriptor, MathUtils } from '@flybywiresim/fbw-sdk';
import { EventBus } from '@microsoft/msfs-sdk';
import { bearingTo, Coordinates, distanceTo } from 'msfs-geo';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { FlsBeam, MfdSurvEvents } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';

/** The FMS computes an FLS beam for these non precision approaches */
const FLS_APPROACH_TYPES: readonly ApproachType[] = [
  ApproachType.Vor,
  ApproachType.VorDme,
  ApproachType.Vortac,
  ApproachType.Rnav,
  ApproachType.Gps,
  ApproachType.Fms,
  ApproachType.Loc,
  ApproachType.LocBackcourse,
];

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
    /** NM along the flight plan */
    distanceFromAircraft: number;
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
  /** the destination temperature of the PERF APPR panel, in °C, null without one */
  approachTemperature: number | null;
  /** the destination QNH of the PERF APPR panel, in hPa, null without one */
  approachQnh: number | null;
}

/**
 * The FLS beam of the non precision approach of the active flight plan, as the VD shows it: an anchor point at the
 * threshold crossing height and a slope.
 * - MAP on the runway threshold: the anchor is the threshold, the slope the flight path angle of the final leg.
 * - MAP before the threshold: the anchor is the pseudo end point (EPxxx) where the slope from the MAP reaches the
 *   threshold crossing height.
 * - MAP beyond the threshold: the anchor is the MAP (the final end point of the database).
 * Below ISA at the destination (PERF APPR temperature), the beam heights above the threshold are the indicated ones.
 * @returns the beam, or null without one (not a VOR, RNAV, GPS, LOC or BAC approach, or a final course more than 50°
 * from the runway course)
 */
export function computeFlsBeam(inputs: FlsBeamInputs): FlsBeam | null {
  const { missedApproachPoint: map, runway } = inputs;
  if (!FLS_APPROACH_TYPES.includes(inputs.approachType)) {
    return null;
  }
  if (
    inputs.finalCourse !== null &&
    Math.abs(MathUtils.diffAngle(inputs.finalCourse, runway.bearing)) > MAX_COURSE_TO_RUNWAY_ANGLE
  ) {
    return null;
  }

  const slope = map.verticalAngle ? Math.abs(map.verticalAngle) : DEFAULT_FLS_SLOPE;
  const crossingHeight =
    runway.thresholdCrossingHeight > 0 ? runway.thresholdCrossingHeight : DEFAULT_THRESHOLD_CROSSING_HEIGHT;
  const anchorTrueAltitude = runway.thresholdElevation + crossingHeight;
  const runwayDesignator = runway.ident.replace(/^RW/, '');
  const thresholdIdent = runway.airportIdent + runwayDesignator;

  const mapToThreshold = distanceTo(map.location, runway.thresholdLocation);
  let anchorDistance = map.distanceFromAircraft;
  let ident = thresholdIdent;
  if (mapToThreshold > MAP_ON_THRESHOLD_TOLERANCE) {
    const course = inputs.finalCourse ?? runway.bearing;
    const thresholdAhead =
      mapToThreshold *
      Math.cos(
        MathUtils.diffAngle(course, bearingTo(map.location, runway.thresholdLocation)) * MathUtils.DEGREES_TO_RADIANS,
      );
    if (thresholdAhead > 0) {
      const toEndPoint =
        map.altitude !== undefined
          ? Math.max(0, map.altitude - anchorTrueAltitude) /
            Math.tan(slope * MathUtils.DEGREES_TO_RADIANS) /
            MathUtils.FEET_TO_NAUTICAL_MILES
          : thresholdAhead;
      anchorDistance += toEndPoint;
      ident =
        Math.abs(toEndPoint - thresholdAhead) < ANCHOR_AT_THRESHOLD_TOLERANCE
          ? thresholdIdent
          : `EP${runwayDesignator}`;
    } else {
      ident = map.ident;
    }
  }

  const coldRatio = coldTemperatureRatio(inputs.approachTemperature, runway.thresholdElevation);
  return {
    anchorDistance,
    anchorAltitude: runway.thresholdElevation + crossingHeight * coldRatio,
    slope:
      coldRatio === 1
        ? slope
        : Math.atan(Math.tan(slope * MathUtils.DEGREES_TO_RADIANS) * coldRatio) * MathUtils.RADIANS_TO_DEGREES,
    ident,
    anchorAtThreshold: ident === thresholdIdent,
    approachQnh: inputs.approachQnh,
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

/**
 * The FLS beam inputs of the active flight plan
 * @returns the inputs, or null without an approach with a MAP ahead, a destination runway or VNAV predictions
 */
export function flsBeamInputs(
  plan: ReadonlyFlightPlan,
  predictions: ReadonlyMap<number, VerticalWaypointPrediction>,
  approachTemperature: number | null,
  approachQnh: number | null,
): FlsBeamInputs | null {
  const approach = plan.approach;
  const runway = plan.destinationRunway;
  const airport = plan.destinationAirport;
  if (!approach || !runway || !airport) {
    return null;
  }
  const legs = plan.allLegs as readonly FlsLeg[];
  const mapIndex = legs.findIndex(
    (leg, index) =>
      index >= plan.activeLegIndex &&
      !leg.isDiscontinuity &&
      leg.definition?.approachWaypointDescriptor === ApproachWaypointDescriptor.MissedApproachPoint,
  );
  const mapLeg = mapIndex >= 0 ? legs[mapIndex] : undefined;
  const mapLocation = mapLeg?.definition?.waypoint?.location;
  const prediction = predictions.get(mapIndex);
  if (!mapLeg || !mapLocation || !prediction) {
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
      distanceFromAircraft: prediction.distanceFromAircraft,
    },
    runway: {
      ident: runway.ident,
      airportIdent: airport.ident,
      bearing: runway.bearing,
      thresholdLocation: runway.thresholdLocation,
      thresholdElevation: runway.thresholdLocation.alt ?? airport.location.alt ?? 0,
      thresholdCrossingHeight: runway.thresholdCrossingHeight,
    },
    approachTemperature,
    approachQnh,
  };
}

/** Sends the FLS beam of the active flight plan to the VD, on a change */
export class FlsBeamPublisher {
  private lastSent: string | null = null;

  constructor(private readonly bus: EventBus) {}

  publish(beam: FlsBeam | null): void {
    const key = beam
      ? `${beam.anchorDistance.toFixed(1)}|${beam.anchorAltitude.toFixed(0)}|${beam.slope.toFixed(2)}|${beam.ident}|${beam.approachQnh}`
      : 'none';
    if (key !== this.lastSent) {
      this.lastSent = key;
      this.bus.getPublisher<MfdSurvEvents>().pub('a32nx_fms_vd_fls_beam', beam, true);
    }
  }
}
