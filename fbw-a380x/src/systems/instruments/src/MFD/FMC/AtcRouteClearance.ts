// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Airway, Fix } from '@flybywiresim/fbw-sdk';
import { Coordinates, distanceTo } from 'msfs-geo';
import { CpdlcMessage, UplinkMessageInterpretation } from '@datalink/common';

/**
 * The route clearances the FMS loads in the third secondary flight plan with the LOAD-SEC3 button of the mailbox
 * (A380 FCOM DSC-22-FMS-10-40-100 "Received ATC F-PLN clearance", DSC-46-10-40 "How to manage a loadable message"):
 * UM79 CLEARED TO [position] VIA [route clearance], UM80 CLEARED [route clearance], UM83 AT [position] CLEARED [route
 * clearance]. The route clearance reaches the aircraft as text (e.g. "DIBAG UT210 TUDRA UT158 AMB").
 */
export type RouteClearanceType = 'UM79' | 'UM80' | 'UM83';

/** A route clearance, as the FMS reads it from the uplink message */
export interface RouteClearance {
  typeId: RouteClearanceType;
  /** UM79: the clearance limit, the last point of the route */
  clearanceLimit: string | null;
  /** UM83: the point of the flight plan where the new route starts */
  joinPosition: string | null;
  /** The route: airports, SID, waypoints, airways, lat/long points and STAR, in order */
  tokens: string[];
}

/** An element of the route clearance that the FMS rejected (REJECTED ATC INFO page, FCOM DSC-22-FMS-20-30 P 321) */
export interface RejectedAtcElement {
  /** The type of element, as the FCOM figure names them (EN RTE WPTS, AIRWAYS, SID, STAR...) */
  description: string;
  /** The element as received */
  value: string;
  /** The waypoint the element follows in the route (AT xxxxx), if any */
  at: string | null;
  /** The reason for the rejection */
  error: string;
}

/** An element of the route clearance found in the navigation database */
export type RouteClearanceItem =
  | { kind: 'sid'; ident: string; databaseId: string }
  | { kind: 'star'; ident: string; databaseId: string }
  | { kind: 'fix'; fix: Fix }
  | { kind: 'latlon'; ident: string; location: Coordinates }
  | { kind: 'airway'; airway: Airway; to: Fix };

/** The route clearance resolved against the navigation database */
export interface ResolvedRouteClearance {
  /** The SID first, then the en route elements, then the STAR */
  items: RouteClearanceItem[];
  rejected: RejectedAtcElement[];
  /** The airport at the end of the route when it is not the destination of the flight plan */
  newDestination: string | null;
}

/** The navigation database, as the route clearance needs it */
export interface RouteClearanceDatabase {
  /** The waypoints and navaids with this ident */
  fixes(ident: string): Promise<Fix[]>;
  /** The airways with this ident, near a fix */
  airways(ident: string, from: Fix): Promise<Airway[]>;
  /** The SIDs of an airport */
  departures(airport: string): Promise<{ ident: string; databaseId: string }[]>;
  /** The STARs of an airport */
  arrivals(airport: string): Promise<{ ident: string; databaseId: string }[]>;
  /** Whether an airport with this ICAO code exists */
  isAirport(ident: string): Promise<boolean>;
}

/** The error types of the FCOM figure (DSC-22-FMS-20-30 P 321), and the FMS message of an airway entry */
export const REJECT_NOT_IN_DATABASE = 'NOT IN DATABASE';
export const REJECT_NOT_ALLOWED_IN_PHASE = 'DATA NOT ALLOWED IN PHASE';
export const REJECT_AWY_WPT_MISMATCH = 'AWY/WPT MISMATCH';

/** A speed / level group of an ICAO route (e.g. N0480F350, M082F370), not a route element */
const SPEED_LEVEL = /^[NKM]\d{3,4}([FAMS]\d{3,4}|VFR)$/;
/** An airway designator (e.g. UT210, J65, UN871, Q100) */
const AIRWAY_LIKE = /^[A-Z]{1,3}\d{1,4}[A-Z]?$/;
/** An ICAO lat/long point: 2 or 4 digits of latitude, N/S, 3 or 5 digits of longitude, E/W (e.g. 45N073W, 4530N07330W) */
const LAT_LONG = /^(\d{2})(\d{2})?([NS])(\d{3})(\d{2})?([EW])$/;

/**
 * The route clearance of an uplink message
 * @param message the uplink message
 * @returns the route clearance, or null when the message has none
 */
export function routeClearanceOf(message: CpdlcMessage): RouteClearance | null {
  const element = message.Content?.find((e) => UplinkMessageInterpretation.RouteClearanceMessages.includes(e.TypeId));
  if (!element) {
    return null;
  }
  const value = (index: number) => (element.Content[index]?.Value ?? '').trim().toUpperCase();
  const typeId = element.TypeId as RouteClearanceType;
  switch (typeId) {
    case 'UM79': {
      const clearanceLimit = value(0);
      const tokens = routeTokens(value(1));
      // The clearance limit ends the route
      if (clearanceLimit !== '' && tokens[tokens.length - 1] !== clearanceLimit) {
        tokens.push(clearanceLimit);
      }
      return { typeId, clearanceLimit: clearanceLimit || null, joinPosition: null, tokens };
    }
    case 'UM80':
      return { typeId, clearanceLimit: null, joinPosition: null, tokens: routeTokens(value(0)) };
    case 'UM83':
      return { typeId, clearanceLimit: null, joinPosition: value(0) || null, tokens: routeTokens(value(1)) };
  }
  return null;
}

/**
 * The elements of a route in text: DCT, the speed / level groups and the dots of the ICAO format left out
 * @param route the route, e.g. "SSTIK3 SSTIK DCT ORCUS Q3 JINMO" or "DIBAG.UT210.TUDRA"
 * @returns the elements, in capitals
 */
export function routeTokens(route: string): string[] {
  return route
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .map((token) => token.split('/')[0])
    .filter((token) => token !== '' && token !== 'DCT' && token !== 'DIRECT' && !SPEED_LEVEL.test(token));
}

/**
 * The position of an ICAO lat/long point
 * @param token the point, e.g. 45N073W or 4530N07330W
 * @returns the position, or null when the token is not a lat/long point
 */
export function latLongOf(token: string): Coordinates | null {
  const match = LAT_LONG.exec(token);
  if (!match) {
    return null;
  }
  const lat = (parseInt(match[1]) + parseInt(match[2] ?? '0') / 60) * (match[3] === 'S' ? -1 : 1);
  const long = (parseInt(match[4]) + parseInt(match[5] ?? '0') / 60) * (match[6] === 'W' ? -1 : 1);
  if (Math.abs(lat) > 90 || Math.abs(long) > 180) {
    return null;
  }
  return { lat, long };
}

/**
 * The fix nearest to a position, for idents used by several fixes
 * @param fixes the fixes with the same ident
 * @param near the previous point of the route, or the aircraft position
 * @returns the nearest fix
 */
function nearestFix(fixes: Fix[], near: Coordinates | null): Fix {
  if (!near || fixes.length === 1) {
    return fixes[0];
  }
  let best = fixes[0];
  let bestDistance = Number.MAX_VALUE;
  for (const fix of fixes) {
    const distance = distanceTo(fix.location, near);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = fix;
    }
  }
  return best;
}

/**
 * Finds the elements of a route clearance in the navigation database. The origin airport (first) and the destination
 * airport (last) are optional; a SID follows the origin, a STAR precedes the destination. Between two points, an ident
 * that is an airway through the first point goes to the second point along that airway. Unknown elements are rejected,
 * and the route goes on with the next element.
 * @param clearance the route clearance
 * @param origin the origin airport of the flight plan, if any
 * @param destination the destination airport of the flight plan, if any
 * @param near the position the route starts from (the aircraft or the origin), for idents used by several fixes
 * @param sidAllowed false once the aircraft flies the en route part: a SID is then rejected
 * @param db the navigation database
 * @returns the elements found and the rejected elements
 */
export async function resolveRouteClearance(
  clearance: RouteClearance,
  origin: string | null,
  destination: string | null,
  near: Coordinates | null,
  sidAllowed: boolean,
  db: RouteClearanceDatabase,
): Promise<ResolvedRouteClearance> {
  const tokens = clearance.tokens.slice();
  const items: RouteClearanceItem[] = [];
  const rejected: RejectedAtcElement[] = [];

  if (origin !== null && tokens[0] === origin) {
    tokens.shift();
  }

  // The airport at the end of the route: the destination, or a new one
  let newDestination: string | null = null;
  let arrivalAirport = destination;
  const last = tokens[tokens.length - 1];
  let lastIsAirport = last !== undefined && /^[A-Z]{4}$/.test(last) && last === destination;
  if (!lastIsAirport && last !== undefined && /^[A-Z]{4}$/.test(last)) {
    lastIsAirport = await db.isAirport(last);
  }
  if (last !== undefined && lastIsAirport) {
    tokens.pop();
    if (last !== destination) {
      newDestination = last;
      arrivalAirport = last;
    }
  }

  let previousIdent: string | null = origin;

  // The SID, first element after the origin
  if (origin !== null && tokens.length > 0) {
    const sid = (await db.departures(origin)).find((procedure) => procedure.ident === tokens[0]);
    if (sid) {
      tokens.shift();
      if (sidAllowed) {
        items.push({ kind: 'sid', ident: sid.ident, databaseId: sid.databaseId });
        previousIdent = sid.ident;
      } else {
        rejected.push({ description: 'SID', value: sid.ident, at: origin, error: REJECT_NOT_ALLOWED_IN_PHASE });
      }
    }
  }

  // The STAR, last element before the destination
  let star: RouteClearanceItem | null = null;
  if (arrivalAirport !== null && tokens.length > 0) {
    const arrival = (await db.arrivals(arrivalAirport)).find(
      (procedure) => procedure.ident === tokens[tokens.length - 1],
    );
    if (arrival) {
      tokens.pop();
      star = { kind: 'star', ident: arrival.ident, databaseId: arrival.databaseId };
    }
  }

  let previousFix: Fix | null = null;
  let previousLocation: Coordinates | null = near;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    const location = latLongOf(token);
    if (location) {
      items.push({ kind: 'latlon', ident: token, location });
      previousFix = null;
      previousIdent = token;
      previousLocation = location;
      continue;
    }

    // An airway from the previous fix to the next element
    if (previousFix !== null && i + 1 < tokens.length) {
      const from: Fix = previousFix;
      const airways = await db.airways(token, from);
      const airway: Airway | undefined = airways.find((a) =>
        a.fixes.some((f) => f.ident === from.ident && f.icaoCode === from.icaoCode),
      );
      const to: Fix | undefined = airway?.fixes.find((f: Fix) => f.ident === tokens[i + 1] && f.ident !== from.ident);
      if (airway && to) {
        items.push({ kind: 'airway', airway, to });
        previousFix = to;
        previousIdent = to.ident;
        previousLocation = to.location;
        i++;
        continue;
      }
      if (airways.length > 0) {
        // An airway that does not go from the previous waypoint to the next one: the next waypoint is joined direct
        rejected.push({ description: 'AIRWAYS', value: token, at: previousIdent, error: REJECT_AWY_WPT_MISMATCH });
        continue;
      }
    }

    const fixes = await db.fixes(token);
    if (fixes.length > 0) {
      const fix = nearestFix(fixes, previousLocation);
      items.push({ kind: 'fix', fix });
      previousFix = fix;
      previousIdent = fix.ident;
      previousLocation = fix.location;
      continue;
    }

    rejected.push({
      description: AIRWAY_LIKE.test(token) ? 'AIRWAYS' : 'EN RTE WPTS',
      value: token,
      at: previousIdent,
      error: REJECT_NOT_IN_DATABASE,
    });
  }

  if (star) {
    items.push(star);
  }

  return { items, rejected, newDestination };
}
