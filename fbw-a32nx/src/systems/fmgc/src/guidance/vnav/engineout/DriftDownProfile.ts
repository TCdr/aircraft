// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Common } from '../common';
import { BaseGeometryProfile } from '../profile/BaseGeometryProfile';
import { VerticalProfileComputationParameters } from '../VerticalProfileComputationParameters';
import { computeDriftDownPath } from './DriftDownPath';

/**
 * Appends the predicted drift down to a profile whose last checkpoint is above the level-off altitude of the engine
 * failure. The cruise of the profile then starts at the level-off altitude.
 */
export function appendDriftDownPath(profile: BaseGeometryProfile, parameters: VerticalProfileComputationParameters) {
  const { engineOut } = parameters;
  const start = profile.lastCheckpoint;
  if (!engineOut || !start) {
    return;
  }

  const levelOffAltitude = Math.min(parameters.cruiseAltitude, engineOut.maximumAltitude);
  const delta = Common.getDelta(levelOffAltitude, levelOffAltitude > parameters.tropoPause);
  const cruiseSpeed = Math.min(
    parameters.managedCruiseSpeed,
    Common.machToCas(parameters.managedCruiseSpeedMach, delta),
  );
  const points = computeDriftDownPath({
    config: engineOut.performance.config,
    startAltitude: start.altitude,
    startSpeed: start.speed,
    levelOffAltitude,
    driftDownAltitude: engineOut.driftDownAltitude,
    greenDotSpeedAt: (altitude) => engineOut.performance.greenDotSpeedAt(altitude),
    cruiseMach: parameters.managedCruiseSpeedMach,
    cruiseSpeed,
    zeroFuelWeight: parameters.zeroFuelWeight,
    fuelOnBoard: start.remainingFuelOnBoard,
    headwind: -profile.winds.getClimbTailwind(start.distanceFromStart, start.altitude),
    isaDeviation: engineOut.isaDeviation,
    tropopause: parameters.tropoPause,
  });

  for (const point of points) {
    profile.checkpoints.push({
      ...start,
      reason: point.reason,
      distanceFromStart: start.distanceFromStart + point.distance,
      secondsFromPresent: start.secondsFromPresent + point.seconds,
      altitude: point.altitude,
      remainingFuelOnBoard: start.remainingFuelOnBoard - point.fuelBurned,
      speed: point.speed,
    });
  }
}
