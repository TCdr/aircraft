// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { bearingTo, Coordinates, distanceTo, placeBearingDistance } from 'msfs-geo';
import { MSA_SECTOR_RADIUS_NM, SafetyAltitudeSource } from './SafetyAltitudeGrid';
import { VdSafetyAltitudeSegment, VdSafetyAltitudeType } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';

/**
 * The safety altitudes the FMS computes for the VD: along the vertical cut (the active flight plan, or the aircraft
 * track), over the VD range, as the grid MORA of the cells the cut crosses, or the MSA of the departure or arrival
 * airport within its 25 NM circle once the flight crew selected a procedure there. No safety altitude across a flight
 * plan discontinuity.
 */

/** The longest VD range */
export const VD_SAFETY_ALTITUDE_RANGE_NM = 160;

/** Design choice: the cut is sampled every nautical mile (the grid MORA cells are 1° wide, the MSA circles 50 NM). */
const SAMPLE_STEP_NM = 1;

/**
 * The cut is twice the maximum of the EPU and the FMS RNP wide. Design choice: it is never wider than 10 NM, the limit
 * of the terrain cut.
 */
const MAX_CUT_HALF_WIDTH_NM = 5;

/** A point of the cut at its distance from the aircraft */
export interface VdCutPoint extends Coordinates {
  distanceNm: number;
}

/** The vertical cut: its points in increasing distance, and the stretches across a flight plan discontinuity */
export interface VdCut {
  points: VdCutPoint[];
  discontinuities: { startNm: number; endNm: number }[];
}

export interface VdMsaCentre extends Coordinates {
  altitudeFt: number | null;
}

/** An element of the active flight plan, from the active leg on, as the cut needs it */
export type VdCutPlanElement =
  | { isDiscontinuity: true }
  | { isDiscontinuity: false; location: Coordinates | null; distanceFromAircraftNm: number | null };

/**
 * @param epuNm the estimated position uncertainty
 * @param rnpNm the FMS RNP
 * @returns half the width of the cut
 */
export function vdCutHalfWidthNm(epuNm: number, rnpNm: number): number {
  const widest = Math.max(Number.isFinite(epuNm) ? epuNm : 0, Number.isFinite(rnpNm) ? rnpNm : 0);
  return Math.min(widest, MAX_CUT_HALF_WIDTH_NM);
}

/**
 * The cut along the aircraft track (selected lateral modes).
 * @param position the aircraft position
 * @param trueTrackDeg the true track
 * @returns the cut
 */
export function vdCutAlongTrack(position: Coordinates, trueTrackDeg: number): VdCut {
  const end = placeBearingDistance(position, trueTrackDeg, VD_SAFETY_ALTITUDE_RANGE_NM);
  return {
    points: [
      { ...position, distanceNm: 0 },
      { lat: end.lat, long: end.long, distanceNm: VD_SAFETY_ALTITUDE_RANGE_NM },
    ],
    discontinuities: [],
  };
}

/**
 * The cut along the active flight plan, through the fixes ahead at their predicted distance. Legs without a fix (or
 * without a prediction) are crossed in a straight line.
 * @param position the aircraft position
 * @param elements the flight plan elements from the active leg on
 * @returns the cut
 */
export function vdCutAlongFlightPlan(position: Coordinates, elements: readonly VdCutPlanElement[]): VdCut {
  const cut: VdCut = { points: [{ ...position, distanceNm: 0 }], discontinuities: [] };
  let discontinuityPending = false;
  for (const element of elements) {
    if (element.isDiscontinuity === true) {
      discontinuityPending = true;
      continue;
    }
    const { location, distanceFromAircraftNm } = element;
    if (location === null || distanceFromAircraftNm === null || distanceFromAircraftNm <= 0) {
      continue;
    }
    const last = cut.points[cut.points.length - 1];
    if (distanceFromAircraftNm <= last.distanceNm) {
      continue;
    }
    if (discontinuityPending) {
      cut.discontinuities.push({ startNm: last.distanceNm, endNm: distanceFromAircraftNm });
      discontinuityPending = false;
    }
    cut.points.push({ lat: location.lat, long: location.long, distanceNm: distanceFromAircraftNm });
    if (distanceFromAircraftNm > VD_SAFETY_ALTITUDE_RANGE_NM) {
      break;
    }
  }
  return cut;
}

/**
 * @param cut the cut
 * @param distanceNm a distance along the cut; beyond its last point the cut goes on straight
 * @returns the position on the cut
 */
export function positionOnCut(cut: VdCut, distanceNm: number): Coordinates {
  const points = cut.points;
  let i = 0;
  while (i < points.length - 2 && points[i + 1].distanceNm < distanceNm) {
    i++;
  }
  const from = points[i];
  if (points.length < 2) {
    return from;
  }
  const to = points[i + 1];
  if (distanceNm > to.distanceNm) {
    return placeBearingDistance(to, bearingTo(from, to), distanceNm - to.distanceNm);
  }
  // The flight plan distance includes the turns: spread it over the straight line between the fixes
  const span = to.distanceNm - from.distanceNm;
  const scale = span > 0 ? distanceTo(from, to) / span : 0;
  return placeBearingDistance(from, bearingTo(from, to), Math.max(0, distanceNm - from.distanceNm) * scale);
}

/**
 * @param source the grid MORA and MSA values
 * @param cut the vertical cut
 * @param msaCentres the airports with an MSA in use (departure or arrival procedure selected)
 * @param halfWidthNm half the width of the cut (see vdCutHalfWidthNm)
 * @returns the safety altitudes over the VD range, equal neighbours merged
 */
export function computeVdSafetyAltitudes(
  source: SafetyAltitudeSource,
  cut: VdCut,
  msaCentres: readonly VdMsaCentre[],
  halfWidthNm: number,
): VdSafetyAltitudeSegment[] {
  const segments: VdSafetyAltitudeSegment[] = [];
  for (let startNm = 0; startNm < VD_SAFETY_ALTITUDE_RANGE_NM; startNm += SAMPLE_STEP_NM) {
    const endNm = startNm + SAMPLE_STEP_NM;
    const middleNm = startNm + SAMPLE_STEP_NM / 2;
    if (cut.discontinuities.some((d) => middleNm > d.startNm && middleNm < d.endNm)) {
      continue;
    }
    const position = positionOnCut(cut, middleNm);
    let type: VdSafetyAltitudeType = 'MORA';
    let altitudeFt: number | null = null;
    const msaHere = msaCentres.filter((c) => distanceTo(c, position) <= MSA_SECTOR_RADIUS_NM);
    if (msaHere.length > 0) {
      type = 'MSA';
      altitudeFt = msaHere.some((c) => c.altitudeFt === null)
        ? null
        : Math.max(...msaHere.map((c) => c.altitudeFt as number));
    } else {
      altitudeFt = source.gridMoraFeet(position.lat, position.long, halfWidthNm);
    }
    const previous = segments[segments.length - 1];
    if (previous && previous.endNm === startNm && previous.type === type && previous.altitudeFt === altitudeFt) {
      previous.endNm = endNm;
    } else {
      segments.push({ startNm, endNm, altitudeFt, type });
    }
  }
  return segments;
}
