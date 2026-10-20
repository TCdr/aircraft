// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EnergyCircleRule } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common } from '@fmgc/guidance/vnav/common';
import { VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { LateralMode } from '@shared/autopilot';
import { FmgcFlightPhase } from '@shared/flightphase';

/** The L:var the FMS writes for the NDs: the energy circle radius in NM, 0 without an energy circle */
const ENERGY_CIRCLE_DISTANCE_VAR = 'L:A32NX_FM_ENERGY_CIRCLE_DISTANCE';

export interface EnergyCircleInputs {
  flightPhase: FmgcFlightPhase;
  lateralMode: LateralMode;
  distanceToDestination: NauticalMiles;
}

export function isEnergyCircleProvided(rule: EnergyCircleRule, inputs: EnergyCircleInputs): boolean {
  if (!rule.phases.includes(inputs.flightPhase)) {
    return false;
  }
  if (
    rule.selectedLateralModeOnly &&
    inputs.lateralMode !== LateralMode.HDG &&
    inputs.lateralMode !== LateralMode.TRACK
  ) {
    return false;
  }
  return (
    rule.maxDistanceToDestination === null ||
    (Number.isFinite(inputs.distanceToDestination) && inputs.distanceToDestination <= rule.maxDistanceToDestination)
  );
}

/**
 * The required distance to land: the length of the managed descent profile from the present altitude down to the
 * landing, with its speed constraints, decelerations and the final approach at VAPP.
 * Design choice: the profile speed at the present altitude, a speed above it would need some more distance.
 * @param checkpoints the descent profile, from the top of descent to the landing
 * @param altitude the present altitude, ft
 * @returns NM, null without a descent profile or when already at the landing altitude
 */
export function requiredDistanceToLand(
  checkpoints: readonly VerticalCheckpoint[],
  altitude: Feet,
): NauticalMiles | null {
  const landing = checkpoints[checkpoints.length - 1];
  if (!landing || landing.reason !== VerticalCheckpointReason.Landing || altitude <= landing.altitude) {
    return null;
  }

  for (let i = checkpoints.length - 1; i > 0; i--) {
    const lower = checkpoints[i];
    const upper = checkpoints[i - 1];
    if (altitude <= upper.altitude) {
      const distanceAtAltitude =
        upper.altitude > lower.altitude
          ? Common.interpolate(
              altitude,
              lower.altitude,
              upper.altitude,
              lower.distanceFromStart,
              upper.distanceFromStart,
            )
          : upper.distanceFromStart;
      return landing.distanceFromStart - distanceAtAltitude;
    }
  }

  // Above the top of descent: the whole descent
  return landing.distanceFromStart - checkpoints[0].distanceFromStart;
}

/** Writes the energy circle radius for the NDs when it changes */
export class EnergyCirclePublisher {
  private publishedDistance: NauticalMiles | null = null;

  /**
   * @param rule when the aircraft provides the energy circle
   * @param inputs the flight phase, the lateral mode and the distance to the destination
   * @param checkpoints the descent profile, from the top of descent to the landing
   * @param altitude the present altitude, ft
   */
  update(
    rule: EnergyCircleRule,
    inputs: EnergyCircleInputs,
    checkpoints: readonly VerticalCheckpoint[] | undefined,
    altitude: Feet,
  ): void {
    const distance =
      checkpoints && isEnergyCircleProvided(rule, inputs) ? requiredDistanceToLand(checkpoints, altitude) : null;
    this.publish(distance !== null && distance > 0 ? Math.round(distance * 10) / 10 : 0);
  }

  reset(): void {
    this.publish(0);
  }

  private publish(distance: NauticalMiles): void {
    if (distance !== this.publishedDistance) {
      this.publishedDistance = distance;
      SimVar.SetSimVarValue(ENERGY_CIRCLE_DISTANCE_VAR, 'number', distance);
    }
  }
}
