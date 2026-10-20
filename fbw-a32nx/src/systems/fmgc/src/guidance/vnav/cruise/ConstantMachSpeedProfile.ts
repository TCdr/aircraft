// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { ConstantMachSegment, isLegInConstantMachSegment } from '@fmgc/flightplanning/ConstantMachSegment';
import {
  ProfilePhase,
  VerticalCheckpoint,
  VerticalCheckpointReason,
  VerticalWaypointPrediction,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

/** A constant Mach segment along the flight plan, for the predictions */
export interface GeographicConstantMachSegment {
  startDistanceFromStart: NauticalMiles;
  /** Infinity when the segment ends at the top of descent */
  endDistanceFromStart: NauticalMiles;
  mach: Mach;
}

/** A part of the cruise flown at one managed target */
interface CruiseSpeedPiece {
  endDistanceFromStart: NauticalMiles;
  /** The CMS Mach, null when the managed target is the ECON speed/Mach */
  constantMach: Mach | null;
}

/** The CMS is predicted as missed when the speed is not within 0.005 of its Mach */
const CONSTANT_MACH_TOLERANCE = 0.005;

/** The distances of the CMS waypoints along the flight plan, null when the legs are not computed yet */
export function geographicConstantMachSegment(
  legs: readonly ReadonlyFlightPlanElement[],
  segment: ConstantMachSegment | null,
): GeographicConstantMachSegment | null {
  if (segment === null) {
    return null;
  }

  const startDistance = distanceFromStartAtTermination(legs[segment.startLegIndex]);
  const endDistance =
    segment.endLegIndex === null ? Infinity : distanceFromStartAtTermination(legs[segment.endLegIndex]);
  if (startDistance === null || endDistance === null) {
    return null;
  }

  return { startDistanceFromStart: startDistance, endDistanceFromStart: endDistance, mach: segment.mach };
}

function distanceFromStartAtTermination(leg: ReadonlyFlightPlanElement | undefined): NauticalMiles | null {
  return leg?.isDiscontinuity === false ? leg.calculated?.cumulativeDistanceWithTransitions ?? null : null;
}

/** Whether the predictions place a leg in the cruise, undefined without a prediction for the leg */
export function cruisePredictionLookup(
  predictions: ReadonlyMap<number, VerticalWaypointPrediction> | undefined,
): (legIndex: number) => boolean | undefined {
  return (legIndex) => {
    const phase = predictions?.get(legIndex)?.profilePhase;
    return phase !== undefined ? phase === ProfilePhase.Cruise : undefined;
  };
}

/** Splits a cruise stretch at the CMS start and end, so that each piece is flown at one managed target */
export function splitCruiseAtConstantMachSegment(
  fromDistance: NauticalMiles,
  toDistance: NauticalMiles,
  segment: GeographicConstantMachSegment | null,
): CruiseSpeedPiece[] {
  if (
    segment === null ||
    toDistance <= segment.startDistanceFromStart ||
    fromDistance >= segment.endDistanceFromStart
  ) {
    return [{ endDistanceFromStart: toDistance, constantMach: null }];
  }

  const pieces: CruiseSpeedPiece[] = [];
  if (fromDistance < segment.startDistanceFromStart) {
    pieces.push({ endDistanceFromStart: segment.startDistanceFromStart, constantMach: null });
  }

  pieces.push({ endDistanceFromStart: Math.min(toDistance, segment.endDistanceFromStart), constantMach: segment.mach });

  if (toDistance > segment.endDistanceFromStart) {
    pieces.push({ endDistanceFromStart: toDistance, constantMach: null });
  }

  return pieces;
}

/**
 * The managed cruise speed and Mach targets, by priority of the speed restrictions: the climb speed limit, then the CMS
 * Mach while the aircraft flies the segment, then the ECON speed/Mach (the RTA speed/Mach with a time constraint, a CMS
 * has priority over a time constraint). In the segment the speed is VMO, so that the Mach is the target within VMO.
 * @param econSpeed the ECON (or RTA) cruise speed
 * @param econMach the ECON (or RTA) cruise Mach
 * @param activeLegIndex the leg the aircraft flies (TO waypoint)
 * @param speedLimit the climb speed limit while the aircraft is below its altitude, else null
 */
export function managedCruiseSpeedAndMach(
  econSpeed: Knots,
  econMach: Mach,
  segment: ConstantMachSegment | null,
  activeLegIndex: number,
  vmo: Knots,
  speedLimit: Knots | null = null,
): [Knots, Mach] {
  const limit = speedLimit ?? Infinity;
  return segment !== null && isLegInConstantMachSegment(segment, activeLegIndex)
    ? [Math.min(vmo, limit), segment.mach]
    : [Math.min(econSpeed, limit), econMach];
}

/** Whether the managed Mach changes at a CMS start or end, where the ND shows the speed change */
export function isConstantMachSpeedChange(boundary: VerticalCheckpoint, next: VerticalCheckpoint): boolean {
  return (
    boundary.reason === VerticalCheckpointReason.ConstantMachSegmentBoundary &&
    Math.abs(next.mach - boundary.mach) >= CONSTANT_MACH_TOLERANCE
  );
}

/**
 * Whether the predicted speed at a CMS waypoint respects the CMS
 * @param predictedSpeed a Mach number, or a CAS in knots below the crossover altitude
 */
export function isConstantMachRespected(predictedSpeed: Knots | Mach | null | undefined, mach: Mach): boolean {
  if (predictedSpeed === null || predictedSpeed === undefined || !Number.isFinite(predictedSpeed)) {
    return true;
  }

  return predictedSpeed < 1 && Math.abs(predictedSpeed - mach) < CONSTANT_MACH_TOLERANCE;
}
