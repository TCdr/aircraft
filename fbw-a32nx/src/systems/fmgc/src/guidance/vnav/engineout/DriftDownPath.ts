// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common } from '../common';
import { EngineModel } from '../EngineModel';
import { Predictions } from '../Predictions';
import { VerticalCheckpointReason } from '../profile/NavGeometryProfile';

/** The FMS predicts at least this descent rate while it drifts down to the level-off altitude, in feet per minute */
export const MINIMUM_DRIFT_DOWN_DESCENT_RATE = 100;

/** Altitude step of the drift down prediction, in feet */
const DRIFT_DOWN_ALTITUDE_STEP = 500;

/** A deceleration that would take longer than this is cut short: the drift down starts anyway, in seconds */
const MAXIMUM_DECELERATION_TIME = 300;

/** Level flight acceleration to the cruise speed at the level-off altitude takes at most this long, in seconds */
const MAXIMUM_ACCELERATION_TIME = 600;

export interface DriftDownInputs {
  /** The aircraft with the failed engines removed */
  config: AircraftConfig;
  startAltitude: Feet;
  /** Calibrated airspeed at the start, knots */
  startSpeed: Knots;
  /** The altitude where the drift down is predicted to level off (EO MAX or the CRZ FL when it is lower) */
  levelOffAltitude: Feet;
  /** The altitude where the remaining engines hold the green dot speed in level flight */
  driftDownAltitude: Feet;
  greenDotSpeedAt(altitude: Feet): Knots;
  /** Mach at which the CAS targets change to Mach targets */
  cruiseMach: Mach;
  /** Calibrated airspeed of the cruise at the level-off altitude, knots */
  cruiseSpeed: Knots;
  zeroFuelWeight: Pounds;
  fuelOnBoard: Pounds;
  /** Headwind component, knots */
  headwind: Knots;
  isaDeviation: number;
  tropopause: Feet;
}

/** A point of the predicted drift down, from the start of it */
export interface DriftDownPoint {
  reason: VerticalCheckpointReason;
  distance: NauticalMiles;
  seconds: Seconds;
  altitude: Feet;
  fuelBurned: Pounds;
  speed: Knots;
}

/**
 * The predicted drift down after an engine failure above the engine-out maximum altitude: an immediate level-off and
 * deceleration to the green dot speed, the descent at the green dot speed with the thrust the remaining engines
 * have (but at least 100 ft/min) down to the level-off altitude, and the acceleration to the cruise speed there.
 * The profile of the flight plan continues from the last point.
 * @returns the points of the drift down; empty when the start is not above the level-off altitude
 */
export function computeDriftDownPath(inputs: DriftDownInputs): DriftDownPoint[] {
  if (inputs.startAltitude <= inputs.levelOffAltitude + DRIFT_DOWN_ALTITUDE_STEP / 5) {
    return [];
  }

  const points: DriftDownPoint[] = [];
  let distance = 0;
  let seconds = 0;
  let fuelBurned = 0;
  let altitude = inputs.startAltitude;
  let speed = inputs.startSpeed;
  const weightFuel = () => inputs.fuelOnBoard - fuelBurned;
  const add = (reason: VerticalCheckpointReason) =>
    points.push({ reason, distance, seconds, altitude, fuelBurned, speed });

  const maximumContinuousN1 = (at: Feet) =>
    EngineModel.getClimbThrustCorrectedN1(
      inputs.config.engineModelParameters,
      at,
      Common.getTemp(at, inputs.isaDeviation, at > inputs.tropopause),
    );

  // Immediate level-off: decelerate to the green dot speed at the thrust of the remaining engines
  const greenDotAtStart = inputs.greenDotSpeedAt(altitude);
  if (speed > greenDotAtStart + 1) {
    const deceleration = Predictions.speedChangeStep(
      inputs.config,
      0,
      altitude,
      speed,
      greenDotAtStart,
      inputs.cruiseMach,
      inputs.cruiseMach,
      maximumContinuousN1(altitude),
      inputs.zeroFuelWeight,
      weightFuel(),
      inputs.headwind,
      inputs.isaDeviation,
      inputs.tropopause,
    );
    const usable = deceleration.error === undefined && deceleration.timeElapsed > 0;
    const scale = usable ? Math.min(1, MAXIMUM_DECELERATION_TIME / deceleration.timeElapsed) : 0;
    if (usable) {
      distance += deceleration.distanceTraveled * scale;
      seconds += deceleration.timeElapsed * scale;
      fuelBurned += deceleration.fuelBurned * scale;
    }
    speed = greenDotAtStart;
    add(VerticalCheckpointReason.AtmosphericConditions);
  }

  const passedDriftDownAltitude = () => altitude <= inputs.driftDownAltitude + 1;
  let driftDownMarked = passedDriftDownAltitude();
  for (let i = 0; i < 400 && altitude > inputs.levelOffAltitude + 1; i++) {
    let nextAltitude = Math.max(inputs.levelOffAltitude, altitude - DRIFT_DOWN_ALTITUDE_STEP);
    if (!driftDownMarked && nextAltitude < inputs.driftDownAltitude) {
      nextAltitude = inputs.driftDownAltitude;
    }
    const middleAltitude = (altitude + nextAltitude) / 2;
    const casAtMiddle = inputs.greenDotSpeedAt(middleAltitude);

    let step = Predictions.altitudeStep(
      inputs.config,
      altitude,
      nextAltitude - altitude,
      casAtMiddle,
      inputs.cruiseMach,
      maximumContinuousN1(middleAltitude),
      inputs.zeroFuelWeight,
      weightFuel(),
      inputs.headwind,
      inputs.isaDeviation,
      inputs.tropopause,
    );
    // The remaining engines can hold more than the minimum descent rate: the FMS predicts the minimum one
    if (!(step.verticalSpeed < -MINIMUM_DRIFT_DOWN_DESCENT_RATE)) {
      step = Predictions.verticalSpeedStep(
        inputs.config,
        altitude,
        nextAltitude,
        -MINIMUM_DRIFT_DOWN_DESCENT_RATE,
        casAtMiddle,
        inputs.cruiseMach,
        inputs.zeroFuelWeight,
        weightFuel(),
        inputs.isaDeviation,
        inputs.headwind,
        inputs.tropopause,
      );
    }

    distance += step.distanceTraveled;
    seconds += step.timeElapsed;
    fuelBurned += step.fuelBurned;
    altitude = nextAltitude;
    speed = inputs.greenDotSpeedAt(altitude);
    if (!driftDownMarked && passedDriftDownAltitude()) {
      driftDownMarked = true;
      add(VerticalCheckpointReason.DriftDown);
    } else if (altitude > inputs.levelOffAltitude + 1) {
      add(VerticalCheckpointReason.AtmosphericConditions);
    }
  }

  altitude = inputs.levelOffAltitude;
  if (inputs.cruiseSpeed > speed + 1) {
    const acceleration = Predictions.speedChangeStep(
      inputs.config,
      0,
      altitude,
      speed,
      inputs.cruiseSpeed,
      inputs.cruiseMach,
      inputs.cruiseMach,
      maximumContinuousN1(altitude),
      inputs.zeroFuelWeight,
      weightFuel(),
      inputs.headwind,
      inputs.isaDeviation,
      inputs.tropopause,
    );
    if (acceleration.error === undefined && acceleration.timeElapsed > 0) {
      const scale = Math.min(1, MAXIMUM_ACCELERATION_TIME / acceleration.timeElapsed);
      distance += acceleration.distanceTraveled * scale;
      seconds += acceleration.timeElapsed * scale;
      fuelBurned += acceleration.fuelBurned * scale;
    }
    speed = inputs.cruiseSpeed;
  }
  add(VerticalCheckpointReason.DriftDownLevelOff);

  return points;
}
