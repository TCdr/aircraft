// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { TimeConstraintType } from './TimeConstraint';

/**
 * Design choice: the speed is not changed while the ETA is within 6 s of the RTA, well inside the 30 s "made"
 * criteria, so that the managed speed target does not hunt.
 */
export const RTA_SPEED_DEAD_BAND_SECONDS = 6;

/** Smallest change of the speed bias, so that a step always changes the predictions */
const MIN_BIAS_STEP = 0.002;

/**
 * Design choice: a regula falsi step stays in the middle 80 % of the bracket, so that the search also converges when the
 * time error is far from linear in the speed (e.g. the speed reaches a limit in one phase).
 */
const MIN_BRACKET_FRACTION = 0.1;

interface BiasSample {
  bias: number;
  timeError: number;
}

/**
 * The speed bias range of a constraint type. AT may speed up or slow down; AT OR BEFORE only speeds up (an early
 * arrival at ECON speed meets it); AT OR AFTER only slows down.
 */
export function rtaBiasRange(type: TimeConstraintType): { min: number; max: number } {
  switch (type) {
    case TimeConstraintType.AtOrBefore:
      return { min: 0, max: 1 };
    case TimeConstraintType.AtOrAfter:
      return { min: -1, max: 0 };
    default:
      return { min: -1, max: 1 };
  }
}

export interface RtaSpeedControlInput {
  /** ETA - RTA, in seconds, predicted with the current speed bias */
  timeError: number;
  type: TimeConstraintType;
  /** predicted flight time to the RTA waypoint, in seconds */
  secondsToWaypoint: number;
  /** speed change of the full bias up and down, as fractions of the ECON speed (see rtaSpeedSpan) */
  speedSpanUp: number;
  speedSpanDown: number;
}

/**
 * The RTA speed loop: it moves the managed speed between its lowest and highest RTA speed (bias -1 to +1, 0 = ECON) to
 * bring the predicted time at the RTA waypoint onto the RTA. Each step needs a new prediction made with the last bias:
 * the first step uses the sensitivity of the flight time to the speed, the next ones a regula falsi between a late and
 * an early prediction.
 */
export class RtaSpeedController {
  private currentBias = 0;

  private adjusting = false;

  /** a prediction made with a speed too low (late) */
  private lateSample: BiasSample | null = null;

  /** a prediction made with a speed too high (early) */
  private earlySample: BiasSample | null = null;

  /** speed bias of the managed speeds, from -1 (lowest RTA speed) through 0 (ECON) to +1 (highest RTA speed) */
  get bias(): number {
    return this.currentBias;
  }

  /** whether the loop is changing the speed to meet the RTA (until the time error is in the dead band or the speed at its limit) */
  get isAdjusting(): boolean {
    return this.adjusting;
  }

  /** Back to ECON speed, e.g. when the RTA is deleted or not taken into account */
  reset(): void {
    this.currentBias = 0;
    this.adjusting = false;
    this.forgetSamples();
  }

  /** Forget the previous predictions (the RTA or the flight plan changed), keep the speed */
  forgetSamples(): void {
    this.lateSample = null;
    this.earlySample = null;
  }

  /**
   * One step of the loop, with a prediction made with the current bias.
   * @returns whether the bias changed (a new managed speed target)
   */
  update(input: RtaSpeedControlInput): boolean {
    const range = rtaBiasRange(input.type);
    if (this.currentBias < range.min || this.currentBias > range.max) {
      this.forgetSamples();
      return this.setBias(Math.min(range.max, Math.max(range.min, this.currentBias)));
    }

    const error = input.timeError;
    const late = error > 0;
    const atLimit = late ? this.currentBias >= range.max : this.currentBias <= range.min;
    if (Math.abs(error) <= RTA_SPEED_DEAD_BAND_SECONDS || atLimit) {
      this.adjusting = false;
      this.forgetSamples();
      return false;
    }

    const sample = { bias: this.currentBias, timeError: error };
    if (late) {
      this.lateSample = sample;
    } else {
      this.earlySample = sample;
    }
    // A late prediction must have a lower bias than an early one; otherwise the conditions changed: keep the newest
    if (this.lateSample && this.earlySample && this.lateSample.bias >= this.earlySample.bias) {
      if (late) {
        this.earlySample = null;
      } else {
        this.lateSample = null;
      }
    }

    if (this.lateSample && this.earlySample && this.earlySample.bias - this.lateSample.bias <= 2 * MIN_BIAS_STEP) {
      // The speed cannot be set finer: stay on the closer of the two predictions instead of hunting between them
      const closer =
        Math.abs(this.lateSample.timeError) <= Math.abs(this.earlySample.timeError)
          ? this.lateSample
          : this.earlySample;
      const changed = closer.bias !== this.currentBias;
      this.currentBias = closer.bias;
      this.adjusting = false;
      return changed;
    }

    let next: number;
    if (this.lateSample && this.earlySample) {
      const fraction = this.lateSample.timeError / (this.lateSample.timeError - this.earlySample.timeError);
      const boundedFraction = Math.min(1 - MIN_BRACKET_FRACTION, Math.max(MIN_BRACKET_FRACTION, fraction));
      next = this.lateSample.bias + boundedFraction * (this.earlySample.bias - this.lateSample.bias);
    } else {
      next = this.currentBias + this.firstStep(input);
    }

    if (Math.abs(next - this.currentBias) < MIN_BIAS_STEP) {
      next = this.currentBias + (late ? MIN_BIAS_STEP : -MIN_BIAS_STEP);
    }
    return this.setBias(Math.min(range.max, Math.max(range.min, next)));
  }

  /**
   * The bias step that would remove the time error if the flight time were inversely proportional to the speed: a
   * speed ratio r changes the flight time T into T / r.
   */
  private firstStep(input: RtaSpeedControlInput): number {
    const late = input.timeError > 0;
    const span = late ? input.speedSpanUp : input.speedSpanDown;
    const time = input.secondsToWaypoint;
    if (!(span > 0) || !(time > 0)) {
      // Design choice: without the speed range yet, a quarter of it, so that the speed does not jump to its limit
      return late ? 0.25 : -0.25;
    }
    // Time change of the full bias: T - T / (1 + span) to speed up, T / (1 - span) - T to slow down
    const fullBiasTimeChange = late ? time - time / (1 + span) : time / Math.max(0.05, 1 - span) - time;
    const step = Math.abs(input.timeError) / fullBiasTimeChange;
    return late ? step : -step;
  }

  private setBias(bias: number): boolean {
    if (bias === this.currentBias) {
      this.adjusting = false;
      return false;
    }
    this.currentBias = bias;
    this.adjusting = true;
    return true;
  }
}
