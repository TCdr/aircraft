// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils } from '../../../../../shared/src/MathUtils';
import { parseMetarWind } from '../../Dashboard/logic/metarTokens';
import { runwayWindComponents } from './landingWind';

/**
 * The wind of the landing page as the flight crew enters it ("ddd/ss" or "ddd/ssGgg") and as a METAR gives it,
 * so that the gust and a variable direction reach the wind limits.
 */

const WIND_DIRECTION_SPEED_GUST_REGEX = /^(\d{1,3})\/(\d{1,2}(?:\.\d)?)(?:G(\d{1,2}))?$/;

export interface LandingWindFields {
  windDirection?: number;
  windMagnitude?: number;
  /** Only when above the steady speed */
  windGust?: number;
  /** The direction is variable: the entry holds the worst case (a tailwind) and the direction stays empty */
  windVariable: boolean;
  windEntry: string;
}

/**
 * A "ddd/ss" or "ddd/ssGgg" entry; a page that has no use for a gust (the takeoff) takes the steady wind from it.
 * A gust that is not above the speed is no gust.
 */
export function parseLandingWindEntry(
  input: string,
): { windDirection: number; windMagnitude: number; windGust: number | undefined } | undefined {
  const match = input.match(WIND_DIRECTION_SPEED_GUST_REGEX);
  if (match === null) {
    return undefined;
  }
  const windMagnitude = parseFloat(match[2]);
  const gust = match[3] !== undefined ? parseInt(match[3]) : undefined;
  return {
    windDirection: parseInt(match[1]),
    windMagnitude,
    windGust: gust !== undefined && gust > windMagnitude ? gust : undefined,
  };
}

export function formatLandingWindEntry(direction: number, speed: number, gust: number | undefined): string {
  const steady = `${Math.round(direction).toFixed(0).padStart(3, '0')}/${speed.toFixed(0).padStart(2, '0')}`;
  return gust !== undefined && gust > speed ? `${steady}G${gust.toFixed(0).padStart(2, '0')}` : steady;
}

/**
 * The landing wind of a parsed METAR. The parser gives a variable wind a fictitious direction of 180 degrees, so a
 * variable wind is read from the raw report: it becomes the worst case for the landing, a tailwind of the full speed
 * (gust included), because no runway direction is safe from it.
 *
 * Design choice: the calculator takes one wind, so a variable wind is entered as a full tailwind of the gust speed;
 * the result is then conservative whichever way the wind turns.
 */
export function metarLandingWind(
  metar: { raw_text: string; wind: { degrees: number; speed_kts: number; gust_kts: number } },
  magvar: number | null,
): LandingWindFields {
  const speed = metar.wind.speed_kts;
  const gust = metar.wind.gust_kts > speed ? metar.wind.gust_kts : undefined;
  // parseMetarWind reads the observed wind only, not the group of a trend such as BECMG or TEMPO
  if (parseMetarWind(metar.raw_text)?.dirDeg === null) {
    const worst = gust ?? speed;
    return {
      windDirection: undefined,
      windMagnitude: -worst,
      windGust: undefined,
      windVariable: true,
      windEntry: `TL${worst.toFixed(0)}`,
    };
  }
  const direction = Math.round(MathUtils.normalise360(metar.wind.degrees - (magvar ?? 0)));
  return {
    windDirection: direction,
    windMagnitude: speed,
    windGust: gust,
    windVariable: false,
    windEntry: formatLandingWindEntry(direction, speed, gust),
  };
}

/** The wind the wind check ranks the runways with; undefined when there is no direction to rank with */
export function landingWindForCheck(
  direction: number | undefined,
  magnitude: number | undefined,
  gust: number | undefined,
  variable: boolean,
): { direction: number | 'VRB'; speed: number; gust: number } | undefined {
  if (magnitude === undefined) {
    return undefined;
  }
  if (variable) {
    const speed = Math.abs(magnitude);
    return { direction: 'VRB', speed, gust: speed };
  }
  if (direction === undefined) {
    return undefined;
  }
  return { direction, speed: magnitude, gust: Math.max(magnitude, gust ?? magnitude) };
}

/**
 * The wind components the limits are checked with: those of the gust when the wind gusts (the limits include gusts),
 * otherwise the steady ones given.
 */
export function windAgainstLimits<W extends { headwind: number; crosswind: number }>(
  steady: W,
  runwayHeading: number | undefined,
  direction: number | undefined,
  speed: number | undefined,
  gust: number | undefined,
  variable = false,
): W | { headwind: number; crosswind: number } {
  if (variable && speed !== undefined) {
    // the same case as the wind check ranks with: all of it across and all of it behind
    const worst = Math.max(Math.abs(speed), gust ?? 0);
    return { headwind: -worst, crosswind: worst };
  }
  if (
    gust === undefined ||
    direction === undefined ||
    runwayHeading === undefined ||
    speed === undefined ||
    gust <= speed
  ) {
    return steady;
  }
  const components = runwayWindComponents(runwayHeading, direction, gust);
  return { headwind: components.headwind, crosswind: components.crosswind };
}
