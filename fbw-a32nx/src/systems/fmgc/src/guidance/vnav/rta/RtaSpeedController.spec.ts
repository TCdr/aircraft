// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { RTA_SPEED_DEAD_BAND_SECONDS, rtaBiasRange, RtaSpeedController } from './RtaSpeedController';
import { TimeConstraintType } from './TimeConstraint';

const SPAN_UP = 0.03;
const SPAN_DOWN = 0.15;

/**
 * A flight of `econSeconds` at ECON speed, of which only `affectedShare` follows the managed speed (the rest is flown
 * below the speed limit, in the approach...). The speed is not linear in the bias at the top (the RTA Mach reaches the
 * maximum speed of a lower cruise level earlier).
 */
function flightTime(econSeconds: number, bias: number, affectedShare = 0.85): number {
  const ratio = bias >= 0 ? 1 + SPAN_UP * Math.sqrt(bias) : 1 + SPAN_DOWN * bias;
  return econSeconds * (1 - affectedShare) + (econSeconds * affectedShare) / ratio;
}

/** Runs the loop with a new prediction after each step, @returns the steps taken and the final time error */
function runLoop(
  controller: RtaSpeedController,
  type: TimeConstraintType,
  econSeconds: number,
  requiredSeconds: number,
  maxSteps = 30,
): { steps: number; timeError: number } {
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const time = flightTime(econSeconds, controller.bias);
    const changed = controller.update({
      timeError: time - requiredSeconds,
      type,
      secondsToWaypoint: time,
      speedSpanUp: SPAN_UP,
      speedSpanDown: SPAN_DOWN,
    });
    if (!changed) {
      break;
    }
  }
  return { steps, timeError: flightTime(econSeconds, controller.bias) - requiredSeconds };
}

describe('RtaSpeedController', () => {
  it('speeds up to meet an RTA 2 min earlier than the ECON ETA after 2 h, within a few predictions', () => {
    const controller = new RtaSpeedController();
    const result = runLoop(controller, TimeConstraintType.At, 7200, 7080);
    expect(Math.abs(result.timeError)).toBeLessThanOrEqual(RTA_SPEED_DEAD_BAND_SECONDS);
    expect(result.steps).toBeLessThanOrEqual(8);
    expect(controller.bias).toBeGreaterThan(0);
    expect(controller.isAdjusting).toBe(false);
  });

  it('slows down to meet an RTA 10 min later than the ECON ETA', () => {
    const controller = new RtaSpeedController();
    const result = runLoop(controller, TimeConstraintType.At, 7200, 7800);
    expect(Math.abs(result.timeError)).toBeLessThanOrEqual(RTA_SPEED_DEAD_BAND_SECONDS);
    expect(result.steps).toBeLessThanOrEqual(8);
    expect(controller.bias).toBeLessThan(0);
  });

  it('stays at the highest speed when the RTA cannot be met', () => {
    const controller = new RtaSpeedController();
    const result = runLoop(controller, TimeConstraintType.At, 7200, 6000);
    expect(controller.bias).toBe(1);
    expect(result.timeError).toBeGreaterThan(RTA_SPEED_DEAD_BAND_SECONDS);
    expect(controller.isAdjusting).toBe(false);
  });

  it('keeps the ECON speed for AT OR BEFORE when the aircraft is early', () => {
    const controller = new RtaSpeedController();
    const result = runLoop(controller, TimeConstraintType.AtOrBefore, 7200, 7800);
    expect(result.steps).toBe(0);
    expect(controller.bias).toBe(0);
  });

  it('keeps the ECON speed for AT OR AFTER when the aircraft is late', () => {
    const controller = new RtaSpeedController();
    runLoop(controller, TimeConstraintType.AtOrAfter, 7200, 7000);
    expect(controller.bias).toBe(0);
  });

  it('goes back toward ECON when an AT OR BEFORE RTA is changed to a later time', () => {
    const controller = new RtaSpeedController();
    runLoop(controller, TimeConstraintType.AtOrBefore, 7200, 7100);
    expect(controller.bias).toBeGreaterThan(0);
    controller.forgetSamples();
    runLoop(controller, TimeConstraintType.AtOrBefore, 7200, 7400);
    expect(controller.bias).toBe(0);
  });

  it('brings the bias into the range of a new constraint type', () => {
    const controller = new RtaSpeedController();
    runLoop(controller, TimeConstraintType.At, 7200, 7800);
    expect(controller.bias).toBeLessThan(0);
    expect(
      controller.update({
        timeError: 0,
        type: TimeConstraintType.AtOrBefore,
        secondsToWaypoint: 7800,
        speedSpanUp: SPAN_UP,
        speedSpanDown: SPAN_DOWN,
      }),
    ).toBe(true);
    expect(controller.bias).toBe(0);
  });

  it('does not move within the dead band', () => {
    const controller = new RtaSpeedController();
    expect(
      controller.update({
        timeError: RTA_SPEED_DEAD_BAND_SECONDS,
        type: TimeConstraintType.At,
        secondsToWaypoint: 3600,
        speedSpanUp: SPAN_UP,
        speedSpanDown: SPAN_DOWN,
      }),
    ).toBe(false);
    expect(controller.bias).toBe(0);
  });

  it('returns to ECON on reset', () => {
    const controller = new RtaSpeedController();
    runLoop(controller, TimeConstraintType.At, 7200, 7080);
    controller.reset();
    expect(controller.bias).toBe(0);
    expect(controller.isAdjusting).toBe(false);
  });
});

describe('RtaSpeedController at the resolution of the speed', () => {
  it('settles instead of hunting when the predicted time changes in steps coarser than the dead band', () => {
    const controller = new RtaSpeedController();
    // predictions in 20 s steps: no speed gives a time error within the dead band
    const quantizedTime = (bias: number) => Math.round(flightTime(28_800, bias) / 20) * 20 + 7;
    let steps = 0;
    for (; steps < 40; steps++) {
      const time = quantizedTime(controller.bias);
      const changed = controller.update({
        timeError: time - 28_600,
        type: TimeConstraintType.At,
        secondsToWaypoint: time,
        speedSpanUp: SPAN_UP,
        speedSpanDown: SPAN_DOWN,
      });
      if (!changed) {
        break;
      }
    }
    expect(steps).toBeLessThan(40);
    expect(controller.isAdjusting).toBe(false);
    expect(Math.abs(quantizedTime(controller.bias) - 28_600)).toBeLessThanOrEqual(20);
  });

  it('takes a quarter of the range as first step while the speed range is unknown', () => {
    const controller = new RtaSpeedController();
    controller.update({
      timeError: 300,
      type: TimeConstraintType.At,
      secondsToWaypoint: 3600,
      speedSpanUp: 0,
      speedSpanDown: 0,
    });
    expect(controller.bias).toBe(0.25);
  });
});

describe('rtaBiasRange', () => {
  it('AT both ways, AT OR BEFORE only faster, AT OR AFTER only slower', () => {
    expect(rtaBiasRange(TimeConstraintType.At)).toEqual({ min: -1, max: 1 });
    expect(rtaBiasRange(TimeConstraintType.AtOrBefore)).toEqual({ min: 0, max: 1 });
    expect(rtaBiasRange(TimeConstraintType.AtOrAfter)).toEqual({ min: -1, max: 0 });
  });
});
