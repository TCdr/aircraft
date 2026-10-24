// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';
import { NavGeometryProfile, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

export interface GoAroundDestinationInputs {
  /** Along-track distance from the aircraft to the destination, through the missed approach, in NM */
  distance: NauticalMiles;
  /** Altitude the remaining distance is flown at, in feet */
  altitude: Feet;
  /** The managed speed of the go-around phase, green dot */
  cas: Knots;
  zeroFuelWeight: Pounds;
  fuelOnBoard: Pounds;
  isaDeviation: Celsius;
  tropoPause: Feet;
  perfFactor: number;
}

export interface GoAroundDestinationPrediction {
  /** Seconds */
  time: Seconds;
  /** Pounds */
  fuelBurned: Pounds;
}

/**
 * The time and fuel from the aircraft to the destination in the go-around phase. The FMS does not compute the vertical
 * predictions of the missed approach, and for the destination it ignores speed and altitude constraints and the wind.
 *
 * Design choice: the remaining distance is flown level at the green dot speed. The FMS publishes no model for this
 * estimate, and a level flight is the one that needs neither a profile nor a constraint.
 */
export function predictGoAroundToDestination(
  config: AircraftConfig,
  inputs: GoAroundDestinationInputs,
): GoAroundDestinationPrediction {
  if (!(inputs.distance > 0)) {
    return { time: 0, fuelBurned: 0 };
  }

  const { timeElapsed, fuelBurned } = Predictions.levelFlightStep(
    config,
    inputs.altitude,
    inputs.distance,
    inputs.cas,
    // Never a Mach cruise at the altitudes of a go-around
    1,
    inputs.zeroFuelWeight,
    inputs.fuelOnBoard,
    0,
    inputs.isaDeviation,
    inputs.tropoPause,
    inputs.perfFactor,
    false,
    FlapConf.CLEAN,
    false,
  );

  return { time: timeElapsed, fuelBurned: Math.min(fuelBurned, inputs.fuelOnBoard) };
}

/** The waypoint predictions the F-PLN shows in the go-around phase: the destination only, the missed approach legs stay blank */
export function onlyDestinationPrediction<T>(
  predictions: Map<number, T>,
  destinationLegIndex: number | null,
): Map<number, T> {
  const destinationPrediction = destinationLegIndex === null ? undefined : predictions.get(destinationLegIndex);

  return destinationLegIndex === null || destinationPrediction === undefined
    ? new Map()
    : new Map([[destinationLegIndex, destinationPrediction]]);
}

export class GoAroundPathBuilder {
  constructor(
    private readonly observer: VerticalProfileComputationParametersObserver,
    private readonly atmosphericConditions: AtmosphericConditions,
  ) {}

  /**
   * Adds the end of the flight plan to a profile that holds the present position only. The profile has no vertical path:
   * it carries the time and the fuel at the destination.
   */
  buildGoAroundPath(profile: NavGeometryProfile, config: AircraftConfig, destinationLegIndex: number | null): void {
    const { zeroFuelWeight, cleanSpeed, tropoPause, perfFactor } = this.observer.get();
    const start = profile.lastCheckpoint;
    if (!start) {
      return;
    }

    const { time, fuelBurned } = predictGoAroundToDestination(config, {
      distance: profile.totalFlightPlanDistance - start.distanceFromStart,
      altitude: start.altitude,
      cas: cleanSpeed,
      zeroFuelWeight,
      fuelOnBoard: start.remainingFuelOnBoard,
      isaDeviation: this.atmosphericConditions.isaDeviation,
      tropoPause,
      perfFactor,
    });

    profile.checkpoints.push({
      ...start,
      reason: VerticalCheckpointReason.Landing,
      distanceFromStart: Math.max(profile.totalFlightPlanDistance, start.distanceFromStart),
      secondsFromPresent: start.secondsFromPresent + time,
      remainingFuelOnBoard: start.remainingFuelOnBoard - fuelBurned,
    });

    profile.isDestinationOnly = true;
    profile.finalizeProfile();
    profile.waypointPredictions = onlyDestinationPrediction(profile.waypointPredictions, destinationLegIndex);
  }
}
