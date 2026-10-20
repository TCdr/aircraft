// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { AccelFactorMode, Common, FlapConf } from './common';
import { EngineModel } from './EngineModel';
import { FlightModel } from './FlightModel';

export const KG_PER_LB = 0.45359237;

/** Cost index unit kg/min expressed as pounds of fuel per hour */
const COST_INDEX_TO_POUNDS_PER_HOUR = 60 / KG_PER_LB;

/** The ECON speed model takes its weights in pounds */
export const tonnesToPounds = (tonnes: number): number => (tonnes * 1000) / KG_PER_LB;

/** Tropopause altitude of the ISA, in feet */
export const ISA_TROPOPAUSE_ALTITUDE = 36_090;

const THETA_AT_TROPOPAUSE = 216.65 / 288.15;

/** Lowest altitude of the ECON climb and descent speed segments: below it the speed limit (250 kt) applies */
const SPEED_LIMIT_ALTITUDE = 10_000;

/** Lowest optimum flight level */
const LOWEST_OPTIMUM_ALTITUDE = 10_000;

/**
 * ISA deviation of a temperature at a pressure altitude
 * @param pressureAltitude in feet
 * @param temperature in °C
 * @param tropopause the tropopause altitude in feet, null for the ISA tropopause
 */
export function isaDeviationAt(pressureAltitude: number, temperature: number, tropopause: number | null): number {
  return temperature - Common.getIsaTemp(pressureAltitude, pressureAltitude > (tropopause ?? ISA_TROPOPAUSE_ALTITUDE));
}

/**
 * Keeps the last result of a computation and runs it again only when one of its (rounded) inputs changes: the ECON
 * searches take milliseconds, too long to run on every FMS cycle.
 */
export class ComputationMemo<T> {
  private key: string | null = null;

  private value: T | undefined = undefined;

  get(inputs: readonly (number | string | boolean | null)[], compute: () => T): T {
    const key = inputs.join();
    if (key !== this.key) {
      this.key = key;
      this.value = compute();
    }
    return this.value as T;
  }
}

/** A value rounded to a step, for the inputs of a {@link ComputationMemo}; null stays null */
export const roundToStep = (value: number | null, step: number): number | null =>
  value === null ? null : Math.round(value / step) * step;

export interface EconAircraftParameters {
  /** thrust specific fuel consumption at M.80 at the tropopause, in lb/h per lbf of thrust */
  cruiseTsfc: number;
  /** clean drag polar (drag coefficient = sum of c[i] x Cl^i), when the one of the FMS flight model does not fit */
  dragPolar?: readonly number[];
  /** highest ECON speed (VMO minus a margin), in knots CAS */
  maxSpeed: number;
  /** highest ECON Mach (MMO minus a margin) */
  maxMach: number;
}

export interface EconFlightConditions {
  /** pressure altitude, in feet */
  altitude: number;
  /** gross weight, in pounds */
  weight: number;
  /** ISA deviation, in °C */
  isaDeviation: number;
  /** headwind component, in knots (negative for a tailwind) */
  headwind: number;
  /** tropopause altitude, in feet */
  tropopause: number;
}

export interface EconSpeedInputs {
  /** in kg/min */
  costIndex: number;
  /** cruise flight level altitude, in feet */
  cruiseAltitude: number;
  /** gross weight at the start of the climb, in pounds */
  climbWeight: number;
  /** gross weight in cruise, in pounds */
  cruiseWeight: number;
  /** gross weight at the top of descent, in pounds */
  descentWeight: number;
  /** ISA deviation, in °C */
  isaDeviation: number;
  /** headwind components, in knots (negative for a tailwind) */
  climbHeadwind: number;
  cruiseHeadwind: number;
  descentHeadwind: number;
  /** in feet */
  tropopause: number;
  /** lowest ECON speed (green dot) in each phase, in knots CAS */
  climbMinSpeed: number;
  cruiseMinSpeed: number;
  descentMinSpeed: number;
}

export interface EconSpeedSet {
  /** in knots CAS */
  climbSpeed: number;
  climbMach: number;
  cruiseSpeed: number;
  cruiseMach: number;
  descentSpeed: number;
  descentMach: number;
}

/** What a level must leave for the cruise: the climb and descent distances and a minimum cruise time */
export interface OptimumLevelTrip {
  /** ground distance to the destination, in NM */
  remainingDistance: number;
  /** in feet */
  currentAltitude: number;
  /** in feet */
  destinationElevation: number;
  minCruiseMinutes: number;
  /** climb and descent ground distances, in NM per 1000 ft */
  climbDistancePerThousandFeet: number;
  descentDistancePerThousandFeet: number;
}

interface Atmosphere {
  theta: number;
  delta: number;
  aboveTropo: boolean;
}

/**
 * ECON speeds from the cost index: the speeds of minimum trip cost, where the cost index is the ratio of the time cost
 * to the fuel cost (CI = 0: minimum fuel, CI = 999: minimum time).
 * - Cruise: the Mach of minimum cost per ground mile at the cruise level, weight, temperature and wind.
 * - Climb and descent: the speed of minimum cost of the climb (descent) and of the cruise distance it replaces,
 *   for the gradient of the CLB thrust (idle thrust) at the mid altitude of the speed segment.
 * - The climb and descent Mach are the cruise ECON Mach.
 */
export class EconSpeeds {
  /** @returns the ECON speeds, or null without the cost index, cruise level, weights or temperature */
  static computeEconSpeeds(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    inputs: EconSpeedInputs,
  ): EconSpeedSet | null {
    if (
      [
        inputs.costIndex,
        inputs.cruiseAltitude,
        inputs.climbWeight,
        inputs.cruiseWeight,
        inputs.descentWeight,
        inputs.isaDeviation,
        inputs.climbHeadwind,
        inputs.cruiseHeadwind,
        inputs.descentHeadwind,
        inputs.tropopause,
        inputs.climbMinSpeed,
        inputs.cruiseMinSpeed,
        inputs.descentMinSpeed,
      ].some((value) => !Number.isFinite(value)) ||
      inputs.cruiseWeight <= 0 ||
      inputs.cruiseAltitude <= 0
    ) {
      return null;
    }
    const costIndex = Math.max(0, inputs.costIndex);

    const cruise: EconFlightConditions = {
      altitude: inputs.cruiseAltitude,
      weight: inputs.cruiseWeight,
      isaDeviation: inputs.isaDeviation,
      headwind: inputs.cruiseHeadwind,
      tropopause: inputs.tropopause,
    };
    const exactCruiseMach = EconSpeeds.econCruiseMach(config, aircraft, costIndex, cruise, inputs.cruiseMinSpeed);
    if (exactCruiseMach === null) {
      return null;
    }
    // The FMS displays and targets the Mach to two decimals
    const cruiseMach = Math.round(exactCruiseMach * 100) / 100;
    const cruiseSpeed = Math.round(
      Math.min(aircraft.maxSpeed, Common.machToCas(cruiseMach, EconSpeeds.atmosphere(cruise).delta)),
    );
    const cruiseCostPerMile = EconSpeeds.costPerGroundMile(config, aircraft, costIndex, exactCruiseMach, cruise);

    const segmentAltitude = EconSpeeds.speedSegmentAltitude(inputs.cruiseAltitude);
    const segment = (weight: number, headwind: number): EconFlightConditions => ({
      altitude: segmentAltitude,
      weight,
      isaDeviation: inputs.isaDeviation,
      headwind,
      tropopause: inputs.tropopause,
    });
    const climbSpeed = EconSpeeds.econTransitionSpeed(
      config,
      aircraft,
      costIndex,
      cruiseCostPerMile,
      true,
      segment(inputs.climbWeight, inputs.climbHeadwind),
      inputs.climbMinSpeed,
      cruiseMach,
    );
    const descentSpeed = EconSpeeds.econTransitionSpeed(
      config,
      aircraft,
      costIndex,
      cruiseCostPerMile,
      false,
      segment(inputs.descentWeight, inputs.descentHeadwind),
      inputs.descentMinSpeed,
      cruiseMach,
    );

    return {
      climbSpeed: climbSpeed ?? cruiseSpeed,
      climbMach: cruiseMach,
      cruiseSpeed,
      cruiseMach,
      descentSpeed: descentSpeed ?? cruiseSpeed,
      descentMach: cruiseMach,
    };
  }

  /**
   * The mid altitude of the ECON climb and descent speed segment, where their speeds are computed.
   * @param cruiseAltitude in feet
   */
  static speedSegmentAltitude(cruiseAltitude: number): number {
    return (Math.min(SPEED_LIMIT_ALTITUDE, cruiseAltitude) + cruiseAltitude) / 2;
  }

  /**
   * The Mach of minimum trip cost per ground mile in level flight.
   * @param costIndex in kg/min
   * @param minSpeed lowest speed, in knots CAS
   * @returns the ECON Mach, or null if no Mach is between the limits
   */
  static econCruiseMach(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    costIndex: number,
    conditions: EconFlightConditions,
    minSpeed: number,
  ): number | null {
    const { delta } = EconSpeeds.atmosphere(conditions);
    const minMach = Common.CAStoMach(minSpeed, delta);
    const maxMach = Math.min(aircraft.maxMach, Common.CAStoMach(aircraft.maxSpeed, delta));

    // The cost has a single minimum over Mach: a 0.01 search, then 0.001 around its best point
    const coarseMach = EconSpeeds.lowestCostMach(config, aircraft, costIndex, conditions, minMach, maxMach, 0.01);
    if (coarseMach === null) {
      return null;
    }
    return EconSpeeds.lowestCostMach(
      config,
      aircraft,
      costIndex,
      conditions,
      Math.max(minMach, coarseMach - 0.01),
      Math.min(maxMach, coarseMach + 0.01),
      0.001,
    );
  }

  private static lowestCostMach(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    costIndex: number,
    conditions: EconFlightConditions,
    minMach: number,
    maxMach: number,
    step: number,
  ): number | null {
    let bestMach: number | null = null;
    let bestCost = Infinity;
    for (let mach = minMach; mach <= maxMach + 1e-9; mach += step) {
      const cost = EconSpeeds.costPerGroundMile(config, aircraft, costIndex, mach, conditions);
      if (cost < bestCost) {
        bestCost = cost;
        bestMach = mach;
      }
    }
    return bestMach;
  }

  /**
   * Long range cruise Mach: the Mach above the maximum range Mach where the fuel per ground mile is 1 % above its
   * minimum.
   * @param minSpeed lowest speed, in knots CAS
   * @returns the LRC Mach to two decimals, or null if it cannot be computed
   */
  static longRangeCruiseMach(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    conditions: EconFlightConditions,
    minSpeed: number,
  ): number | null {
    if (!Number.isFinite(conditions.weight) || !Number.isFinite(conditions.altitude) || conditions.weight <= 0) {
      return null;
    }
    const maxRangeMach = EconSpeeds.econCruiseMach(config, aircraft, 0, conditions, minSpeed);
    if (maxRangeMach === null) {
      return null;
    }
    const maxRangeFuel = EconSpeeds.costPerGroundMile(config, aircraft, 0, maxRangeMach, conditions);
    const { delta } = EconSpeeds.atmosphere(conditions);
    const maxMach = Math.min(aircraft.maxMach, Common.CAStoMach(aircraft.maxSpeed, delta));

    let longRangeMach = maxRangeMach;
    for (let mach = maxRangeMach; mach <= maxMach + 1e-9; mach += 0.001) {
      if (EconSpeeds.costPerGroundMile(config, aircraft, 0, mach, conditions) > 1.01 * maxRangeFuel) {
        break;
      }
      longRangeMach = mach;
    }
    return Math.round(longRangeMach * 100) / 100;
  }

  /**
   * The optimum flight level: the level of minimum trip cost per ground mile, each level flown at its ECON Mach, not
   * above the REC MAX, and leaving the minimum cruise time between the climb and the descent when the trip is known.
   * @param costIndex in kg/min
   * @param conditions the flight conditions; their altitude is ignored
   * @param minSpeedAt lowest speed (green dot) at an altitude in feet, in knots CAS
   * @returns the flight level (a multiple of 10, or the REC MAX), or null if no level fits
   */
  static optimumFlightLevel(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    costIndex: number,
    conditions: EconFlightConditions,
    recMaxFlightLevel: number,
    minSpeedAt: (altitude: number) => number,
    trip: OptimumLevelTrip | null,
  ): number | null {
    if (
      !Number.isFinite(costIndex) ||
      !Number.isFinite(conditions.weight) ||
      conditions.weight <= 0 ||
      !Number.isFinite(recMaxFlightLevel)
    ) {
      return null;
    }
    const recMaxAltitude = recMaxFlightLevel * 100;
    const levels: number[] = [];
    for (let altitude = LOWEST_OPTIMUM_ALTITUDE; altitude <= recMaxAltitude; altitude += 1000) {
      levels.push(altitude);
    }
    if (recMaxAltitude >= LOWEST_OPTIMUM_ALTITUDE && recMaxAltitude % 1000 !== 0) {
      levels.push(recMaxAltitude);
    }

    let bestAltitude: number | null = null;
    let bestCost = Infinity;
    for (const altitude of levels) {
      const levelConditions = { ...conditions, altitude };
      const mach = EconSpeeds.econCruiseMach(config, aircraft, costIndex, levelConditions, minSpeedAt(altitude));
      if (mach === null) {
        continue;
      }
      const groundSpeed =
        Common.machToTAS(mach, EconSpeeds.atmosphere(levelConditions).theta) - levelConditions.headwind;
      if (trip !== null && !EconSpeeds.leavesMinimumCruise(altitude, groundSpeed, trip)) {
        continue;
      }
      const cost = EconSpeeds.costPerGroundMile(config, aircraft, costIndex, mach, levelConditions);
      if (cost < bestCost) {
        bestCost = cost;
        bestAltitude = altitude;
      }
    }
    return bestAltitude !== null ? bestAltitude / 100 : null;
  }

  private static leavesMinimumCruise(altitude: number, groundSpeed: number, trip: OptimumLevelTrip): boolean {
    const climbDistance = (Math.max(0, altitude - trip.currentAltitude) / 1000) * trip.climbDistancePerThousandFeet;
    const descentDistance =
      (Math.max(0, altitude - trip.destinationElevation) / 1000) * trip.descentDistancePerThousandFeet;
    const cruiseDistance = (groundSpeed * trip.minCruiseMinutes) / 60;
    return climbDistance + cruiseDistance + descentDistance <= trip.remainingDistance;
  }

  /**
   * Trip cost per ground nautical mile in level flight, in pounds of fuel.
   * @param costIndex in kg/min
   */
  static costPerGroundMile(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    costIndex: number,
    mach: number,
    conditions: EconFlightConditions,
  ): number {
    const atmosphere = EconSpeeds.atmosphere(conditions);
    const groundSpeed = Common.machToTAS(mach, atmosphere.theta) - conditions.headwind;
    if (groundSpeed <= 0) {
      return Infinity;
    }
    const drag = EconSpeeds.cleanDrag(config, aircraft, mach, conditions.weight, atmosphere.delta);
    const fuelFlow = drag * EconSpeeds.tsfc(aircraft, mach, atmosphere.theta);
    return (fuelFlow + costIndex * COST_INDEX_TO_POUNDS_PER_HOUR) / groundSpeed;
  }

  /**
   * Fuel of a cruise climb on top of the level flight fuel, in pounds: the engines give the work of the weight over the
   * height at the cruise TSFC (excess thrust x TAS = weight x vertical speed).
   * @param altitudeGain in feet
   */
  static climbFuel(
    aircraft: EconAircraftParameters,
    mach: number,
    conditions: EconFlightConditions,
    altitudeGain: number,
  ): number {
    const { theta } = EconSpeeds.atmosphere(conditions);
    const feetPerHour = Common.machToTAS(mach, theta) * 6076.12;
    return (EconSpeeds.tsfc(aircraft, mach, theta) * conditions.weight * Math.max(0, altitudeGain)) / feetPerHour;
  }

  /**
   * The climb (descent) speed of minimum cost for the altitude change. Climbing (descending) over a ground distance
   * replaces the same distance of cruise, so the cost per foot of altitude is
   * (cost per ground mile in climb - cost per ground mile in cruise) x ground distance per foot.
   * @returns the speed in knots CAS, or null if no speed between the limits can fly the segment
   */
  private static econTransitionSpeed(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    costIndex: number,
    cruiseCostPerMile: number,
    isClimb: boolean,
    conditions: EconFlightConditions,
    minSpeed: number,
    maxMach: number,
  ): number | null {
    const atmosphere = EconSpeeds.atmosphere(conditions);
    const temperature = Common.getTemp(conditions.altitude, conditions.isaDeviation, atmosphere.aboveTropo);
    const climbN1 = EngineModel.getClimbThrustCorrectedN1(
      config.engineModelParameters,
      conditions.altitude,
      temperature,
    );

    let bestSpeed: number | null = null;
    let bestCost = Infinity;
    for (let speed = Math.ceil(minSpeed); speed <= aircraft.maxSpeed; speed++) {
      const mach = Common.CAStoMach(speed, atmosphere.delta);
      if (mach > maxMach) {
        break;
      }
      const groundSpeed = Common.CAStoTAS(speed, atmosphere.theta, atmosphere.delta) - conditions.headwind;
      if (groundSpeed <= 0) {
        continue;
      }

      const correctedN1 = isClimb
        ? climbN1
        : EngineModel.getIdleCorrectedN1(
            config.engineModelParameters,
            conditions.altitude,
            mach,
            conditions.tropopause,
          );
      const thrust = EconSpeeds.thrust(config, correctedN1, mach, atmosphere);
      const fuelFlow = isClimb
        ? thrust * EconSpeeds.tsfc(aircraft, mach, atmosphere.theta)
        : EconSpeeds.idleFuelFlow(config, correctedN1, mach, conditions.altitude, atmosphere);
      const drag = EconSpeeds.cleanDrag(config, aircraft, mach, conditions.weight, atmosphere.delta);
      const accelerationFactor = Common.getAccelerationFactor(
        mach,
        conditions.altitude,
        conditions.isaDeviation,
        atmosphere.aboveTropo,
        AccelFactorMode.CONSTANT_CAS,
      );
      const pathAngle = FlightModel.getConstantThrustPathAngle(thrust, conditions.weight, drag, accelerationFactor);
      if (!Number.isFinite(pathAngle) || (isClimb ? pathAngle <= 0 : pathAngle >= 0)) {
        continue;
      }

      const groundMilesPerFoot = 1 / Math.abs(Math.tan(pathAngle));
      const cost =
        groundMilesPerFoot * ((fuelFlow + costIndex * COST_INDEX_TO_POUNDS_PER_HOUR) / groundSpeed - cruiseCostPerMile);
      if (cost < bestCost) {
        bestCost = cost;
        bestSpeed = speed;
      }
    }
    return bestSpeed;
  }

  private static atmosphere(conditions: EconFlightConditions): Atmosphere {
    const aboveTropo = conditions.altitude > conditions.tropopause;
    return {
      theta: Common.getTheta(conditions.altitude, conditions.isaDeviation, aboveTropo),
      delta: Common.getDelta(conditions.altitude, aboveTropo),
      aboveTropo,
    };
  }

  /** in lbf */
  private static cleanDrag(
    config: AircraftConfig,
    aircraft: EconAircraftParameters,
    mach: number,
    weight: number,
    delta: number,
  ): number {
    const parameters = config.flightModelParameters;
    const liftCoefficient = FlightModel.getLiftCoefficient(parameters, weight, mach, delta);
    const polarDrag = aircraft.dragPolar
      ? aircraft.dragPolar.reduce((sum, coefficient, power) => sum + coefficient * liftCoefficient ** power, 0)
      : FlightModel.getDragCoefficient(parameters, liftCoefficient);
    const dragCoefficient = polarDrag + EconSpeeds.smoothedMachDragCorrection(config, mach);
    return 1481.4 * mach ** 2 * delta * parameters.wingArea * dragCoefficient;
  }

  /**
   * Compressibility drag increment, averaged over +-0.025 Mach: the FMS table is linear between its points, and its
   * slope steps would pull every cost minimum onto a table point.
   */
  private static smoothedMachDragCorrection(config: AircraftConfig, mach: number): number {
    const halfWidth = 0.025;
    const samples = 11;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const sampleMach = mach - halfWidth + (2 * halfWidth * i) / (samples - 1);
      sum += FlightModel.getMachCorrection(config.flightModelParameters, sampleMach, FlapConf.CLEAN);
    }
    return sum / samples;
  }

  /**
   * Thrust specific fuel consumption, in lb/h per lbf.
   * Design choice: proportional to the square root of the temperature ratio and to 0.4 + 0.45 x Mach (the usual
   * high-bypass turbofan law), instead of the FMS engine table: its N1 rows are not monotonic at high Mach, so the
   * fuel flow it gives jumps between its Mach columns and every cost minimum lands on a column.
   */
  private static tsfc(aircraft: EconAircraftParameters, mach: number, theta: number): number {
    return aircraft.cruiseTsfc * Math.sqrt(theta / THETA_AT_TROPOPAUSE) * ((0.4 + 0.45 * mach) / (0.4 + 0.45 * 0.8));
  }

  /** Thrust of all engines, in lbf */
  private static thrust(config: AircraftConfig, correctedN1: number, mach: number, atmosphere: Atmosphere): number {
    const engine = config.engineModelParameters;
    const correctedThrust =
      EngineModel.tableInterpolation(engine.table1506, correctedN1, mach) * engine.numberOfEngines * engine.maxThrust;
    return EngineModel.getUncorrectedThrust(correctedThrust, Common.getDelta2(atmosphere.delta, mach));
  }

  /** Fuel flow of all engines at idle, in lb/h */
  private static idleFuelFlow(
    config: AircraftConfig,
    correctedN1: number,
    mach: number,
    altitude: number,
    atmosphere: Atmosphere,
  ): number {
    const engine = config.engineModelParameters;
    const correctedFuelFlow =
      EngineModel.getCorrectedFuelFlow(engine, correctedN1, mach, altitude) * engine.numberOfEngines;
    return Math.max(
      0,
      EngineModel.getUncorrectedFuelFlow(
        correctedFuelFlow,
        Common.getDelta2(atmosphere.delta, mach),
        Common.getTheta2(atmosphere.theta, mach),
      ),
    );
  }
}
