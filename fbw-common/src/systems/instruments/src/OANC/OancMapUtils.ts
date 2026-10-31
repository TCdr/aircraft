// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EfisNdMode, MathUtils, OansFmsDataStore } from '@flybywiresim/fbw-sdk';
import { MappedSubject, Subscribable } from '@microsoft/msfs-sdk';
import { Position } from 'geojson';
import { clampAngle } from 'msfs-geo';

export function fractionalPointAlongLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fraction: number,
): [number, number] {
  return [x1 + (x2 - x1) * fraction, y1 + (y2 - y1) * fraction];
}

export function midPoint(x1: number, y1: number, x2: number, y2: number): [number, number] {
  return fractionalPointAlongLine(x1, y1, x2, y2, 0.5);
}

export function pointAngle(x1: number, y1: number, x2: number, y2: number): number {
  return clampAngle(Math.atan2(y2 - y1, x2 - x1) * MathUtils.RADIANS_TO_DEGREES);
}

// Code adapted from https://www.jeffreythompson.org/collision-detection/line-rect.php

export function intersectLineWithRectangle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): [number, number][] {
  // check if the line has hit any of the rectangle's sides
  // uses the Line/Line function below
  const left = lineLine(x1, y1, x2, y2, rx, ry, rx, ry + rh);
  const right = lineLine(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh);
  const top = lineLine(x1, y1, x2, y2, rx, ry, rx + rw, ry);
  const bottom = lineLine(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh);

  const ret = [];

  if (left) {
    ret.push(left);
  }
  if (right) {
    ret.push(right);
  }
  if (top) {
    ret.push(top);
  }
  if (bottom) {
    ret.push(bottom);
  }

  return ret;
}

export function isPointInRectangle(px: number, py: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return px >= rx && px <= rx + rw && py >= ry && ry <= ry + rh;
}

function lineLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): [number, number] | undefined {
  // calculate the direction of the lines
  const uA = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
  const uB = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

  // if uA and uB are between 0-1, lines are colliding
  if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
    // optionally, draw a circle where the lines meet
    const intersectionX = x1 + uA * (x2 - x1);
    const intersectionY = y1 + uA * (y2 - y1);

    return [intersectionX, intersectionY];
  }

  return undefined;
}

export function pointToLineDistance(point: Position, lineStart: Position, lineEnd: Position) {
  return (
    Math.abs(
      (lineEnd[1] - lineStart[1]) * point[0] -
        (lineEnd[0] - lineStart[0]) * point[1] +
        lineEnd[0] * lineStart[1] -
        lineEnd[1] * lineStart[0],
    ) /
    ((lineEnd[1] - lineStart[1]) ** 2 + (lineEnd[0] - lineStart[0]) ** 2) ** 0.5
  );
}

/**
 * Whether a runway of the displayed airport is an FMS selected runway: the departure runway at the FMS origin, or the
 * landing runway at the FMS destination, whose QFU the OANS shows in green on the runway label.
 * @param airportIcao ICAO code of the airport shown on the OANS
 * @param origin FMS origin ICAO code
 * @param destination FMS destination ICAO code
 * @param departureRunway FMS departure runway designator (without the airport ICAO code)
 * @param landingRunway FMS landing runway designator (without the airport ICAO code)
 * @param designators the designators of the runway
 * @returns true if the runway is the FMS selected runway of that airport
 */
export function isFmsSelectedRunway(
  airportIcao: string | null,
  origin: string | null,
  destination: string | null,
  departureRunway: string | undefined,
  landingRunway: string | undefined,
  designators: readonly string[],
): boolean {
  const isFmsOrigin = airportIcao === origin;
  const isFmsDestination = airportIcao === destination;
  return (
    (isFmsOrigin && !!departureRunway && designators.includes(departureRunway)) ||
    (isFmsDestination && !!landingRunway && designators.includes(landingRunway))
  );
}

/**
 * {@link isFmsSelectedRunway} with the data of the FMS: the runway entries hold the airport ICAO code in front of the
 * designator (e.g. KBOS04R), and the departure runway belongs to the origin, the landing runway to the destination.
 * @param airportIcao ICAO code of the airport shown on the OANS
 * @param fmsData the origin, destination and runway entries of the FMS
 * @param designators the designators of the runway
 */
export function isFmsSelectedRunwayOfFms(
  airportIcao: string | null,
  fmsData: Pick<OansFmsDataStore, 'origin' | 'destination' | 'departureRunway' | 'landingRunway'>,
  designators: readonly string[],
): boolean {
  return isFmsSelectedRunway(
    airportIcao,
    fmsData.origin.get(),
    fmsData.destination.get(),
    fmsData.departureRunway.get()?.substring(4),
    fmsData.landingRunway.get()?.substring(4),
    designators,
  );
}

/**
 * Whether the OANS shows ARPT NOT IN ACTIVE F-PLN: in PLAN mode, the crew displays an airport that is not the
 * origin, destination or alternate airport.
 * @param ndMode the ND mode
 * @param airportIcao ICAO code of the airport shown on the OANS, null when none
 * @param origin FMS origin ICAO code
 * @param destination FMS destination ICAO code
 * @param alternate FMS alternate ICAO code
 * @returns true if the message is shown
 */
export function isAirportNotInActiveFpln(
  ndMode: EfisNdMode,
  airportIcao: string | null,
  origin: string | null,
  destination: string | null,
  alternate: string | null,
): boolean {
  return ndMode === EfisNdMode.PLAN && airportIcao !== null && ![origin, destination, alternate].includes(airportIcao);
}

/**
 * {@link isAirportNotInActiveFpln} followed over the ND mode, the displayed airport and the airports of the FMS flight
 * plan.
 * @param ndMode the ND mode
 * @param airportIcao ICAO code of the airport shown on the OANS, null when none
 * @param fmsData the FMS origin, destination and alternate
 */
export function createAirportNotInActiveFpln(
  ndMode: Subscribable<EfisNdMode>,
  airportIcao: Subscribable<string | null>,
  fmsData: Pick<OansFmsDataStore, 'origin' | 'destination' | 'alternate'>,
): Subscribable<boolean> {
  return MappedSubject.create(
    ([mode, arpt, origin, destination, alternate]) =>
      isAirportNotInActiveFpln(mode, arpt, origin, destination, alternate),
    ndMode,
    airportIcao,
    fmsData.origin,
    fmsData.destination,
    fmsData.alternate,
  );
}
