// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380AircraftConfig, A380EconParameters } from '@fmgc/flightplanning/A380AircraftConfig';
import { CostIndexMode } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { Common } from '@fmgc/guidance/vnav/common';
import {
  ComputationMemo,
  EconSpeeds,
  EconSpeedSet,
  ISA_TROPOPAUSE_ALTITUDE,
  roundToStep,
  tonnesToPounds,
} from '@fmgc/guidance/vnav/EconSpeeds';
import { a380GreenDotSpeed, longRangeCruiseMach } from './CruiseSpeeds';

/** The OPT FL needs at least 15 min of cruise at that level */
const MIN_CRUISE_MINUTES = 15;

/** The FMS stops computing the OPT FL 15 NM before the T/D */
const OPTIMUM_LEVEL_END_BEFORE_TOP_OF_DESCENT = 15;

/**
 * Design choice: the VNAV predicts the climb and the descent only for the CRZ FL, so the cruise time left at the other
 * levels uses average A380 ground distances (about 175 NM to climb to FL350, 3.3 NM per 1000 ft of descent)
 */
const CLIMB_DISTANCE_PER_THOUSAND_FEET = 5;
const DESCENT_DISTANCE_PER_THOUSAND_FEET = 3.3;

export interface A380EconSpeedData {
  costIndex: number | null;
  costIndexMode: CostIndexMode | null;
  cruiseFlightLevel: number | null;
  /** tonnes */
  grossWeight: number | null;
  /** at the top of descent, tonnes */
  descentWeight: number | null;
  /** °C */
  isaDeviation: number;
  /** knots, negative for a tailwind */
  cruiseHeadwind: number;
  /** feet */
  tropopause: number | null;
}

export interface A380OptimumLevelData {
  costIndex: number | null;
  /** tonnes */
  grossWeight: number | null;
  recMaxFlightLevel: number | null;
  engineOut: boolean;
  /** °C */
  isaDeviation: number;
  /** knots, negative for a tailwind */
  headwind: number;
  /** feet */
  tropopause: number | null;
  /** NM, null when unknown */
  distanceToDestination: number | null;
  /** NM (negative once past it), null without a T/D */
  distanceToTopOfDescent: number | null;
  /** feet */
  currentAltitude: number;
  /** feet */
  destinationElevation: number;
}

/**
 * The A380 ECON speeds: from the cost index, weights, cruise level, temperature and wind. In LRC mode the cruise Mach
 * is the LRC Mach.
 * @returns the speeds, or null without cost index, cruise level or gross weight
 */
export function a380EconSpeeds(data: A380EconSpeedData): EconSpeedSet | null {
  if (data.costIndex === null || data.cruiseFlightLevel === null || data.grossWeight === null) {
    return null;
  }
  const cruiseAltitude = data.cruiseFlightLevel * 100;
  const tropopause = data.tropopause ?? ISA_TROPOPAUSE_ALTITUDE;
  const descentWeight = data.descentWeight ?? data.grossWeight;
  const segmentAltitude = EconSpeeds.speedSegmentAltitude(cruiseAltitude);

  const econ = EconSpeeds.computeEconSpeeds(A380AircraftConfig, A380EconParameters, {
    costIndex: data.costIndex,
    cruiseAltitude,
    climbWeight: tonnesToPounds(data.grossWeight),
    cruiseWeight: tonnesToPounds(data.grossWeight),
    descentWeight: tonnesToPounds(descentWeight),
    isaDeviation: data.isaDeviation,
    climbHeadwind: 0,
    cruiseHeadwind: data.cruiseHeadwind,
    descentHeadwind: 0,
    tropopause,
    climbMinSpeed: a380GreenDotSpeed(segmentAltitude, data.grossWeight),
    cruiseMinSpeed: a380GreenDotSpeed(cruiseAltitude, data.grossWeight),
    descentMinSpeed: a380GreenDotSpeed(segmentAltitude, descentWeight),
  });
  if (econ === null || data.costIndexMode !== CostIndexMode.LRC) {
    return econ;
  }

  const lrcMach = longRangeCruiseMach(data.grossWeight * 1000, cruiseAltitude, data.isaDeviation, tropopause);
  if (lrcMach === null) {
    return econ;
  }
  const delta = Common.getDelta(cruiseAltitude, cruiseAltitude > tropopause);
  return {
    ...econ,
    cruiseMach: lrcMach,
    cruiseSpeed: Math.round(Math.min(A380EconParameters.maxSpeed, Common.machToCas(lrcMach, delta))),
  };
}

/**
 * The OPT FL of the PERF page: the most economic level for the cost index, weight, temperature and wind, not above
 * the REC MAX, with at least 15 min of cruise at that level, computed until 15 NM before the T/D. Rounded down to a
 * multiple of 5. Null (dashes) without cost index, gross weight or REC MAX, with an engine out, from 15 NM before the
 * T/D, or when no level fits.
 */
export function a380OptimumFlightLevel(data: A380OptimumLevelData): number | null {
  if (
    data.costIndex === null ||
    data.grossWeight === null ||
    data.recMaxFlightLevel === null ||
    data.engineOut ||
    (data.distanceToTopOfDescent !== null && data.distanceToTopOfDescent < OPTIMUM_LEVEL_END_BEFORE_TOP_OF_DESCENT)
  ) {
    return null;
  }
  const grossWeight = data.grossWeight;
  const optimum = EconSpeeds.optimumFlightLevel(
    A380AircraftConfig,
    A380EconParameters,
    data.costIndex,
    {
      altitude: 0,
      weight: tonnesToPounds(grossWeight),
      isaDeviation: data.isaDeviation,
      headwind: data.headwind,
      tropopause: data.tropopause ?? ISA_TROPOPAUSE_ALTITUDE,
    },
    data.recMaxFlightLevel,
    (altitude) => a380GreenDotSpeed(altitude, grossWeight),
    data.distanceToDestination !== null && Number.isFinite(data.distanceToDestination)
      ? {
          remainingDistance: data.distanceToDestination,
          currentAltitude: data.currentAltitude,
          destinationElevation: data.destinationElevation,
          minCruiseMinutes: MIN_CRUISE_MINUTES,
          climbDistancePerThousandFeet: CLIMB_DISTANCE_PER_THOUSAND_FEET,
          descentDistancePerThousandFeet: DESCENT_DISTANCE_PER_THOUSAND_FEET,
        }
      : null,
  );
  return optimum !== null ? Math.floor(optimum / 5) * 5 : null;
}

/** The managed speed getters run every FMS cycle: the ECON speeds are recomputed only when a rounded input changes */
export class A380EconSpeedCache {
  private readonly memo = new ComputationMemo<EconSpeedSet | null>();

  get(data: A380EconSpeedData): EconSpeedSet | null {
    return this.memo.get(
      [
        data.costIndex,
        data.costIndexMode,
        data.cruiseFlightLevel,
        roundToStep(data.grossWeight, 1),
        roundToStep(data.descentWeight, 1),
        roundToStep(data.isaDeviation, 1),
        roundToStep(data.cruiseHeadwind, 5),
        data.tropopause,
      ],
      () => a380EconSpeeds(data),
    );
  }
}

/**
 * From the descent on, the ECON speeds stay the last ones computed before it: the descent profile is built on them,
 * and the cruise temperature and wind they used are no longer measured.
 */
export class DescentEconSpeedFreeze {
  private lastBeforeDescent: EconSpeedSet | null = null;

  private frozen: EconSpeedSet | null = null;

  get(descentStarted: boolean, compute: () => EconSpeedSet | null): EconSpeedSet | null {
    if (!descentStarted) {
      this.frozen = null;
      this.lastBeforeDescent = compute();
      return this.lastBeforeDescent;
    }
    if (this.frozen === null) {
      this.frozen = this.lastBeforeDescent ?? compute();
    }
    return this.frozen;
  }
}

/** The OPT FL search takes milliseconds: it is recomputed only when a rounded input changes */
export class A380OptimumLevelCache {
  private readonly memo = new ComputationMemo<number | null>();

  get(data: A380OptimumLevelData): number | null {
    const beforeEndOfComputation =
      data.distanceToTopOfDescent === null || data.distanceToTopOfDescent >= OPTIMUM_LEVEL_END_BEFORE_TOP_OF_DESCENT;
    return this.memo.get(
      [
        data.costIndex,
        roundToStep(data.grossWeight, 1),
        data.recMaxFlightLevel,
        data.engineOut,
        roundToStep(data.isaDeviation, 1),
        roundToStep(data.headwind, 5),
        data.tropopause,
        roundToStep(data.distanceToDestination, 10),
        beforeEndOfComputation,
        roundToStep(data.currentAltitude, 1000),
        roundToStep(data.destinationElevation, 100),
      ],
      () => a380OptimumFlightLevel(data),
    );
  }
}
