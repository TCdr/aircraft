// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AirportSubsectionCode,
  Approach,
  ApproachType,
  Fix,
  isVhfNavaid,
  ProcedureLeg,
  Runway,
  SyntheticApproachProvider,
  VhfNavaidType,
} from '@flybywiresim/fbw-sdk';
import {
  GbasApproach,
  findRunwayOfGbasApproach,
  gbasApproachesOfAirport,
  gbasRunwayDesignation,
  hasGbasApproaches,
} from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';
import { defineGbasApproach } from './GbasApproachDefinition';

/** ARINC 424 route type of a GLS approach */
const GLS_IDENT_PREFIX = 'J';

const RUNWAY_FIX_PATTERN = /^(RW|[A-Z]{4})\d{2}[LCRT]?$/;

/**
 * GLS charts share the lateral path and the missed approach of the ILS (or RNAV) approach of their runway, so the GLS
 * approach is a copy of that approach with the identity of the GLS procedure. Nothing is invented: a runway with
 * neither an ILS nor an RNAV approach ending at the runway gets no GLS.
 */
export function createGlsSyntheticApproachProvider(): SyntheticApproachProvider {
  // The copies depend on the navigation data of one database only, which is what this provider is set on
  const cache = new Map<string, Promise<Approach[]>>();

  return (airportIdentifier, approaches, getRunways) => {
    if (!hasGbasApproaches(airportIdentifier)) {
      return Promise.resolve([]);
    }

    let synthetic = cache.get(airportIdentifier);
    if (!synthetic) {
      synthetic = getRunways().then((runways) => createGlsApproaches(airportIdentifier, approaches, runways));
      cache.set(airportIdentifier, synthetic);
      synthetic.catch(() => cache.delete(airportIdentifier));
    }
    // The flight plan changes the legs it is given, so no two callers may share them
    return synthetic.then((glsApproaches) => glsApproaches.map(cloneApproach));
  };
}

function cloneApproach(approach: Approach): Approach {
  return {
    ...approach,
    legs: approach.legs.map((leg) => ({ ...leg })),
    missedLegs: approach.missedLegs.map((leg) => ({ ...leg })),
    transitions: approach.transitions.map((transition) => ({
      ...transition,
      legs: transition.legs.map((leg) => ({ ...leg })),
    })),
  };
}

/**
 * @param airportIdentifier the airport
 * @param approaches the approaches of the navigation data
 * @param runways the runways of the airport in the sim
 * @returns a GLS approach for each table row whose runway is in the sim, agrees with the chart and has an approach to copy
 */
export function createGlsApproaches(
  airportIdentifier: string,
  approaches: readonly Approach[],
  runways: readonly Runway[],
): Approach[] {
  const glsApproaches: Approach[] = [];

  for (const row of gbasApproachesOfAirport(airportIdentifier)) {
    const runway = findRunwayOfGbasApproach(runways, row) ?? null;
    if (defineGbasApproach(row, runway).definition === null) {
      continue;
    }

    const approachesOfRunway = approaches.filter(
      (approach) => gbasRunwayDesignation(approach.runwayIdent) === row.runway,
    );
    const hasRealGls = approachesOfRunway.some(
      (approach) => approach.type === ApproachType.Gls && approach.multipleIndicator === row.suffix,
    );
    const source = hasRealGls ? undefined : findSourceApproach(approachesOfRunway);
    if (source) {
      glsApproaches.push(copyAsGlsApproach(airportIdentifier, source, row));
    }
  }

  return glsApproaches;
}

function findSourceApproach(approachesOfRunway: readonly Approach[]): Approach | undefined {
  return (
    approachesOfRunway.find((approach) => approach.type === ApproachType.Ils) ??
    approachesOfRunway.find(
      (approach) =>
        (approach.type === ApproachType.Rnav || approach.type === ApproachType.Gps) &&
        !approach.authorisationRequired &&
        endsAtRunway(approach),
    )
  );
}

function endsAtRunway(approach: Approach): boolean {
  const finalLegFix = approach.legs[approach.legs.length - 1]?.waypoint;
  return finalLegFix !== undefined && RUNWAY_FIX_PATTERN.test(finalLegFix.ident);
}

function glsIdent(row: GbasApproach): string {
  // Like the ident of the navigation data: a suffix after a runway without designator needs a dash
  const separator = row.suffix && !/[LCRT]$/.test(row.runway) ? '-' : '';
  return `${GLS_IDENT_PREFIX}${row.runway}${separator}${row.suffix}`;
}

function copyAsGlsApproach(airportIdentifier: string, source: Approach, row: GbasApproach): Approach {
  const ident = glsIdent(row);
  const legs = source.legs.map((leg) => copyLeg(leg, ident));
  const finalLeg = legs[legs.length - 1];
  if (finalLeg) {
    finalLeg.verticalAngle = -row.gpa;
  }

  return {
    ...source,
    // Built from the table, not the source, so that the id survives a change of the source approach
    databaseId: `P${source.icaoCode}${airportIdentifier}${ident}`,
    ident,
    multipleIndicator: row.suffix,
    type: ApproachType.Gls,
    authorisationRequired: false,
    missedApproachAuthorisationRequired: false,
    levelOfService: undefined,
    transitions: source.transitions.map((transition) => ({
      ...transition,
      databaseId: `${transition.databaseId}${ident}`,
      legs: transition.legs.map((leg) => copyLeg(leg, ident)),
    })),
    legs,
    missedLegs: source.missedLegs.map((leg) => copyLeg(leg, ident)),
  };
}

function copyLeg(leg: ProcedureLeg, procedureIdent: string): ProcedureLeg {
  const copy: ProcedureLeg = { ...leg, procedureIdent };
  if (isLandingSystemFix(leg.recommendedNavaid)) {
    // The ILS of the source must not be tuned for a GLS approach
    copy.recommendedNavaid = undefined;
  }
  return copy;
}

function isLandingSystemFix(fix: Fix | undefined): boolean {
  if (!fix) {
    return false;
  }
  return (
    (fix as { subSectionCode: unknown }).subSectionCode === AirportSubsectionCode.LocalizerGlideSlope ||
    (isVhfNavaid(fix) && fix.type === VhfNavaidType.IlsDme)
  );
}
