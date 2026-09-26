// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common } from '@fmgc/guidance/vnav/common';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';

export interface AlternateFuelInputs {
  /** The alternate flight plan distance, from the primary destination to the alternate, in NM */
  distance: number;
  /** Elevation of the primary destination, in feet */
  destinationElevation: number;
  /** Elevation of the alternate, in feet */
  alternateElevation: number;
  /** Zero fuel weight, in pounds */
  zeroFuelWeight: number;
  /** Fuel on board at the primary destination, in pounds */
  fuelOnBoard: number;
  /** Headwind component on the alternate route (tailwind negative), in knots */
  headwind?: number;
  /** ISA deviation, in °C */
  isaDeviation?: number;
  /** Tropopause altitude, in feet */
  tropopause?: number;
  /** Performance factor, in percent */
  perfFactor?: number;
}

export interface AlternateFuelPrediction {
  /** The fuel from the primary destination to the landing at the alternate, in pounds */
  fuel: number;
  /** The time from the primary destination to the landing at the alternate, in seconds */
  time: number;
  /** The cruise altitude of the computation, in feet */
  cruiseAltitude: number;
}

/**
 * The default ALTN fuel and time of the FUEL&LOAD page (A380 FCOM DSC-22-FMS-20-30): the fuel (time) necessary for the
 * trip between the primary destination and the landing at the alternate, computed with a cost index of 0, at FL220 when
 * the alternate flight plan distance is less than 200 NM, FL310 otherwise.
 *
 * The trip is computed with the VNAV prediction models of the aircraft: a climb at climb thrust, a cruise, and an idle
 * descent, at the CI 0 speeds of the FMS (290 kt climb and cruise, 288 kt descent, M0.84, 250 kt below FL100). When the
 * distance is too short for the climb and descent, the cruise altitude is lowered until they fit.
 */
export class AlternateFuelPredictor {
  /** FCOM: FL220 below 200 NM, FL310 from 200 NM */
  private static readonly SHORT_ALTERNATE_DISTANCE = 200;

  private static readonly SHORT_ALTERNATE_ALTITUDE = 22_000;

  private static readonly LONG_ALTERNATE_ALTITUDE = 31_000;

  /** CI 0 speeds of the A380 FMS formulas (managed climb and descent speeds at CI 0) */
  private static readonly CLIMB_CAS = 290;

  private static readonly DESCENT_CAS = 288;

  private static readonly MACH = 0.84;

  /** Standard speed limit */
  private static readonly SPEED_LIMIT_CAS = 250;

  private static readonly SPEED_LIMIT_ALTITUDE = 10_000;

  private static readonly ALTITUDE_STEP = 2_000;

  private static readonly CRUISE_STEP = 50;

  public static predict(config: AircraftConfig, inputs: AlternateFuelInputs): AlternateFuelPrediction | null {
    const { distance, destinationElevation, alternateElevation } = inputs;
    if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(inputs.zeroFuelWeight)) {
      return null;
    }

    let cruiseAltitude =
      distance < AlternateFuelPredictor.SHORT_ALTERNATE_DISTANCE
        ? AlternateFuelPredictor.SHORT_ALTERNATE_ALTITUDE
        : AlternateFuelPredictor.LONG_ALTERNATE_ALTITUDE;
    const lowest = Math.max(destinationElevation, alternateElevation) + AlternateFuelPredictor.ALTITUDE_STEP;

    // Lower the cruise altitude until the climb and the descent fit in the distance
    for (;;) {
      const climb = AlternateFuelPredictor.climb(config, inputs, cruiseAltitude, inputs.fuelOnBoard);
      const descent = AlternateFuelPredictor.descent(config, inputs, cruiseAltitude, inputs.fuelOnBoard - climb.fuel);
      const cruiseDistance = distance - climb.distance - descent.distance;
      if (cruiseDistance >= 0 || cruiseAltitude <= lowest) {
        const cruise = AlternateFuelPredictor.cruise(
          config,
          inputs,
          cruiseAltitude,
          Math.max(cruiseDistance, 0),
          inputs.fuelOnBoard - climb.fuel,
        );
        // Shorter than the climb and descent at the lowest altitude: scaled to the distance
        const scale = cruiseDistance >= 0 ? 1 : distance / (climb.distance + descent.distance);
        return {
          fuel: (climb.fuel + descent.fuel) * scale + cruise.fuel,
          time: (climb.time + descent.time) * scale + cruise.time,
          cruiseAltitude,
        };
      }
      cruiseAltitude = Math.max(cruiseAltitude - AlternateFuelPredictor.ALTITUDE_STEP, lowest);
    }
  }

  private static speedAt(altitude: number, cas: number): number {
    return altitude < AlternateFuelPredictor.SPEED_LIMIT_ALTITUDE ? AlternateFuelPredictor.SPEED_LIMIT_CAS : cas;
  }

  /** Static air temperature at an altitude, in °C */
  private static staticAirTemperature(altitude: number, inputs: AlternateFuelInputs): number {
    const tropopause = inputs.tropopause ?? 36_090;
    return 15 - 0.0019812 * Math.min(altitude, tropopause) + (inputs.isaDeviation ?? 0);
  }

  private static climb(config: AircraftConfig, inputs: AlternateFuelInputs, toAltitude: number, fuelOnBoard: number) {
    let altitude = inputs.destinationElevation;
    let fuel = fuelOnBoard;
    const result = { distance: 0, fuel: 0, time: 0 };
    while (altitude < toAltitude) {
      const next = Math.min(altitude + AlternateFuelPredictor.ALTITUDE_STEP, toAltitude);
      const midAltitude = (altitude + next) / 2;
      const n1 = EngineModel.getClimbThrustCorrectedN1(
        config.engineModelParameters,
        midAltitude,
        AlternateFuelPredictor.staticAirTemperature(midAltitude, inputs),
      );
      const step = Predictions.altitudeStep(
        config,
        altitude,
        next - altitude,
        AlternateFuelPredictor.speedAt(midAltitude, AlternateFuelPredictor.CLIMB_CAS),
        AlternateFuelPredictor.MACH,
        n1,
        inputs.zeroFuelWeight,
        fuel,
        inputs.headwind ?? 0,
        inputs.isaDeviation ?? 0,
        inputs.tropopause ?? 36_090,
        inputs.perfFactor ?? 0,
      );
      result.distance += step.distanceTraveled;
      result.fuel += step.fuelBurned;
      result.time += step.timeElapsed;
      fuel -= step.fuelBurned;
      altitude = next;
    }
    return result;
  }

  /** The idle descent, computed backwards from the alternate (as the VNAV does): the steps give negative values */
  private static descent(config: AircraftConfig, inputs: AlternateFuelInputs, fromAltitude: number, fuelAtTop: number) {
    let altitude = inputs.alternateElevation;
    // The weight of the descent: the fuel at its top (the descent burns little, about 1 t)
    const fuel = fuelAtTop;
    const result = { distance: 0, fuel: 0, time: 0 };
    while (altitude < fromAltitude) {
      const next = Math.min(altitude + AlternateFuelPredictor.ALTITUDE_STEP, fromAltitude);
      const midAltitude = (altitude + next) / 2;
      const speed = AlternateFuelPredictor.speedAt(midAltitude, AlternateFuelPredictor.DESCENT_CAS);
      const tropopause = inputs.tropopause ?? 36_090;
      // The idle N1 at the Mach of the descent speed (as the VNAV descent strategy)
      const mach = Math.min(
        Common.CAStoMach(speed, Common.getDelta(midAltitude, midAltitude > tropopause)),
        AlternateFuelPredictor.MACH,
      );
      const n1 =
        EngineModel.getIdleCorrectedN1(config.engineModelParameters, midAltitude, mach, tropopause) +
        config.vnavConfig.IDLE_N1_MARGIN;
      const step = Predictions.altitudeStep(
        config,
        altitude,
        next - altitude,
        speed,
        AlternateFuelPredictor.MACH,
        n1,
        inputs.zeroFuelWeight,
        fuel,
        inputs.headwind ?? 0,
        inputs.isaDeviation ?? 0,
        inputs.tropopause ?? 36_090,
        inputs.perfFactor ?? 0,
      );
      result.distance += Math.abs(step.distanceTraveled);
      result.fuel += Math.abs(step.fuelBurned);
      result.time += Math.abs(step.timeElapsed);
      altitude = next;
    }
    return result;
  }

  private static cruise(
    config: AircraftConfig,
    inputs: AlternateFuelInputs,
    altitude: number,
    distance: number,
    fuelOnBoard: number,
  ) {
    let fuel = fuelOnBoard;
    let remaining = distance;
    const result = { fuel: 0, time: 0 };
    while (remaining > 0) {
      const stepDistance = Math.min(remaining, AlternateFuelPredictor.CRUISE_STEP);
      const step = Predictions.levelFlightStep(
        config,
        altitude,
        stepDistance,
        AlternateFuelPredictor.speedAt(altitude, AlternateFuelPredictor.CLIMB_CAS),
        AlternateFuelPredictor.MACH,
        inputs.zeroFuelWeight,
        fuel,
        inputs.headwind ?? 0,
        inputs.isaDeviation ?? 0,
        inputs.tropopause ?? 36_090,
        inputs.perfFactor ?? 0,
      );
      result.fuel += step.fuelBurned;
      result.time += step.timeElapsed;
      fuel -= step.fuelBurned;
      remaining -= stepDistance;
    }
    return result;
  }
}
