// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common, FlapConf } from '../common';
import { EconAircraftParameters, EconFlightConditions, EconSpeeds } from '../EconSpeeds';
import { EngineModel } from '../EngineModel';
import { FlightModel } from '../FlightModel';

/** The highest altitude the ceiling search looks at, in feet */
const HIGHEST_CEILING_ALTITUDE = 45_000;

/** Altitude step of the ceiling search, in feet */
const CEILING_SCAN_STEP = 250;

/** Altitude resolution of the ceiling search, in feet */
const CEILING_RESOLUTION = 10;

/** Mach step when a cruise Mach is lowered until the remaining engines can hold it */
const MACH_STEP = 0.005;

/** The EO-LRC strategy of the A380 FMS flies the ECON Mach of this cost index (kg/min) */
export const A380_ENGINE_OUT_LRC_COST_INDEX = 65;

/** What the vertical profile needs while engines are failed */
export interface EngineOutProfileParameters {
  performance: EngineOutPerformance;
  /** The green dot drift down altitude */
  driftDownAltitude: Feet;
  /** EO MAX */
  maximumAltitude: Feet;
  isaDeviation: number;
}

export type EngineOutCruiseStrategy = 'lrc' | 'econ';

export interface EngineOutAircraft {
  config: AircraftConfig;
  econ: EconAircraftParameters;
  /** Green dot speed for the present gross weight, knots CAS */
  greenDotSpeedAt(altitude: Feet): Knots;
  /**
   * The cost index of the EO-LRC strategy. Without it, the long range cruise is the Mach with 99 % of the maximum
   * specific range.
   */
  lrcCostIndex: number | null;
  /**
   * Design choice: Airbus publishes no windmilling drag of the failed engines, nor the margins of the maximum
   * continuous thrust. The drag of the failed engines is modelled as this fraction of their maximum thrust at the
   * dynamic pressure of the flight (a drag coefficient on the wing, so it follows density and Mach like the dynamic
   * pressure does), fitted per aircraft to the published engine-out ceilings; it also absorbs the rudder trim drag
   * and the optimism of the engine model.
   */
  windmillingDragFraction: number;
}

/** The weight and atmosphere of an engine-out computation; the altitude of the conditions is ignored */
export type EngineOutConditions = EconFlightConditions;

/**
 * The performance of the aircraft with engines failed: the maximum level flight altitudes (EO MAX at the long range
 * cruise speed, the drift down altitude at the green dot speed) and the engine-out cruise speeds. The remaining
 * engines are at maximum continuous thrust.
 * Design choice: maximum continuous thrust is the climb thrust limit of the engine model, the FMS has no separate
 * maximum continuous rating.
 */
export class EngineOutPerformance {
  /** The aircraft with the failed engines removed and their windmilling drag added */
  readonly config: AircraftConfig;

  private readonly econ: EconAircraftParameters;

  private readonly windmillingDragCoefficient: number;

  constructor(
    private readonly aircraft: EngineOutAircraft,
    readonly failedEngines = 1,
  ) {
    this.windmillingDragCoefficient = EngineOutPerformance.windmillingDragCoefficient(
      aircraft.config,
      failedEngines,
      aircraft.windmillingDragFraction,
    );
    this.config = EngineOutPerformance.withFailedEngines(
      aircraft.config,
      failedEngines,
      this.windmillingDragCoefficient,
    );
    this.econ = {
      ...aircraft.econ,
      dragPolar: aircraft.econ.dragPolar
        ? [aircraft.econ.dragPolar[0] + this.windmillingDragCoefficient, ...aircraft.econ.dragPolar.slice(1)]
        : undefined,
    };
  }

  /** The drag coefficient of the windmilling engines, on the wing area */
  static windmillingDragCoefficient(config: AircraftConfig, failedEngines: number, dragFraction: number): number {
    return (
      (failedEngines * dragFraction * config.engineModelParameters.maxThrust) /
      (1481.4 * config.flightModelParameters.wingArea)
    );
  }

  /** The aircraft configuration with engines failed: fewer engines, and the drag of the windmilling ones in every polar */
  static withFailedEngines(config: AircraftConfig, failedEngines: number, dragCoefficient: number): AircraftConfig {
    const engine = config.engineModelParameters;
    const flightModel = config.flightModelParameters;
    const dragPolarCoefficients = {} as Record<FlapConf, number[]>;
    for (const flapConf in flightModel.dragPolarCoefficients) {
      const polar = flightModel.dragPolarCoefficients[flapConf as unknown as FlapConf];
      dragPolarCoefficients[flapConf as unknown as FlapConf] = [polar[0] + dragCoefficient, ...polar.slice(1)];
    }
    return {
      ...config,
      engineModelParameters: { ...engine, numberOfEngines: Math.max(1, engine.numberOfEngines - failedEngines) },
      flightModelParameters: { ...flightModel, dragPolarCoefficients },
    };
  }

  /** The number of failed engines from the number of running ones; at least one engine is failed */
  static failedEngineCount(config: AircraftConfig, runningEngines: number): number {
    const total = config.engineModelParameters.numberOfEngines;
    return Math.min(total - 1, Math.max(1, total - runningEngines));
  }

  /** The thrust of the remaining engines at maximum continuous thrust, in lbf */
  maximumContinuousThrust(altitude: Feet, mach: Mach, conditions: EngineOutConditions): number {
    const engine = this.config.engineModelParameters;
    const aboveTropopause = altitude > conditions.tropopause;
    const temperature = Common.getTemp(altitude, conditions.isaDeviation, aboveTropopause);
    const correctedN1 = EngineModel.getClimbThrustCorrectedN1(engine, altitude, temperature);
    const delta = Common.getDelta(altitude, aboveTropopause);
    const correctedThrust =
      EngineModel.tableInterpolation(engine.table1506, correctedN1, mach) * engine.numberOfEngines * engine.maxThrust;
    return EngineModel.getUncorrectedThrust(correctedThrust, Common.getDelta2(delta, mach));
  }

  /** The thrust the remaining engines have beyond the drag of level flight, in lbf */
  excessThrust(altitude: Feet, mach: Mach, conditions: EngineOutConditions): number {
    const aboveTropopause = altitude > conditions.tropopause;
    const delta = Common.getDelta(altitude, aboveTropopause);
    const drag = FlightModel.getDrag(
      this.config.flightModelParameters,
      conditions.weight,
      mach,
      delta,
      false,
      false,
      FlapConf.CLEAN,
    );
    return this.maximumContinuousThrust(altitude, mach, conditions) - drag;
  }

  /**
   * What the vertical profile needs: EO MAX (the model value, or the given one, limited by the ceiling) and a drift down
   * altitude that is never below it.
   * @param maximumAltitude EO MAX when the aircraft has its own value
   * @param ceiling the highest altitude of the aircraft (REC MAX), feet
   */
  profileParameters(
    conditions: EngineOutConditions,
    maximumAltitude: Feet | null = null,
    ceiling: Feet = Infinity,
  ): EngineOutProfileParameters {
    const eoMax = Math.min(maximumAltitude ?? this.maximumAltitude(conditions), ceiling);
    return {
      performance: this,
      maximumAltitude: eoMax,
      driftDownAltitude: Math.max(this.driftDownAltitude(conditions), eoMax),
      isaDeviation: conditions.isaDeviation,
    };
  }

  /** The green dot speed at an altitude for the gross weight of the performance, knots CAS */
  greenDotSpeedAt(altitude: Feet): Knots {
    return this.aircraft.greenDotSpeedAt(altitude);
  }

  /** The Mach of the green dot speed at an altitude */
  greenDotMach(altitude: Feet, conditions: EngineOutConditions): Mach {
    const delta = Common.getDelta(altitude, altitude > conditions.tropopause);
    return Common.CAStoMach(this.aircraft.greenDotSpeedAt(altitude), delta);
  }

  /**
   * The green dot drift down altitude: the highest altitude where the remaining engines hold level flight at the
   * green dot speed.
   */
  driftDownAltitude(conditions: EngineOutConditions): Feet {
    return EngineOutPerformance.highestAltitudeWithThrust((altitude) =>
      this.excessThrust(altitude, this.greenDotMach(altitude, conditions), conditions),
    );
  }

  /** EO MAX: the highest altitude where the remaining engines hold level flight at the engine-out long range Mach */
  maximumAltitude(conditions: EngineOutConditions): Feet {
    return EngineOutPerformance.highestAltitudeWithThrust((altitude) =>
      this.excessThrust(altitude, this.longRangeMach(altitude, conditions, 'lrc'), conditions),
    );
  }

  /**
   * The Mach the engine-out strategy asks for at an altitude: the long range Mach for EO-LRC, the ECON Mach of the
   * cost index for EO-ECON. It does not look at the thrust.
   * @param costIndex kg/min, the cost index of the EO-ECON strategy
   */
  longRangeMach(
    altitude: Feet,
    conditions: EngineOutConditions,
    strategy: EngineOutCruiseStrategy,
    costIndex = 0,
  ): Mach {
    const greenDotSpeed = this.aircraft.greenDotSpeedAt(altitude);
    const atAltitude = { ...conditions, altitude };
    let mach: Mach | null;
    if (strategy === 'lrc' && this.aircraft.lrcCostIndex === null) {
      mach = EconSpeeds.longRangeCruiseMach(this.config, this.econ, atAltitude, greenDotSpeed);
    } else {
      const strategyCostIndex = strategy === 'lrc' ? (this.aircraft.lrcCostIndex as number) : costIndex;
      mach = EconSpeeds.econCruiseMach(this.config, this.econ, strategyCostIndex, atAltitude, greenDotSpeed);
    }
    return mach ?? this.greenDotMach(altitude, conditions);
  }

  /**
   * The managed engine-out cruise Mach in level flight at an altitude: the strategy Mach, lowered towards the green
   * dot Mach when the remaining engines cannot hold it.
   */
  cruiseMach(altitude: Feet, conditions: EngineOutConditions, strategy: EngineOutCruiseStrategy, costIndex = 0): Mach {
    const greenDotMach = this.greenDotMach(altitude, conditions);
    let mach = this.longRangeMach(altitude, conditions, strategy, costIndex);
    while (mach > greenDotMach && this.excessThrust(altitude, mach, conditions) < 0) {
      mach -= MACH_STEP;
    }
    return Math.max(mach, greenDotMach);
  }

  /**
   * The highest altitude up to which the excess thrust never falls below zero. The engine model is not smooth, so the
   * excess thrust is not monotonic in altitude: a bisection would end on any of its zero crossings. The search takes
   * the lowest one.
   */
  private static highestAltitudeWithThrust(excessThrustAt: (altitude: Feet) => number): Feet {
    if (excessThrustAt(0) < 0) {
      return 0;
    }
    let low = 0;
    for (let altitude = CEILING_SCAN_STEP; altitude <= HIGHEST_CEILING_ALTITUDE; altitude += CEILING_SCAN_STEP) {
      if (excessThrustAt(altitude) < 0) {
        let high = altitude;
        while (high - low > CEILING_RESOLUTION) {
          const middle = (low + high) / 2;
          if (excessThrustAt(middle) >= 0) {
            low = middle;
          } else {
            high = middle;
          }
        }
        return low;
      }
      low = altitude;
    }
    return HIGHEST_CEILING_ALTITUDE;
  }
}

/** The level the profile cruises at: the CRZ FL, or EO MAX with failed engines when that is lower */
export function limitCruiseAltitude(cruiseAltitude: Feet, engineOut: EngineOutProfileParameters | null): Feet {
  return engineOut !== null && Number.isFinite(cruiseAltitude)
    ? Math.min(cruiseAltitude, engineOut.maximumAltitude)
    : cruiseAltitude;
}
