// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { bearingTo, Coordinates, distanceTo, placeBearingDistance } from 'msfs-geo';
import { Fix } from '@flybywiresim/fbw-sdk';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';

/**
 * PLACE/DIST (PD) waypoints: a waypoint defined by a distance from a flight plan waypoint, along the flight plan.
 *
 * A320 FCOM DSC-22_20-30-10-18 (a320_fcom.txt l.13512): "A Place/Distance (PD). The waypoint is defined by a distance
 * from a place, along the F-PLN."; l.13519-13520: a pilot defined waypoint is identified as "PD xx (xx is a two-digit
 * number between 01 and 20)"; data entry format l.23669-23674: "DIST: 0 - 999.9", NM.
 * A380 FCOM DSC-22-FMS-20-100 PLACE / DISTANCE (PD) (a380_fcom.txt l.43981-43998): "PLACE: XXXXXXX", "DISTANCE: +/-
 * NNN.N (if no sign, FMS assumes +)", "Min: 0 nm , Max: 999.9 nm", "The distance is also limited so that the
 * place/distance waypoint cannot be before (after) the waypoint that precedes (follows) the PLACE waypoint.";
 * DSC-22-FMS-10-40-50 (l.24831-24836): "A PD waypoint, with a negative distance (example: LMG/-15), is inserted
 * "before" the revised waypoint", "The "place" waypoint needs to be the revised waypoint"; DSC-22-FMS-20-30 P 153
 * (l.35155-35159): it is displayed in the PDNN format.
 */

/** A PLACE/DIST entry: the place ident and the signed distance along the flight plan, NM (negative: before the place) */
export interface PlaceDistanceEntry {
  place: string;
  distance: number;
}

/** The PD format: a place of 2 to 7 characters, a slash, and an optionally signed distance with one decimal */
const PLACE_DISTANCE_FORMAT = /^([A-Z0-9]{2,7})\/([+-]?)([0-9]{1,3}(\.[0-9])?)$/;

/** FCOM: DIST 0 - 999.9 NM */
const MAX_PLACE_DISTANCE = 999.9;

/**
 * Parses a PLACE/DIST entry
 * @throws FmsError FORMAT ERROR when the entry is not in the PLACE/DIST format
 */
export function parsePlaceDistance(entry: string): PlaceDistanceEntry {
  const match = entry.match(PLACE_DISTANCE_FORMAT);
  if (match === null) {
    throw new FmsError(FmsErrorType.FormatError);
  }
  const distance = parseFloat(match[3]);
  if (distance > MAX_PLACE_DISTANCE) {
    throw new FmsError(FmsErrorType.EntryOutOfRange);
  }
  return { place: match[1], distance: match[2] === '-' ? -distance : distance };
}

/** The place of a PD waypoint in a flight plan, and the position of the PD waypoint on the leg before or after it */
export interface PlaceDistancePosition {
  /** The index of the place waypoint in the flight plan */
  placeLegIndex: number;
  /** The place waypoint */
  place: Fix;
  /** The position of the PD waypoint */
  location: Coordinates;
}

/** The termination fix of a flight plan element, when it is a leg ending at a fix (a leg the PD can be placed on) */
function fixOf(element: ReadonlyFlightPlanElement | undefined | null): Fix | undefined {
  if (!element || element.isDiscontinuity === true || !element.isXF()) {
    return undefined;
  }
  return element.terminationWaypoint() ?? undefined;
}

/**
 * The position of a PLACE/DIST waypoint in a flight plan: the first waypoint named PLACE from `fromIndex` on (or the
 * revised waypoint when the place must be the revised waypoint), and the point at DIST from it on the leg to the
 * following waypoint (positive DIST) or from the preceding waypoint (negative DIST), along the great circle of that leg.
 * @param elements the flight plan elements
 * @param entry the PLACE/DIST entry
 * @param fromIndex the first flight plan index where the place is looked for (the FROM waypoint, or the revised one)
 * @param revisedLegIndex when set, the place must be this waypoint (A380 FCOM: PLACE / WPT DISAGREE otherwise)
 * @throws FmsError NOT IN DATABASE when the place is not a waypoint of the flight plan, ENTRY OUT OF RANGE when the PD
 * waypoint would be beyond the preceding or following waypoint or there is no leg there (discontinuity, end of plan)
 */
export function placeDistancePosition(
  elements: readonly ReadonlyFlightPlanElement[],
  entry: PlaceDistanceEntry,
  fromIndex: number,
  revisedLegIndex?: number,
): PlaceDistancePosition {
  let placeLegIndex = -1;
  if (revisedLegIndex !== undefined) {
    const revised = elements[revisedLegIndex];
    if (!revised || revised.isDiscontinuity === true || revised.ident !== entry.place) {
      throw new FmsError(FmsErrorType.PlaceWaypointDisagree);
    }
    placeLegIndex = revisedLegIndex;
  } else {
    for (let i = Math.max(0, fromIndex); i < elements.length; i++) {
      const element = elements[i];
      if (element.isDiscontinuity === false && element.ident === entry.place && fixOf(element)) {
        placeLegIndex = i;
        break;
      }
    }
  }

  const place = fixOf(elements[placeLegIndex]);
  if (placeLegIndex < 0 || !place) {
    throw new FmsError(FmsErrorType.NotInDatabase);
  }

  // The PD waypoint stays on the leg next to the place: from the place to the following waypoint, or from the preceding
  // waypoint to the place (a discontinuity there has no leg)
  const neighbour = entry.distance < 0 ? elements[placeLegIndex - 1] : elements[placeLegIndex + 1];
  const neighbourFix = fixOf(neighbour);
  if (!neighbourFix) {
    throw new FmsError(FmsErrorType.EntryOutOfRange);
  }
  const distance = Math.abs(entry.distance);
  if (distance >= distanceTo(place.location, neighbourFix.location)) {
    throw new FmsError(FmsErrorType.EntryOutOfRange);
  }

  return {
    placeLegIndex,
    place,
    location: placeBearingDistance(place.location, bearingTo(place.location, neighbourFix.location), distance),
  };
}
