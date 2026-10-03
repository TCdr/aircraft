// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The wind limits of the landing calculator: the wind components of a runway, whether they are above the aircraft's
 * crosswind maximum or tailwind limit (FCOM LIM, gusts included), and the runways of an airport ranked by wind, for
 * the "Wind check" of the landing page (another runway, or the alternate airport, when the wind is above the limits).
 * The flight crew decides: the flyPad only shows the figures.
 */

/** The wind along a runway (negative for a tailwind) and across it, in knots; side R = from the right */
export interface RunwayWind {
  headwind: number;
  crosswind: number;
  side: 'L' | 'R' | '';
}

/** The crosswind maximum and the tailwind limit, in knots */
export interface LandingWindLimits {
  crosswind: number;
  tailwind: number;
}

/** Which limits the wind is above, compared in whole knots as the limits are given */
export interface LandingWindAssessment {
  crosswindExceeded: boolean;
  tailwindExceeded: boolean;
}

/** A runway of the wind check: its wind components (steady and with the gusts) and the limits they are above */
export interface RankedRunway<R> extends LandingWindAssessment {
  runway: R;
  /** Its index in the list given to rankRunwaysByWind */
  index: number;
  wind: RunwayWind;
  /** The components of the gust speed; the limits are checked with them */
  gustWind: RunwayWind;
  within: boolean;
}

const DEG_TO_RAD = Math.PI / 180;

/** The signed difference from a to b in degrees, in (-180, 180] */
function angleDifference(a: number, b: number): number {
  const d = (((b - a) % 360) + 540) % 360;
  return d - 180 === -180 ? 180 : d - 180;
}

/**
 * The wind components of a runway: headwind = speed x cos(wind - runway), crosswind = |speed x sin(wind - runway)|. Both
 * directions in the same reference (the calculator uses magnetic ones).
 */
export function runwayWindComponents(runwayHeading: number, windDirection: number, windSpeed: number): RunwayWind {
  const angle = angleDifference(runwayHeading, windDirection);
  const crosswind = Math.abs(windSpeed * Math.sin(angle * DEG_TO_RAD));
  return {
    headwind: windSpeed * Math.cos(angle * DEG_TO_RAD),
    crosswind,
    side: crosswind < 1e-9 ? '' : angle > 0 ? 'R' : 'L',
  };
}

/** Whether the wind is above the crosswind maximum or the tailwind limit (whole knots, as on the banner) */
export function assessLandingWind(
  wind: Pick<RunwayWind, 'headwind' | 'crosswind'>,
  limits: LandingWindLimits,
): LandingWindAssessment {
  return {
    crosswindExceeded: Math.round(wind.crosswind) > limits.crosswind,
    tailwindExceeded: Math.round(-wind.headwind) > limits.tailwind,
  };
}

/** How far a runway's wind is above its limits, in knots (0 within the limits) */
function excess(r: RankedRunway<unknown>, limits: LandingWindLimits): number {
  return Math.max(0, r.gustWind.crosswind - limits.crosswind) + Math.max(0, -r.gustWind.headwind - limits.tailwind);
}

/**
 * The runways of an airport ranked by wind, best first: the runways within the limits first, the one with the most
 * headwind on top (the least crosswind on a tie), then the others, the least above the limits first. The limits are
 * checked with the gust speed (FCOM LIM: gust included); gustSpeed below windSpeed counts as no gust. A variable wind
 * ('VRB') counts as coming from the worst direction for both limits: all of it across and all of it behind.
 */
export function rankRunwaysByWind<R extends { magneticBearing: number }>(
  runways: readonly R[],
  windDirection: number | 'VRB',
  windSpeed: number,
  gustSpeed: number,
  limits: LandingWindLimits,
): RankedRunway<R>[] {
  const gust = Math.max(windSpeed, gustSpeed);
  const components = (heading: number, speed: number): RunwayWind =>
    windDirection === 'VRB'
      ? { headwind: -speed, crosswind: speed, side: '' }
      : runwayWindComponents(heading, windDirection, speed);
  const ranked = runways.map((runway, index): RankedRunway<R> => {
    const wind = components(runway.magneticBearing, windSpeed);
    const gustWind = components(runway.magneticBearing, gust);
    const assessment = assessLandingWind(gustWind, limits);
    return {
      runway,
      index,
      wind,
      gustWind,
      ...assessment,
      within: !assessment.crosswindExceeded && !assessment.tailwindExceeded,
    };
  });
  return ranked.sort((a, b) => {
    if (a.within !== b.within) {
      return a.within ? -1 : 1;
    }
    if (a.within) {
      return b.wind.headwind - a.wind.headwind || a.wind.crosswind - b.wind.crosswind;
    }
    return excess(a, limits) - excess(b, limits);
  });
}
