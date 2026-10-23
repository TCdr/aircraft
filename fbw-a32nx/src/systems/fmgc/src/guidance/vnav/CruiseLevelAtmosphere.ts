// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils } from '@flybywiresim/fbw-sdk';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { PropagatedWindEntry, WindVector, isWindVectorComplete } from '../../flightplanning/data/wind';
import { SegmentClass } from '../../flightplanning/segments/SegmentClass';
import { isLeg } from '../../flightplanning/legs/FlightPlanLeg';
import { isaDeviationAt, ISA_TROPOPAUSE_ALTITUDE } from './EconSpeeds';
import { WindUtils } from './wind/WindUtils';

/** The measured wind and temperature stop influencing the forecast this far above and below the aircraft */
const MEASUREMENT_BLEND_ALTITUDE = 10_000;

/** The wind and temperature the FMS expects on the route at a given flight level */
export interface LevelAtmosphere {
  /** Changes whenever {@link at} would give another answer, for memoising callers */
  key: string;
  at(altitude: number): { isaDeviation: number; headwind: number };
}

/** The part of the route flown in cruise, with the winds and the SAT that apply to it */
export interface CruiseLegAtmosphere {
  /** NM */
  distance: number;
  /** degrees, true */
  trueTrack: number;
  /** The entered and propagated winds of the waypoint, by altitude */
  winds: PropagatedWindEntry[];
  /** ISA deviation of the entered or propagated SAT of the waypoint, null if there is none */
  isaDeviation: number | null;
}

export interface CruiseLevelAtmosphereInputs {
  legs: CruiseLegAtmosphere[];
  /** The crew's TRIP WIND as a tailwind in knots, used when no cruise wind is entered */
  tripWind: number | null;
  /** ISA deviation of the CRZ TEMP at the CRZ FL, for the waypoints without a SAT entry */
  planIsaDeviation: number | null;
  /** The aircraft's own measurement, null on the ground */
  measured: { altitude: number; wind: WindVector; isaDeviation: number } | null;
}

/**
 * Tailwind of the entered winds, averaged over the cruise legs by distance. Without any cruise wind entry the TRIP
 * WIND counts, without that no wind.
 */
function forecastTailwind(inputs: CruiseLevelAtmosphereInputs, altitude: number): number {
  const hasCruiseWinds = inputs.legs.some((leg) => leg.winds.length > 0);
  if (!hasCruiseWinds) {
    return inputs.tripWind ?? 0;
  }
  const vector: WindVector = { direction: undefined, magnitude: undefined };
  let weighted = 0;
  let distance = 0;
  for (const leg of inputs.legs) {
    WindUtils.interpolateWindEntries(leg.winds, altitude, vector);
    weighted += leg.distance * WindUtils.computeTailwindComponent(vector, leg.trueTrack);
    distance += leg.distance;
  }
  return distance > 0 ? weighted / distance : 0;
}

function measuredTailwind(inputs: CruiseLevelAtmosphereInputs): number {
  if (inputs.measured === null || !isWindVectorComplete(inputs.measured.wind)) {
    return 0;
  }
  let weighted = 0;
  let distance = 0;
  for (const leg of inputs.legs) {
    weighted += leg.distance * WindUtils.computeTailwindComponent(inputs.measured.wind, leg.trueTrack);
    distance += leg.distance;
  }
  return distance > 0 ? weighted / distance : 0;
}

/** ISA deviation of the SAT entries averaged over the cruise legs by distance, null if the route has none */
function forecastIsaDeviation(inputs: CruiseLevelAtmosphereInputs): number | null {
  let weighted = 0;
  let distance = 0;
  for (const leg of inputs.legs) {
    const deviation = leg.isaDeviation ?? inputs.planIsaDeviation;
    if (deviation !== null) {
      weighted += leg.distance * deviation;
      distance += leg.distance;
    }
  }
  return distance > 0 ? weighted / distance : null;
}

/**
 * The wind and temperature of the route at each candidate level, from the crew's wind and SAT entries and the winds and
 * SATs the FMS propagates from them. In flight the measurement counts at the aircraft's level and fades into the
 * entries over 10 000 ft; without entries the measurement is used at every level.
 */
export function createLevelAtmosphere(inputs: CruiseLevelAtmosphereInputs): LevelAtmosphere {
  const forecastDeviation = forecastIsaDeviation(inputs);
  const measuredTail = measuredTailwind(inputs);

  return {
    key: levelAtmosphereKey(inputs),
    at(altitude: number) {
      let tailwind = forecastTailwind(inputs, altitude);
      let isaDeviation = forecastDeviation ?? 0;

      if (inputs.measured !== null) {
        const forecastWeight = MathUtils.clamp(
          Math.abs(altitude - inputs.measured.altitude) / MEASUREMENT_BLEND_ALTITUDE,
          0,
          1,
        );
        tailwind = measuredTail * (1 - forecastWeight) + tailwind * forecastWeight;
        isaDeviation =
          forecastDeviation === null
            ? inputs.measured.isaDeviation
            : inputs.measured.isaDeviation * (1 - forecastWeight) + forecastDeviation * forecastWeight;
      }

      return { isaDeviation, headwind: -tailwind };
    },
  };
}

function levelAtmosphereKey(inputs: CruiseLevelAtmosphereInputs): string {
  const rounded = (value: number | null, step: number) => (value === null ? '-' : Math.round(value / step) * step);
  const parts: (string | number)[] = [
    rounded(inputs.tripWind, 1),
    rounded(inputs.planIsaDeviation, 1),
    inputs.measured === null
      ? '-'
      : [
          rounded(inputs.measured.altitude, 500),
          rounded(inputs.measured.wind.magnitude ?? null, 5),
          rounded(inputs.measured.wind.direction ?? null, 0.1),
          rounded(inputs.measured.isaDeviation, 1),
        ].join(':'),
  ];
  for (const leg of inputs.legs) {
    parts.push(
      [
        rounded(leg.distance, 10),
        rounded(leg.trueTrack, 5),
        rounded(leg.isaDeviation, 1),
        leg.winds.map((wind) => `${wind.altitude}:${wind.vector.direction}:${wind.vector.magnitude}`).join(','),
      ].join('|'),
    );
  }
  return parts.join(';');
}

/**
 * The REC MAX at the temperature the route has at that level: the ceiling drops on a warm day, so the OPT FL search
 * must not go above the ceiling of the temperature the crew entered.
 * @param recMaxFlightLevel the REC MAX at the present temperature, null when unknown
 * @param recMaxAt the REC MAX flight level for an ISA deviation, null when unknown
 */
export function recMaxAtRouteTemperature(
  recMaxFlightLevel: number | null,
  atmosphere: LevelAtmosphere | undefined,
  recMaxAt: (isaDeviation: number) => number | null,
): number | null {
  if (recMaxFlightLevel === null || atmosphere === undefined) {
    return recMaxFlightLevel;
  }
  const atRoute = recMaxAt(atmosphere.at(recMaxFlightLevel * 100).isaDeviation);
  return atRoute === null ? recMaxFlightLevel : Math.min(recMaxFlightLevel, atRoute);
}

/**
 * Collects the cruise legs of a plan with their propagated winds and SATs.
 * @param plan the plan the OPT FL is computed for
 * @param fromLegIndex the first leg that is still to be flown (the active leg in flight)
 * @param tropopause feet, null for the ISA tropopause
 * @param planIsaDeviation ISA deviation of the plan's CRZ TEMP, null if there is none
 * @param measured the aircraft's measurement, null on the ground
 */
export function cruiseLevelAtmosphereInputsFromPlan(
  plan: ReadonlyFlightPlan,
  fromLegIndex: number,
  tropopause: number | null,
  planIsaDeviation: number | null,
  measured: CruiseLevelAtmosphereInputs['measured'],
): CruiseLevelAtmosphereInputs {
  const legs: CruiseLegAtmosphere[] = [];
  for (let i = Math.max(0, fromLegIndex); i < plan.firstMissedApproachLegIndex; i++) {
    const element = plan.maybeElementAt(i);
    if (!isLeg(element) || !element.isXF() || element.calculated?.trueTrack === undefined) {
      continue;
    }
    // The crew can put cruise data on a waypoint of a procedure when the route has no airway legs
    const holdsCruiseData = element.cruiseWindEntries.length > 0 || element.cruiseTemperatureEntry !== undefined;
    if (element.segment.class !== SegmentClass.Enroute && !holdsCruiseData) {
      continue;
    }

    const winds = plan
      .propagateWindsAt(i, [], 0)
      .filter((wind) => wind.altitude !== undefined && isWindVectorComplete(wind.vector));
    const temperature = plan.propagateTemperatureAt(i);
    legs.push({
      distance: element.calculated.distanceWithTransitions,
      trueTrack: element.calculated.trueTrack,
      winds,
      isaDeviation:
        temperature === null
          ? null
          : isaDeviationAt(temperature.altitude, temperature.temperature, tropopause ?? ISA_TROPOPAUSE_ALTITUDE),
    });
  }

  return {
    legs,
    tripWind: plan.performanceData.pilotTripWind.get(),
    planIsaDeviation,
    measured,
  };
}
