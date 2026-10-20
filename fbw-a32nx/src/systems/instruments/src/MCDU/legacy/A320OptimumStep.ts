// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { ComputationMemo, KG_PER_LB, roundToStep } from '@fmgc/guidance/vnav/EconSpeeds';
import { FlightModel } from '@fmgc/guidance/vnav/FlightModel';
import {
  computeOptimumStep,
  OptimumStep,
  OptimumStepConditions,
  optimumStepInputs,
  OptimumStepModel,
  OptimumStepTarget,
  StepProfileContext,
} from '@fmgc/guidance/vnav/OptimumStep';
import { recMaxFlightLevel } from './RecMaxFlightLevel';

const tonnesOf = (pounds: number) => (pounds * KG_PER_LB) / 1000;

/**
 * The A320 model of the optimum step search: the ECON cruise of the FMS performance model, green dot, and the REC MAX
 * at the weight of the step point (ISA deviation of the conditions).
 */
function a320OptimumStepModel(isaDeviation: number): OptimumStepModel {
  return {
    config: A320AircraftConfig,
    aircraft: A320EconParameters,
    minSpeedAt: (altitude, weight) => FlightModel.getGreenDotSpeedCas(altitude, weight * KG_PER_LB),
    maxAltitudeAt: (weight) => {
      const flightLevel = recMaxFlightLevel(isaDeviation, tonnesOf(weight));
      return flightLevel !== null ? flightLevel * 100 : null;
    },
  };
}

/**
 * The optimum step point of the STEP ALTS page for a step of the flight plan or an entered step altitude.
 * @returns the optimum, or null when no step point saves more than 100 kg or 1 min
 */
function a320OptimumStep(
  context: StepProfileContext,
  target: OptimumStepTarget,
  conditions: OptimumStepConditions,
): OptimumStep | null {
  return computeOptimumStep(
    a320OptimumStepModel(conditions.isaDeviation),
    optimumStepInputs(context, target, conditions),
  );
}

/** The page refreshes every second: the search is redone only when a rounded input changes */
export class A320OptimumStepCache {
  private readonly memo = new ComputationMemo<OptimumStep | null>();

  get(context: StepProfileContext, target: OptimumStepTarget, conditions: OptimumStepConditions): OptimumStep | null {
    return this.memo.get(
      [
        conditions.costIndex,
        roundToStep(conditions.zeroFuelWeight, 0.1),
        roundToStep(conditions.isaDeviation, 1),
        roundToStep(conditions.headwind, 5),
        conditions.tropopause,
        roundToStep(context.cruiseStart, 10),
        roundToStep(context.topOfDescent, 10),
        roundToStep(context.cruiseStartFuel, 200),
        target.fromAltitude,
        target.toAltitude,
        roundToStep(target.currentStepDistance, 10),
        roundToStep(target.nextStepDistance, 10),
      ],
      () => a320OptimumStep(context, target, conditions),
    );
  }
}

/** What the STEP ALTS page shows of the optimum step point */
export interface A320OptimumStepState {
  target: OptimumStepTarget;
  optimum: OptimumStep | null;
}

/**
 * The OPT STEP line (5L/5R) and its label. With a time constraint in the flight plan the optimum step point is frozen.
 * @param hasSteps the flight plan has a step
 * @param optimumStep the optimum step point, null when there is nothing to search
 * @param rtaExists a time constraint exists in the flight plan
 * @param formatFuel the fuel saving in thousands of the crew's weight unit
 */
export function formatOptStepLine(
  hasSteps: boolean,
  optimumStep: A320OptimumStepState | null,
  rtaExists: boolean,
  formatFuel: (pounds: number) => string,
): { label: string[]; data: string[] } {
  if (rtaExists) {
    return { label: [''], data: ['(OPT) FROZEN: RTA EXISTS'] };
  }
  if (!optimumStep) {
    return hasSteps
      ? { label: [''], data: [''] }
      : { label: [''], data: ['{small}OPT STEP:{end}', '{small}ENTER ALT ONLY{end}'] };
  }
  const { target, optimum } = optimumStep;
  if (!optimum) {
    // Once inserted, the optimum step shows no savings
    return { label: [''], data: [target.isOptimum ? '' : 'NO OPTIMAL STEP'] };
  }
  const timeSaving = Math.round(optimum.timeSaving / 60);
  return {
    label: ['', 'TIME/FUEL'],
    data: [
      `{cyan}*(OPT)\xa0TO\xa0FL${Math.round(target.toAltitude / 100)}{end}`,
      `{green}${timeSaving}/${formatFuel(optimum.fuelSaving)}{end}`,
    ],
  };
}
