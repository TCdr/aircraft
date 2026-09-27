// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates, distanceTo } from 'msfs-geo';

/** An airport of the airport database, as the OANS knows it */
export interface OansAirport {
  /** ICAO code */
  idarpt: string;
  coordinates: { lat: number; lon: number };
  /** Elevation in metres */
  elev: number;
}

export interface OansDefaultAirportInputs {
  airports: readonly OansAirport[];
  position: Coordinates;
  /** Baro corrected altitude in feet, null when not valid */
  altitude: number | null;
  onGround: boolean;
  /** The ND shows the PLAN mode (else ARC or ROSE-NAV) */
  planMode: boolean;
  origin: string | null;
  destination: string | null;
  alternate: string | null;
  /** The airport the OANS displays now */
  displayed: string | null;
}

/** The current airport on ground: the nearest one within this distance, in NM */
export const OANS_CURRENT_AIRPORT_RADIUS = 20;
/** In flight, ARC or ROSE-NAV: the virtual cylinder over the origin, destination and alternate airports */
export const OANS_CYLINDER_RADIUS = 20;
export const OANS_CYLINDER_HEIGHT = 5000;
/** In flight, PLAN: the origin airport within this distance of the aircraft, in NM... */
export const OANS_PLAN_ORIGIN_RADIUS = 50;
/** ...unless the flight is shorter than this distance, in NM */
export const OANS_PLAN_SHORT_FLIGHT = 300;

const METRES_TO_FEET = 1 / 0.3048;

function distance(from: Coordinates, airport: OansAirport): number {
  return distanceTo(from, { lat: airport.coordinates.lat, long: airport.coordinates.lon });
}

/**
 * The default airport of the OANS moving airport map (A380 FCOM DSC-34-10-70-20, MOVING AIRPORT MAP):
 * - ARC or ROSE-NAV mode: the current airport on ground; in flight the origin, destination or alternate airport, while
 *   the aircraft is within a virtual cylinder of 20 NM radius and 5000 ft height centred over it.
 * - PLAN mode: in flight, the origin airport if it is closer than 50 NM to the aircraft, else the destination airport; the
 *   destination airport when the origin to destination distance is shorter than 300 NM. On ground, the current airport
 *   (the map is centred on the aircraft).
 * @returns the ICAO code of the default airport, or null when there is none (the OANS keeps the airport it displays)
 */
export function oansDefaultAirport(inputs: OansDefaultAirportInputs): string | null {
  const { airports, position } = inputs;
  const find = (icao: string | null) => (icao ? airports.find((it) => it.idarpt === icao) : undefined);

  if (inputs.onGround) {
    let nearest: OansAirport | undefined;
    let nearestDistance = OANS_CURRENT_AIRPORT_RADIUS;
    for (const airport of airports) {
      const d = distance(position, airport);
      if (d < nearestDistance) {
        nearest = airport;
        nearestDistance = d;
      }
    }
    return nearest?.idarpt ?? null;
  }

  const origin = find(inputs.origin);
  const destination = find(inputs.destination);

  if (inputs.planMode) {
    const shortFlight =
      origin !== undefined &&
      destination !== undefined &&
      distanceTo(
        { lat: origin.coordinates.lat, long: origin.coordinates.lon },
        { lat: destination.coordinates.lat, long: destination.coordinates.lon },
      ) < OANS_PLAN_SHORT_FLIGHT;
    if (origin !== undefined && !shortFlight && distance(position, origin) < OANS_PLAN_ORIGIN_RADIUS) {
      return origin.idarpt;
    }
    return destination?.idarpt ?? null;
  }

  const inCylinder = [origin, destination, find(inputs.alternate)].filter(
    (it): it is OansAirport =>
      it !== undefined &&
      distance(position, it) < OANS_CYLINDER_RADIUS &&
      (inputs.altitude === null || inputs.altitude - it.elev * METRES_TO_FEET < OANS_CYLINDER_HEIGHT),
  );
  // The OANS keeps the displayed airport while the aircraft is in its cylinder
  if (inCylinder.some((it) => it.idarpt === inputs.displayed)) {
    return inputs.displayed;
  }
  inCylinder.sort((a, b) => distance(position, a) - distance(position, b));
  return inCylinder[0]?.idarpt ?? null;
}
