// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import type { Fix as CoRouteFix } from '@simbridge/Coroute/Fix';
import type { CoRouteDto } from '@simbridge/Coroute/coroute';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';
import { PilotWaypointType } from '@fmgc/flightplanning/DataManager';
import { FmsDataInterface } from '@fmgc/flightplanning/interface/FmsDataInterface';
import { getApproachName } from '../shared/utils';
import { maxStoredRouteElements, StoredRoute, StoredRouteProcedures } from './PilotStoredElements';

/** One element of a route summary: waypoints in green big font, airways and procedures in small white font (FCOM). */
export interface RouteSummaryToken {
  text: string;
  kind: 'waypoint' | 'via';
}

const directVia = 'DCT';

/**
 * Builds a stored route from a flight plan (FCOM DATA / ROUTE page, NEW ROUTE function: a copy of the active or a
 * secondary flight plan). Only the first {@link maxStoredRouteElements} en-route elements are kept.
 * @returns the route and whether elements were dropped (FCOM: SOME REVISIONS NOT STORED)
 */
export function buildStoredRouteFromPlan(
  plan: ReadonlyFlightPlan,
  ident: string,
  fms: FmsDataInterface,
  alternateIcao?: string,
): { route: StoredRoute; truncated: boolean } {
  const navlog: CoRouteFix[] = [];
  let truncated = false;

  for (let i = 0; i < plan.firstMissedApproachLegIndex; i++) {
    const leg = plan.maybeElementAt(i);
    if (!isLeg(leg) || !leg.isXF()) {
      continue;
    }
    const [segment] = plan.segmentPositionForIndex(i);
    if (segment.class !== SegmentClass.Enroute) {
      continue;
    }
    const fix = leg.terminationWaypoint();
    if (!fix) {
      continue;
    }

    if (navlog.length >= maxStoredRouteElements) {
      truncated = true;
      break;
    }

    const isPilotLatLonWaypoint = fms
      .getStoredWaypointsByIdent(fix.ident)
      .some((wp) => wp.type === PilotWaypointType.LatLon && wp.waypoint.databaseId === fix.databaseId);

    navlog.push({
      ident: fix.ident,
      name: fix.ident,
      type: isPilotLatLonWaypoint ? 'ltlg' : 'wpt',
      via_airway: leg.annotation !== '' ? leg.annotation : directVia,
      is_sid_star: '0',
      pos_lat: fix.location.lat.toString(),
      pos_long: fix.location.long.toString(),
    });
  }

  const approachFirstLeg = plan.allLegs
    .slice(plan.firstApproachLegIndex, plan.firstMissedApproachLegIndex)
    .find((l) => isLeg(l) && l.isXF());

  const procedures: StoredRouteProcedures = {
    originRunwayIdent: plan.originRunway?.ident,
    departureIdent: plan.originDeparture?.ident,
    departureDatabaseId: plan.originDeparture?.databaseId,
    departureTransitionIdent: plan.departureEnrouteTransition?.ident,
    departureTransitionDatabaseId: plan.departureEnrouteTransition?.databaseId,
    arrivalTransitionIdent: plan.arrivalEnrouteTransition?.ident,
    arrivalTransitionDatabaseId: plan.arrivalEnrouteTransition?.databaseId,
    arrivalIdent: plan.arrival?.ident,
    arrivalDatabaseId: plan.arrival?.databaseId,
    approachViaIdent: plan.approachVia?.ident,
    approachViaDatabaseId: plan.approachVia?.databaseId,
    approachIdent: plan.approach ? getApproachName(plan.approach, false) : undefined,
    approachDatabaseId: plan.approach?.databaseId,
    approachFirstWaypointIdent: approachFirstLeg && isLeg(approachFirstLeg) ? approachFirstLeg.ident : undefined,
    destinationRunwayIdent: plan.destinationRunway?.ident,
  };

  return {
    route: {
      ident,
      originIcao: plan.originAirport?.ident ?? '',
      destinationIcao: plan.destinationAirport?.ident ?? '',
      alternateIcao,
      navlog,
      procedures,
    },
    truncated,
  };
}

/** A navigation database (SimBridge) company route in the stored route shape. */
export function routeFromCoRouteDto(dto: CoRouteDto): StoredRoute {
  const navlog = dto.navlog?.fix ?? [];
  const sidFix = navlog.find((f) => f.is_sid_star === '1');
  const starFix = [...navlog].reverse().find((f) => f.is_sid_star === '1' && f !== sidFix);

  return {
    ident: dto.name.toString(),
    originIcao: dto.origin.icao_code.toString(),
    destinationIcao: dto.destination.icao_code.toString(),
    alternateIcao: dto.alternate?.icao_code?.toString() || undefined,
    navlog: navlog.filter((f) => f.type !== 'apt' && f.ident !== 'TOC' && f.ident !== 'TOD'),
    procedures: {
      departureIdent: sidFix?.via_airway?.toString(),
      arrivalIdent: starFix?.via_airway?.toString(),
    },
  };
}

/** The route in the shape the company route uplink adapter inserts. */
export function toCoRoute(route: StoredRoute) {
  return {
    routeNumber: route.ident,
    originIcao: route.originIcao,
    destinationIcao: route.destinationIcao,
    alternateIcao: route.alternateIcao,
    route: '',
    navlog: route.navlog,
  };
}

/**
 * The route summary of the FCOM (DATA / ROUTE and ROUTE SELECTION pages): read left to right, waypoints in green big
 * font, airways and procedures in small white font; direct legs are indicated with DIR, a runway with RWY, and for an
 * approach only its first waypoint and its name are shown.
 */
export function routeSummaryTokens(route: StoredRoute): RouteSummaryToken[] {
  // The summary is a list of (VIA, TO) pairs, as in the FCOM figures (DSC-22-FMS-20-30 P 83, 85, 89): a runway is
  // RWY + runway, a procedure is its name + its last waypoint, an airway is its name + the exit waypoint, a direct leg
  // is DIR + the waypoint, and an approach is its name + its first waypoint.
  const tokens: RouteSummaryToken[] = [];
  const pair = (via: string | undefined, waypoint: string | undefined) => {
    tokens.push({ text: via ?? '', kind: 'via' });
    tokens.push({ text: waypoint ?? '', kind: 'waypoint' });
  };
  const p = route.procedures;

  const firstEnroute = route.navlog.findIndex((f) => f.is_sid_star !== '1');
  const sidFixes = firstEnroute < 0 ? route.navlog : route.navlog.slice(0, firstEnroute);
  const lastEnroute = route.navlog.length - 1 - [...route.navlog].reverse().findIndex((f) => f.is_sid_star !== '1');
  const starFixes = firstEnroute < 0 ? [] : route.navlog.slice(lastEnroute + 1);

  if (p.originRunwayIdent) {
    pair('RWY', runwaySuffix(p.originRunwayIdent));
  }
  if (p.departureIdent) {
    pair(p.departureIdent, sidFixes[sidFixes.length - 1]?.ident?.toString());
  }
  if (p.departureTransitionIdent) {
    pair(p.departureTransitionIdent, undefined);
  }

  const enroute = route.navlog.filter((f) => f.is_sid_star !== '1');
  for (let i = 0; i < enroute.length; i++) {
    const fix = enroute[i];
    const airway = fix.via_airway?.toString() ?? directVia;
    const isDirect = airway === directVia || airway === 'DCT*' || airway === '';
    if (isDirect) {
      pair('DIR', fix.ident.toString());
    } else {
      // An airway is shown once, with the waypoint where the route leaves it
      const next = enroute[i + 1];
      if (next?.via_airway?.toString() !== airway) {
        pair(airway, fix.ident.toString());
      }
    }
  }

  if (p.arrivalTransitionIdent) {
    pair(p.arrivalTransitionIdent, undefined);
  }
  if (p.arrivalIdent) {
    pair(p.arrivalIdent, starFixes[starFixes.length - 1]?.ident?.toString());
  }
  if (p.approachViaIdent) {
    // FCOM: the VIA part of a procedure is indicated with DIR
    pair('DIR', undefined);
  }
  if (p.approachIdent || p.approachFirstWaypointIdent) {
    pair(p.approachIdent, p.approachFirstWaypointIdent);
  }
  if (p.destinationRunwayIdent) {
    pair('RWY', runwaySuffix(p.destinationRunwayIdent));
  }

  return tokens;
}

/** "26L" from a runway ident such as "LFPG26L" (the airport ident is the first four characters). */
function runwaySuffix(runwayIdent: string): string {
  return runwayIdent.length > 4 ? runwayIdent.substring(4) : runwayIdent;
}
