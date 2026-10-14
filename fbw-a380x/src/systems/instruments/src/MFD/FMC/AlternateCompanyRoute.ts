// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { Fix as CoRouteFix } from '@simbridge/Coroute/Fix';
import { Fix } from '@flybywiresim/fbw-sdk';
import { distanceTo } from 'msfs-geo';

/**
 * The alternate company route of the INIT page (A380 FCOM DSC-22-FMS-20-30 ALTERNATE ROUTE ENTRY FIELD,
 * a380_fcom.txt l.36743-36775): a company route from the primary destination to the alternate destination, from the
 * pilot stored routes or the navigation database company routes (SimBridge).
 */

/** Why an ALTN RTE entry is refused, null when it is accepted */
export type AlternateRouteEntryError = 'NOT_ALLOWED' | 'NOT_IN_DATABASE' | 'DEST_ALTN_CPNY_RTE_DISAGREE' | null;

/**
 * Whether the crew can enter an alternate company route: "The flight crew can not enter the alternate company route
 * (on the ACTIVE / INIT page) when: No primary destination is defined, or A temporary flight plan is pending."
 * (l.36770-36773)
 * @param primaryDestinationIcao the destination of the flight plan
 * @param temporaryPending a temporary flight plan is pending
 * @returns true when the ALTN RTE field takes an entry
 */
export function isAlternateRouteEntryAllowed(
  primaryDestinationIcao: string | undefined,
  temporaryPending: boolean,
): boolean {
  return !!primaryDestinationIcao && !temporaryPending;
}

/**
 * The check of an ALTN RTE entry: unknown route NOT IN DATABASE; DEST / ALTN CPNY RTE DISAGREE (Type I, FCOM
 * DSC-22-FMS-20-110 l.45310-45316): "The flight crew tried to enter an alternate company route, and the origin airport
 * of the alternate company route does not match the destination airport of the primary flight plan."
 * @param route the route found for the entered ident, undefined when none
 * @param primaryDestinationIcao the destination of the flight plan
 * @returns the error, null when the route can be inserted
 */
export function alternateRouteEntryError(
  route: { originIcao: string } | undefined,
  primaryDestinationIcao: string | undefined,
): AlternateRouteEntryError {
  if (!primaryDestinationIcao) {
    return 'NOT_ALLOWED';
  }
  if (!route) {
    return 'NOT_IN_DATABASE';
  }
  return route.originIcao !== primaryDestinationIcao ? 'DEST_ALTN_CPNY_RTE_DISAGREE' : null;
}

/** The alternate company route inserted into a flight plan, for the ALTN RTE field */
export interface InsertedAlternateRoute {
  ident: string;
  /** The alternate destination of the route: the field shows the route while the plan keeps this alternate */
  alternateIcao: string;
}

/**
 * The text of the ALTN RTE field: the inserted route while the plan keeps its alternate, else NONE when a primary
 * destination is defined ("If a primary destination is defined, and no alternate route has been selected, then the
 * Alternate Route field displays NONE.", l.36761-36762), else empty.
 * @param inserted the alternate company route inserted into the plan, null when none
 * @param alternateIcao the alternate destination of the plan
 * @param hasPrimaryDestination a primary destination is defined
 * @returns the field text, null when the field is empty
 */
export function alternateRouteFieldText(
  inserted: InsertedAlternateRoute | null,
  alternateIcao: string | undefined,
  hasPrimaryDestination: boolean,
): string | null {
  if (inserted !== null && inserted.alternateIcao === alternateIcao) {
    return inserted.ident;
  }
  return hasPrimaryDestination ? 'NONE' : null;
}

/**
 * The fixes of the alternate route to insert: the en-route fixes of the navlog (the SID and STAR fixes are procedure
 * legs, airports and TOC/TOD are not fixes), each one the database fix with that ident nearest to its navlog position.
 * Simplified: the fixes are inserted as direct legs (the alternate flight plan shows no airway idents).
 * @param navlog the navlog of the route
 * @param searchFixes finds the database fixes with an ident
 * @returns the fixes, in order; a fix missing from the database is left out
 */
export async function alternateRouteFixes(
  navlog: readonly CoRouteFix[],
  searchFixes: (ident: string) => Promise<Fix[]>,
): Promise<Fix[]> {
  const fixes: Fix[] = [];
  for (const entry of navlog) {
    if (entry.is_sid_star === '1' || entry.type === 'apt' || entry.ident === 'TOC' || entry.ident === 'TOD') {
      continue;
    }
    const candidates = await searchFixes(entry.ident.toString());
    if (candidates.length === 0) {
      continue;
    }
    const hint = { lat: Number(entry.pos_lat), long: Number(entry.pos_long) };
    const nearest =
      Number.isFinite(hint.lat) && Number.isFinite(hint.long)
        ? candidates.reduce((best, fix) =>
            distanceTo(fix.location, hint) < distanceTo(best.location, hint) ? fix : best,
          )
        : candidates[0];
    fixes.push(nearest);
  }
  return fixes;
}
