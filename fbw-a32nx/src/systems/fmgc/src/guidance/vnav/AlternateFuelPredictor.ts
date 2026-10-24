// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { alternateCruiseLevel, AlternateCruiseLevelRule } from '@fmgc/flightplanning/plans/AlternateCruiseLevel';
import { Common } from '@fmgc/guidance/vnav/common';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';
import { ISA_TROPOPAUSE_ALTITUDE } from '@fmgc/guidance/vnav/EconSpeeds';

/** The speeds of the alternate flight plan: the FMS computes it with a cost index of 0 */
export interface AlternateSpeeds {
  climbCas: number;
  climbMach: number;
  cruiseCas: number;
  cruiseMach: number;
  descentCas: number;
  descentMach: number;
}

/** CI 0 speeds of the A380 FMS formulas (managed climb and descent speeds at CI 0) */
export const A380_ALTERNATE_SPEEDS: AlternateSpeeds = {
  climbCas: 290,
  climbMach: 0.84,
  cruiseCas: 290,
  cruiseMach: 0.84,
  descentCas: 288,
  descentMach: 0.84,
};

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
  /** The aircraft rule of the default cruise level, A380 when omitted */
  cruiseLevelRule?: AlternateCruiseLevelRule;
  /** The approach speed (Vapp) shown at the primary destination and at the alternate, knots */
  approachSpeed?: number;
  /** The speeds of the alternate flight plan, the A380 ones when omitted */
  speeds?: AlternateSpeeds;
}

export type AlternateProfilePhase = 'climb' | 'cruise' | 'descent';

/** A point of the alternate flight plan profile, the distance, time and fuel counted from the primary destination */
export interface AlternateProfilePoint {
  /** NM */
  distance: number;
  /** Seconds */
  time: number;
  /** Pounds burnt */
  fuel: number;
  /** Feet */
  altitude: number;
  /** The CAS the point is flown at, knots */
  cas: number;
  phase: AlternateProfilePhase;
}

export interface AlternateFuelPrediction {
  /** The fuel from the primary destination to the landing at the alternate, in pounds */
  fuel: number;
  /** The time from the primary destination to the landing at the alternate, in seconds */
  time: number;
  /** The cruise altitude of the computation, in feet */
  cruiseAltitude: number;
  /** The climb, cruise and descent of the alternate flight plan, from the destination to the landing */
  profile: AlternateProfilePoint[];
  speeds: AlternateSpeeds;
}

interface PhasePoint {
  distance: number;
  time: number;
  fuel: number;
  altitude: number;
  cas: number;
}

interface PhaseResult {
  distance: number;
  fuel: number;
  time: number;
  points: PhasePoint[];
}

/**
 * The default ALTN fuel and time of the FUEL&LOAD / FUEL PRED pages: the fuel (time) necessary for the trip between
 * the primary destination and the landing at the alternate, computed with a cost index of 0, at the default alternate
 * cruise level of the aircraft.
 *
 * The trip is computed with the VNAV prediction models of the aircraft: a climb at climb thrust, a cruise, and an idle
 * descent, at the CI 0 speeds of the FMS (250 kt below FL100). When the distance is too short for the climb and
 * descent, the cruise altitude is lowered until they fit. The profile it returns gives the predictions at the
 * waypoints of the alternate flight plan.
 */
export class AlternateFuelPredictor {
  private static readonly SPEED_LIMIT_CAS = 250;

  private static readonly SPEED_LIMIT_ALTITUDE = 10_000;

  private static readonly ALTITUDE_STEP = 2_000;

  private static readonly CRUISE_STEP = 50;

  public static predict(config: AircraftConfig, inputs: AlternateFuelInputs): AlternateFuelPrediction | null {
    const { distance, destinationElevation, alternateElevation } = inputs;
    if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(inputs.zeroFuelWeight)) {
      return null;
    }
    const speeds = inputs.speeds ?? A380_ALTERNATE_SPEEDS;

    let cruiseAltitude = alternateCruiseLevel(distance, inputs.cruiseLevelRule ?? 'A380') * 100;
    const lowest = Math.max(destinationElevation, alternateElevation) + AlternateFuelPredictor.ALTITUDE_STEP;

    // Lower the cruise altitude until the climb and the descent fit in the distance
    for (;;) {
      const climb = AlternateFuelPredictor.climb(config, inputs, speeds, cruiseAltitude, inputs.fuelOnBoard);
      const descent = AlternateFuelPredictor.descent(
        config,
        inputs,
        speeds,
        cruiseAltitude,
        inputs.fuelOnBoard - climb.fuel,
      );
      const cruiseDistance = distance - climb.distance - descent.distance;
      if (cruiseDistance >= 0 || cruiseAltitude <= lowest) {
        const cruise = AlternateFuelPredictor.cruise(
          config,
          inputs,
          speeds,
          cruiseAltitude,
          Math.max(cruiseDistance, 0),
          inputs.fuelOnBoard - climb.fuel,
        );
        // Shorter than the climb and descent at the lowest altitude: scaled to the distance
        const scale = cruiseDistance >= 0 ? 1 : distance / (climb.distance + descent.distance);
        const fuel = (climb.fuel + descent.fuel) * scale + cruise.fuel;
        const time = (climb.time + descent.time) * scale + cruise.time;
        return {
          fuel,
          time,
          cruiseAltitude,
          profile: AlternateFuelPredictor.assembleProfile(
            { climb, cruise, descent },
            scale,
            { distance, fuel, time },
            cruiseAltitude,
            speeds,
            inputs,
          ),
          speeds,
        };
      }
      cruiseAltitude = Math.max(cruiseAltitude - AlternateFuelPredictor.ALTITUDE_STEP, lowest);
    }
  }

  private static assembleProfile(
    phases: { climb: PhaseResult; cruise: PhaseResult; descent: PhaseResult },
    scale: number,
    total: { distance: number; fuel: number; time: number },
    cruiseAltitude: number,
    speeds: AlternateSpeeds,
    inputs: AlternateFuelInputs,
  ): AlternateProfilePoint[] {
    const { climb, cruise, descent } = phases;
    const profile: AlternateProfilePoint[] = [
      {
        distance: 0,
        time: 0,
        fuel: 0,
        altitude: inputs.destinationElevation,
        // The airports show the speed the active flight plan shows at its destination
        cas: inputs.approachSpeed ?? AlternateFuelPredictor.speedAt(inputs.destinationElevation, speeds.climbCas),
        phase: 'climb',
      },
    ];
    for (const point of climb.points) {
      profile.push({
        distance: point.distance * scale,
        time: point.time * scale,
        fuel: point.fuel * scale,
        altitude: point.altitude,
        cas: point.cas,
        phase: 'climb',
      });
    }
    const climbEnd = profile[profile.length - 1];
    for (const point of cruise.points) {
      profile.push({
        distance: climbEnd.distance + point.distance,
        time: climbEnd.time + point.time,
        fuel: climbEnd.fuel + point.fuel,
        altitude: point.altitude,
        cas: point.cas,
        phase: 'cruise',
      });
    }
    // The descent points count from the alternate: from the top of descent down to the landing
    for (let i = descent.points.length - 1; i >= 0; i--) {
      const point = descent.points[i];
      profile.push({
        distance: total.distance - point.distance * scale,
        time: total.time - point.time * scale,
        fuel: total.fuel - point.fuel * scale,
        altitude: point.altitude,
        cas: point.cas,
        phase: i === descent.points.length - 1 ? 'cruise' : 'descent',
      });
    }
    profile.push({
      distance: total.distance,
      time: total.time,
      fuel: total.fuel,
      altitude: inputs.alternateElevation,
      cas: inputs.approachSpeed ?? AlternateFuelPredictor.speedAt(inputs.alternateElevation, speeds.descentCas),
      phase: 'descent',
    });
    return profile;
  }

  private static speedAt(altitude: number, cas: number): number {
    return altitude < AlternateFuelPredictor.SPEED_LIMIT_ALTITUDE ? AlternateFuelPredictor.SPEED_LIMIT_CAS : cas;
  }

  /** Static air temperature at an altitude, in °C */
  private static staticAirTemperature(altitude: number, inputs: AlternateFuelInputs): number {
    const tropopause = inputs.tropopause ?? ISA_TROPOPAUSE_ALTITUDE;
    return 15 - 0.0019812 * Math.min(altitude, tropopause) + (inputs.isaDeviation ?? 0);
  }

  private static climb(
    config: AircraftConfig,
    inputs: AlternateFuelInputs,
    speeds: AlternateSpeeds,
    toAltitude: number,
    fuelOnBoard: number,
  ): PhaseResult {
    let altitude = inputs.destinationElevation;
    let fuel = fuelOnBoard;
    const result: PhaseResult = { distance: 0, fuel: 0, time: 0, points: [] };
    while (altitude < toAltitude) {
      const next = Math.min(altitude + AlternateFuelPredictor.ALTITUDE_STEP, toAltitude);
      const midAltitude = (altitude + next) / 2;
      const n1 = EngineModel.getClimbThrustCorrectedN1(
        config.engineModelParameters,
        midAltitude,
        AlternateFuelPredictor.staticAirTemperature(midAltitude, inputs),
      );
      const cas = AlternateFuelPredictor.speedAt(midAltitude, speeds.climbCas);
      const step = Predictions.altitudeStep(
        config,
        altitude,
        next - altitude,
        cas,
        speeds.climbMach,
        n1,
        inputs.zeroFuelWeight,
        fuel,
        inputs.headwind ?? 0,
        inputs.isaDeviation ?? 0,
        inputs.tropopause ?? ISA_TROPOPAUSE_ALTITUDE,
        inputs.perfFactor ?? 0,
      );
      result.distance += step.distanceTraveled;
      result.fuel += step.fuelBurned;
      result.time += step.timeElapsed;
      fuel -= step.fuelBurned;
      altitude = next;
      result.points.push({
        distance: result.distance,
        time: result.time,
        fuel: result.fuel,
        altitude,
        cas,
      });
    }
    return result;
  }

  /**
   * The idle descent, computed backwards from the alternate (as the VNAV does): the steps give negative values. Its
   * points count from the alternate, from the landing up to the top of descent.
   */
  private static descent(
    config: AircraftConfig,
    inputs: AlternateFuelInputs,
    speeds: AlternateSpeeds,
    fromAltitude: number,
    fuelAtTop: number,
  ): PhaseResult {
    let altitude = inputs.alternateElevation;
    // The weight of the descent: the fuel at its top (the descent burns little, about 1 t)
    const fuel = fuelAtTop;
    const result: PhaseResult = { distance: 0, fuel: 0, time: 0, points: [] };
    while (altitude < fromAltitude) {
      const next = Math.min(altitude + AlternateFuelPredictor.ALTITUDE_STEP, fromAltitude);
      const midAltitude = (altitude + next) / 2;
      const speed = AlternateFuelPredictor.speedAt(midAltitude, speeds.descentCas);
      const tropopause = inputs.tropopause ?? ISA_TROPOPAUSE_ALTITUDE;
      // The idle N1 at the Mach of the descent speed (as the VNAV descent strategy)
      const mach = Math.min(
        Common.CAStoMach(speed, Common.getDelta(midAltitude, midAltitude > tropopause)),
        speeds.descentMach,
      );
      const n1 =
        EngineModel.getIdleCorrectedN1(config.engineModelParameters, midAltitude, mach, tropopause) +
        config.vnavConfig.IDLE_N1_MARGIN;
      const step = Predictions.altitudeStep(
        config,
        altitude,
        next - altitude,
        speed,
        speeds.descentMach,
        n1,
        inputs.zeroFuelWeight,
        fuel,
        inputs.headwind ?? 0,
        inputs.isaDeviation ?? 0,
        tropopause,
        inputs.perfFactor ?? 0,
      );
      result.distance += Math.abs(step.distanceTraveled);
      result.fuel += Math.abs(step.fuelBurned);
      result.time += Math.abs(step.timeElapsed);
      altitude = next;
      result.points.push({
        distance: result.distance,
        time: result.time,
        fuel: result.fuel,
        altitude,
        cas: speed,
      });
    }
    return result;
  }

  private static cruise(
    config: AircraftConfig,
    inputs: AlternateFuelInputs,
    speeds: AlternateSpeeds,
    altitude: number,
    distance: number,
    fuelOnBoard: number,
  ): PhaseResult {
    let fuel = fuelOnBoard;
    let remaining = distance;
    const result: PhaseResult = { distance: 0, fuel: 0, time: 0, points: [] };
    const cas = AlternateFuelPredictor.speedAt(altitude, speeds.cruiseCas);
    while (remaining > 0) {
      const stepDistance = Math.min(remaining, AlternateFuelPredictor.CRUISE_STEP);
      const step = Predictions.levelFlightStep(
        config,
        altitude,
        stepDistance,
        cas,
        speeds.cruiseMach,
        inputs.zeroFuelWeight,
        fuel,
        inputs.headwind ?? 0,
        inputs.isaDeviation ?? 0,
        inputs.tropopause ?? ISA_TROPOPAUSE_ALTITUDE,
        inputs.perfFactor ?? 0,
      );
      result.distance += stepDistance;
      result.fuel += step.fuelBurned;
      result.time += step.timeElapsed;
      fuel -= step.fuelBurned;
      remaining -= stepDistance;
      result.points.push({ distance: result.distance, time: result.time, fuel: result.fuel, altitude, cas });
    }
    return result;
  }
}

/**
 * The speed shown at a profile point: the CAS, or the Mach once the CAS would exceed the Mach of the phase.
 * @param point a point of the alternate profile
 * @param speeds the speeds of the alternate flight plan
 * @param tropopause feet
 * @returns knots, or a Mach below 1
 */
export function alternateProfileSpeed(
  point: AlternateProfilePoint,
  speeds: AlternateSpeeds,
  tropopause: number,
): number {
  const mach =
    point.phase === 'climb' ? speeds.climbMach : point.phase === 'cruise' ? speeds.cruiseMach : speeds.descentMach;
  const machAtCas = Common.CAStoMach(point.cas, Common.getDelta(point.altitude, point.altitude > tropopause));
  return machAtCas >= mach ? mach : point.cas;
}

/**
 * @param profile a profile of AlternateFuelPredictor, counted from the primary destination
 * @param distance the distance along the alternate flight plan, in NM (clamped to the profile)
 * @returns the profile at that distance: time, fuel and altitude by linear interpolation, the phase and CAS of the
 * segment it is in
 */
export function alternateProfileAt(profile: AlternateProfilePoint[], distance: number): AlternateProfilePoint {
  const last = profile[profile.length - 1];
  if (distance <= profile[0].distance) {
    return { ...profile[0] };
  }
  if (distance >= last.distance) {
    return { ...last };
  }
  let upper = 1;
  while (profile[upper].distance < distance) {
    upper++;
  }
  const from = profile[upper - 1];
  const to = profile[upper];
  const ratio = to.distance > from.distance ? (distance - from.distance) / (to.distance - from.distance) : 0;
  return {
    distance,
    time: from.time + (to.time - from.time) * ratio,
    fuel: from.fuel + (to.fuel - from.fuel) * ratio,
    altitude: from.altitude + (to.altitude - from.altitude) * ratio,
    cas: to.cas,
    phase: to.phase,
  };
}
