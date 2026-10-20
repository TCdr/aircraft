// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { VerticalSpeedStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { Common } from '@fmgc/guidance/vnav/common';
import {
  cruiseCabinAltitude,
  maxDescentCabinRate,
  meanCabinDescentRate,
  requiredDescentSeconds,
} from '@fmgc/guidance/vnav/descent/CabinRepressurization';
import { StepResults } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import {
  ProfilePhase,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

/**
 * Design choice: the repressurization segment is a constant vertical speed descent from the cruise level, slower than
 * the idle descent, at the descent speed. The rate is the one the FMS already uses for the early descent and the step
 * descents.
 */
const REPRESSURIZATION_SEGMENT_VERTICAL_SPEED: FeetPerMinute = -1000;

export interface RepressurizationSegmentPlan {
  /** The checkpoints of the descent sequence kept under the segment, from the start of the sequence */
  keptCheckpointCount: number;
  /** The end of the segment (its lowest point), on the idle path */
  end: VerticalCheckpoint;
  /** The time the segment adds to the descent, s */
  addedSeconds: Seconds;
}

/**
 * Where the repressurization segment has to end on the idle path for the descent to take `extraSeconds` longer. The
 * segment replaces the top of the idle path, down to the first point where the idle path changes speed or ends.
 * @param checkpoints the descent sequence as built backwards: the landing first, the top of descent last
 * @param extraSeconds the time to add to the descent, s
 * @param verticalSpeed the vertical speed of the segment, ft/min (negative)
 * @returns the plan, the longest possible segment when even it is too short, or null when no segment adds time
 */
export function planRepressurizationSegment(
  checkpoints: readonly VerticalCheckpoint[],
  extraSeconds: Seconds,
  verticalSpeed: FeetPerMinute,
): RepressurizationSegmentPlan | null {
  const topIndex = checkpoints.length - 1;
  if (extraSeconds <= 0 || topIndex < 1) {
    return null;
  }
  const topOfDescent = checkpoints[topIndex];

  let floorIndex = topIndex - 1;
  while (floorIndex > 0 && checkpoints[floorIndex].reason === VerticalCheckpointReason.IdlePathAtmosphericConditions) {
    floorIndex--;
  }
  const floorAltitude = checkpoints[floorIndex].altitude;
  if (floorAltitude >= topOfDescent.altitude) {
    return null;
  }

  const addedSecondsWithEndAt = (altitude: Feet): Seconds => {
    const segmentSeconds = (60 * (topOfDescent.altitude - altitude)) / Math.abs(verticalSpeed);
    const idleSeconds = checkpointAtAltitude(checkpoints, floorIndex, altitude).checkpoint.secondsFromPresent;
    return segmentSeconds - (idleSeconds - topOfDescent.secondsFromPresent);
  };

  const longestAddedSeconds = addedSecondsWithEndAt(floorAltitude);
  if (longestAddedSeconds <= 0) {
    return null;
  }

  let endAltitude = floorAltitude;
  if (longestAddedSeconds > extraSeconds) {
    // The added time grows as the segment goes lower: bisect between the floor and the cruise level
    let low = floorAltitude;
    let high = topOfDescent.altitude;
    for (let i = 0; i < 30 && high - low > 1; i++) {
      const middle = (low + high) / 2;
      if (addedSecondsWithEndAt(middle) > extraSeconds) {
        low = middle;
      } else {
        high = middle;
      }
    }
    endAltitude = (low + high) / 2;
  }

  const end = checkpointAtAltitude(checkpoints, floorIndex, endAltitude);
  return {
    keptCheckpointCount: end.index,
    end: { ...end.checkpoint, reason: VerticalCheckpointReason.RepressurizationSegmentEnd },
    addedSeconds: addedSecondsWithEndAt(endAltitude),
  };
}

/**
 * The point of the idle path at an altitude, between the floor checkpoint and the top of descent
 * @returns the interpolated checkpoint and the index of the first checkpoint above it
 */
function checkpointAtAltitude(
  checkpoints: readonly VerticalCheckpoint[],
  floorIndex: number,
  altitude: Feet,
): { checkpoint: VerticalCheckpoint; index: number } {
  for (let i = floorIndex + 1; i < checkpoints.length; i++) {
    const lower = checkpoints[i - 1];
    const upper = checkpoints[i];
    if (altitude <= upper.altitude) {
      const at = (lowerValue: number, upperValue: number) =>
        upper.altitude > lower.altitude
          ? Common.interpolate(altitude, lower.altitude, upper.altitude, lowerValue, upperValue)
          : lowerValue;
      const checkpoint: VerticalCheckpoint = {
        ...lower,
        altitude,
        distanceFromStart: at(lower.distanceFromStart, upper.distanceFromStart),
        secondsFromPresent: at(lower.secondsFromPresent, upper.secondsFromPresent),
        remainingFuelOnBoard: at(lower.remainingFuelOnBoard, upper.remainingFuelOnBoard),
        speed: at(lower.speed, upper.speed),
      };
      return { checkpoint, index: i };
    }
  }
  return { checkpoint: { ...checkpoints[checkpoints.length - 1] }, index: checkpoints.length - 1 };
}

/** The cabin side of a computed descent profile */
export interface DescentCabinRateResult {
  /** The cabin altitude to lose from the cruise to the landing, ft */
  cabinDescent: Feet;
  /** ft/min, negative */
  maxRate: FeetPerMinute;
  /** The mean descent cabin rate of the descent profile, ft/min (negative) */
  meanRate: FeetPerMinute;
  /** The time from the top of descent to the landing, s */
  descentSeconds: Seconds;
  /** The distance from the top of descent to the landing, NM */
  descentDistance: NauticalMiles;
}

/** A vertical speed step at the descent speed from an altitude up to the cruise level, built backwards */
export type RepressurizationStepPredictor = (
  from: VerticalCheckpoint,
  cruiseAltitude: Feet,
  headwind: Knots,
) => StepResults;

/**
 * The repressurization segment of the descent profile: when the idle descent is too short for the cabin to descend at
 * the maximum descent cabin rate (DES CABIN RATE), the descent starts earlier with a shallower segment, and the T/D
 * moves back.
 */
export class RepressurizationSegmentBuilder {
  private readonly predictStep: RepressurizationStepPredictor;

  constructor(
    private readonly observer: VerticalProfileComputationParametersObserver,
    atmosphericConditions: AtmosphericConditions,
    private readonly acConfig: AircraftConfig,
    predictStep?: RepressurizationStepPredictor,
  ) {
    if (predictStep) {
      this.predictStep = predictStep;
    } else {
      const strategy = new VerticalSpeedStrategy(
        observer,
        atmosphericConditions,
        REPRESSURIZATION_SEGMENT_VERTICAL_SPEED,
        acConfig,
      );
      this.predictStep = (from, cruiseAltitude, headwind) =>
        strategy.predictToAltitude(
          from.altitude,
          cruiseAltitude,
          from.speed,
          observer.get().managedDescentSpeedMach,
          from.remainingFuelOnBoard,
          headwind,
        );
    }
  }

  /**
   * Adds the segment when it is needed
   * @param sequence the descent built backwards: the landing first, the top of descent last
   * @param profile the profile, for the winds
   * @returns the cabin side of the descent, with the segment
   */
  build(sequence: TemporaryCheckpointSequence, profile: BaseGeometryProfile): DescentCabinRateResult {
    const { descentCabinRate, destinationElevation } = this.observer.get();
    const maxRate = maxDescentCabinRate(descentCabinRate);
    const landing = sequence.checkpoints[0];
    const cruiseAltitude = sequence.lastCheckpoint.altitude;
    const cabinDescent =
      cruiseCabinAltitude(cruiseAltitude, destinationElevation, this.acConfig.vnavConfig.CABIN_PRESSURIZATION) -
      destinationElevation;

    const idleDescentSeconds = landing.secondsFromPresent - sequence.lastCheckpoint.secondsFromPresent;
    const plan = planRepressurizationSegment(
      sequence.checkpoints,
      requiredDescentSeconds(cabinDescent, maxRate) - idleDescentSeconds,
      REPRESSURIZATION_SEGMENT_VERTICAL_SPEED,
    );

    if (plan) {
      sequence.checkpoints.length = plan.keptCheckpointCount;
      sequence.push(plan.end);
      const headwind = -profile.winds.getDescentTailwind(
        plan.end.distanceFromStart,
        (plan.end.altitude + cruiseAltitude) / 2,
      );
      sequence.addCheckpointFromStep(
        this.predictStep(plan.end, cruiseAltitude, headwind),
        VerticalCheckpointReason.TopOfDescent,
        ProfilePhase.Descent,
      );
    }

    const descentSeconds = landing.secondsFromPresent - sequence.lastCheckpoint.secondsFromPresent;
    return {
      cabinDescent,
      maxRate,
      meanRate: meanCabinDescentRate(cabinDescent, descentSeconds),
      descentSeconds,
      descentDistance: landing.distanceFromStart - sequence.lastCheckpoint.distanceFromStart,
    };
  }
}
