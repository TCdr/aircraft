// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { AltitudeDescriptor, Fix, ProcedureLeg, WaypointArea } from '@flybywiresim/fbw-sdk';
import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';

/*
 * The database hold of a hold fix (HOLD page DATABASE button / revert, both aircraft).
 *
 * The DATABASE key reverts the hold to the one stored in the navigation database for the revised waypoint: its
 * inbound course, turn side and leg size. On the A380 the button also updates the temporary flight plan, and it cannot
 * be selected when the waypoint has no database hold.
 */

/**
 * How far an altitude is outside the altitude window of a database hold, in feet (0 when inside, or without a window).
 * @param altitude the predicted altitude at the hold, ft
 * @param hold the database hold
 */
export function holdVerticalDistanceFromAltitude(
  altitude: number,
  hold: Pick<ProcedureLeg, 'altitudeDescriptor' | 'altitude1' | 'altitude2'>,
): number {
  const altitude1 = hold.altitude1 ?? 0;
  const altitude2 = hold.altitude2 ?? 0;
  switch (hold.altitudeDescriptor) {
    case AltitudeDescriptor.BetweenAlt1Alt2:
      if (altitude <= altitude1 && altitude >= altitude2) {
        return 0;
      }
      return altitude > altitude1 ? altitude - altitude1 : altitude2 - altitude;
    case AltitudeDescriptor.AtOrAboveAlt1:
      return Math.max(0, altitude1 - altitude);
    case AltitudeDescriptor.AtOrBelowAlt1:
      return Math.max(0, altitude - altitude1);
    default:
      // no restriction, so always suitable
      return 0;
  }
}

/**
 * Picks the database hold of a hold fix: the holds of the fix (same database id), the one whose altitude window suits the
 * predicted altitude best, then the one whose inbound course is closest to the course to the fix.
 * The navigation database has no indicator of the airspace a hold belongs to, so the altitude and the course decide.
 * @param holds the holds of the database for the fix ident (several airports may list the same hold)
 * @param fixDatabaseId the database id of the hold fix
 * @param altitude the predicted altitude at the hold, ft
 * @param inboundCourse the course of the leg to the hold fix, degrees
 * @returns the hold parameters, or undefined without a database hold for this fix
 */
export function selectDatabaseHold(
  holds: readonly ProcedureLeg[],
  fixDatabaseId: string,
  altitude: number,
  inboundCourse: number,
): HoldData | undefined {
  const candidates = holds
    .filter((hold) => hold.waypoint?.databaseId === fixDatabaseId && hold.course !== undefined)
    .sort((a, b) => {
      const byAltitude = holdVerticalDistanceFromAltitude(altitude, a) - holdVerticalDistanceFromAltitude(altitude, b);
      if (byAltitude !== 0) {
        return byAltitude;
      }
      return Math.abs((a.course ?? 0) - inboundCourse) - Math.abs((b.course ?? 0) - inboundCourse);
    });

  const best = candidates[0];
  if (!best) {
    return undefined;
  }
  return {
    inboundMagneticCourse: best.course,
    turnDirection: best.turnDirection,
    time: best.lengthTime ? best.lengthTime : undefined,
    distance: best.length ? best.length : undefined,
    type: HoldType.Database,
  };
}

/**
 * The airports whose database lists the holds of a fix: the origin, the destination, and the airport of a terminal fix.
 * The MSFS database stores the holds per airport.
 * @param fix the hold fix
 * @param originIdent the origin airport ident of the flight plan, if any
 * @param destinationIdent the destination airport ident of the flight plan, if any
 */
export function holdAirportIdents(fix: Fix, originIdent?: string, destinationIdent?: string): string[] {
  const idents: string[] = [];
  const add = (ident: string | undefined) => {
    if (ident && ident.length > 0 && idents.indexOf(ident) < 0) {
      idents.push(ident);
    }
  };
  add(originIdent);
  add(destinationIdent);
  if (fix.area === WaypointArea.Terminal && 'airportIdent' in fix) {
    add(fix.airportIdent);
  }
  return idents;
}

/**
 * Looks up the database hold of a hold fix in the active navigation database.
 * @param fix the hold fix
 * @param originIdent the origin airport ident of the flight plan, if any
 * @param destinationIdent the destination airport ident of the flight plan, if any
 * @param altitude the predicted altitude at the hold, ft
 * @param inboundCourse the course of the leg to the hold fix, degrees
 * @returns the hold parameters, or undefined without a database hold for this fix
 */
export async function findDatabaseHold(
  fix: Fix,
  originIdent: string | undefined,
  destinationIdent: string | undefined,
  altitude: number,
  inboundCourse: number,
): Promise<HoldData | undefined> {
  const airports = holdAirportIdents(fix, originIdent, destinationIdent);
  const holdLists = await Promise.all(
    airports.map((airport) =>
      NavigationDatabaseService.activeDatabase.getHolds(fix.ident, airport).catch(() => [] as ProcedureLeg[]),
    ),
  );
  const holds: ProcedureLeg[] = [];
  holdLists.forEach((list) => holds.push(...list));
  return selectDatabaseHold(holds, fix.databaseId, altitude, inboundCourse);
}
