// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import gbasRunways from './gbas-runways.json';

/** One charted GLS procedure. Position, elevation and length of the runway come from the sim, not from here. */
export interface GbasApproach {
  /** ICAO ident of the airport */
  airport: string;
  /** e.g. 25C */
  runway: string;
  /** the 5 digit GBAS channel */
  channel: number;
  /** the reference path identifier the receiver decodes, e.g. G25P */
  rpi: string;
  /** the multiple indicator of the chart (Y, Z), empty with one procedure on the runway end */
  suffix: string;
  /** degrees, positive */
  gpa: number;
  /** threshold crossing height, in feet */
  tch: number;
  /** the charted magnetic final approach course, in degrees */
  course: number;
  /** false while a value waits for a check against the current chart */
  verified: boolean;
  source: string;
}

export const GBAS_CHANNEL_MIN = 20001;
export const GBAS_CHANNEL_MAX = 39999;

export const GBAS_APPROACHES: readonly GbasApproach[] = gbasRunways.approaches;

export function isGbasChannel(channel: number): boolean {
  return Number.isInteger(channel) && channel >= GBAS_CHANNEL_MIN && channel <= GBAS_CHANNEL_MAX;
}

/** Grouped once so that an airport without GLS costs one lookup, not a pass over the table. */
const APPROACHES_BY_AIRPORT = new Map<string, GbasApproach[]>();
for (const approach of GBAS_APPROACHES) {
  const ofAirport = APPROACHES_BY_AIRPORT.get(approach.airport);
  if (ofAirport) {
    ofAirport.push(approach);
  } else {
    APPROACHES_BY_AIRPORT.set(approach.airport, [approach]);
  }
}

export function hasGbasApproaches(airport: string): boolean {
  return APPROACHES_BY_AIRPORT.has(airport);
}

export function gbasAirports(): string[] {
  const airports: string[] = [];
  APPROACHES_BY_AIRPORT.forEach((_, airport) => airports.push(airport));
  return airports;
}

export function gbasApproachesOfAirport(airport: string): GbasApproach[] {
  return (APPROACHES_BY_AIRPORT.get(airport) ?? []).slice();
}

/**
 * The runway as the table writes it (25C) from a database ident, which is either ARINC (RW25C) or prefixed with the
 * airport (EDDF25C) depending on the navigation data source.
 */
export function gbasRunwayDesignation(runwayIdent: string): string {
  return runwayIdent.replace(/^(RW|[A-Z]{4})(?=\d{2})/, '');
}

/** The sim runway a table row is flown to, undefined when the runway is not in the list */
export function findRunwayOfGbasApproach<R extends { ident: string }>(
  runways: readonly R[],
  approach: Pick<GbasApproach, 'runway'>,
): R | undefined {
  return runways.find((runway) => gbasRunwayDesignation(runway.ident) === approach.runway);
}

export function gbasApproachesOfRunway(airport: string, runway: string): GbasApproach[] {
  const designation = gbasRunwayDesignation(runway);
  return gbasApproachesOfAirport(airport).filter((approach) => approach.runway === designation);
}

/** Channels are unique per airport only, so a channel needs its airport. */
export function findGbasApproachByChannel(airport: string, channel: number): GbasApproach | undefined {
  return gbasApproachesOfAirport(airport).find((approach) => approach.channel === channel);
}

/** RPIs repeat between airports (G25A), so an RPI needs its airport. */
export function findGbasApproachByRpi(airport: string, rpi: string): GbasApproach | undefined {
  return gbasApproachesOfAirport(airport).find((approach) => approach.rpi === rpi);
}
