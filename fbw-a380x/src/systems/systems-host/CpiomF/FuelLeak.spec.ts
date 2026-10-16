// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  FEED_TANK_LEAK_RATE_KG_PER_HOUR,
  FUEL_LEAK_DET_FAULT_VAR,
  FUEL_LEAK_DETECTED_VAR,
  FuelLeak,
  FuelLeakDetection,
  FuelLeakDetectionInputs,
  leakedGallons,
} from './FuelLeak';

const KG_PER_LB = 0.45359237;
const POUNDS_PER_GALLON = 6.7;

/** A flight with the four engines running: 200 t of fuel, 10 t/h burned (fuel used = fuel burned) */
class Flight {
  public fobKg = 200_000;

  public fuelUsedKg = 0;

  public onGround = false;

  public allEnginesRunning = true;

  public jettisonInProgress = false;

  public readonly detection = new FuelLeakDetection();

  /**
   * Flies for some minutes, one update a second.
   * @param minutes the time flown
   * @param leakKgPerHour the fuel lost by a leak, not in the fuel used
   * @param burnKgPerHour the fuel burned by the engines
   */
  public fly(minutes: number, leakKgPerHour = 0, burnKgPerHour = 10_000): this {
    for (let s = 0; s < minutes * 60; s++) {
      this.fobKg -= (burnKgPerHour + leakKgPerHour) / 3600;
      this.fuelUsedKg += burnKgPerHour / 3600;
      this.detection.update(this.inputs(), 1);
    }
    return this;
  }

  public inputs(): FuelLeakDetectionInputs {
    return {
      onGround: this.onGround,
      allEnginesRunning: this.allEnginesRunning,
      jettisonInProgress: this.jettisonInProgress,
      fobKg: this.fobKg,
      fuelUsedKg: this.fuelUsedKg,
    };
  }
}

describe('FQMS fuel leak detection (A380 FCOM DSC-28-40 FUEL LEAK DETECTION)', () => {
  it('has the FCOM thresholds: 15 450 lb for the slow detection, 4 400 lb over 30 min for the fast one', () => {
    expect(FuelLeakDetection.SLOW_LEAK_THRESHOLD_KG).toBeCloseTo(15_450 * KG_PER_LB, 6);
    expect(FuelLeakDetection.FAST_LEAK_THRESHOLD_KG).toBeCloseTo(4_400 * KG_PER_LB, 6);
    expect(FuelLeakDetection.FAST_LEAK_WINDOW_S).toBe(1800);
  });

  it('detects nothing in a normal flight', () => {
    const flight = new Flight().fly(600);
    expect(flight.detection.isLeakDetected()).toBe(false);
    expect(flight.detection.isDetectionFault()).toBe(false);
  });

  it('detects a fast leak (6 t/h) once more than 4 400 lb were lost within the last 30 min', () => {
    // 1 995.8 kg at 6 000 kg/h: 19.96 min
    const flight = new Flight().fly(19.5, 6_000);
    expect(flight.detection.isLeakDetected()).toBe(false);
    flight.fly(1, 6_000);
    expect(flight.detection.isLeakDetected()).toBe(true);
  });

  it('detects a slow leak (2 t/h, never 4 400 lb within 30 min) once the FOB + FU is 15 450 lb below the BLOCK', () => {
    // 7 008 kg at 2 000 kg/h: 210.2 min. Within 30 min the leak loses 1 000 kg only.
    const flight = new Flight().fly(209, 2_000);
    expect(flight.detection.isLeakDetected()).toBe(false);
    flight.fly(2, 2_000);
    expect(flight.detection.isLeakDetected()).toBe(true);
  });

  it('keeps FUEL LEAK DETECTED until the end of the flight, and starts again at the next flight', () => {
    const flight = new Flight().fly(25, 6_000).fly(60);
    expect(flight.detection.isLeakDetected()).toBe(true);

    flight.onGround = true;
    flight.allEnginesRunning = false;
    flight.fly(1, 0, 0);
    expect(flight.detection.isLeakDetected()).toBe(false);
  });

  it('is inhibited by a fuel jettison, with FUEL LEAK DET FAULT, and does not take the jettison for a leak', () => {
    const flight = new Flight().fly(10);
    flight.jettisonInProgress = true;
    flight.fly(10, 30_000);
    expect(flight.detection.isDetectionFault()).toBe(true);
    expect(flight.detection.isLeakDetected()).toBe(false);

    flight.jettisonInProgress = false;
    flight.fly(60);
    expect(flight.detection.isDetectionFault()).toBe(false);
    expect(flight.detection.isLeakDetected()).toBe(false);
  });

  it('loses the slow detection until the end of the flight after an inhibition, the fast one recovers', () => {
    const slow = new Flight().fly(10);
    slow.allEnginesRunning = false;
    slow.fly(1, 0, 0);
    expect(slow.detection.isDetectionFault()).toBe(true);
    slow.allEnginesRunning = true;
    slow.fly(300, 2_000);
    expect(slow.detection.isLeakDetected()).toBe(false);

    const fast = new Flight().fly(10);
    fast.allEnginesRunning = false;
    fast.fly(1, 0, 0);
    fast.allEnginesRunning = true;
    fast.fly(25, 6_000);
    expect(fast.detection.isLeakDetected()).toBe(true);
  });

  it('gives no fault and detects nothing on the ground before the four engines run', () => {
    const flight = new Flight();
    flight.onGround = true;
    flight.allEnginesRunning = false;
    flight.fly(60, 6_000, 0);
    expect(flight.detection.isLeakDetected()).toBe(false);
    expect(flight.detection.isDetectionFault()).toBe(false);
  });
});

describe('feed tank leak failures', () => {
  it('leaks 6 000 kg/h, never more than the tank holds', () => {
    expect(FEED_TANK_LEAK_RATE_KG_PER_HOUR).toBe(6_000);
    const gallonsPerHour = 6_000 / KG_PER_LB / POUNDS_PER_GALLON;
    expect(leakedGallons(5000, POUNDS_PER_GALLON, 3_600_000)).toBeCloseTo(gallonsPerHour, 6);
    expect(leakedGallons(10, POUNDS_PER_GALLON, 3_600_000)).toBe(10);
    expect(leakedGallons(5000, 0, 1000)).toBe(0);
  });

  /** The sim variables of a test */
  const simVars = new Map<string, number | boolean>();
  const failures = new Set<number>();
  const failuresConsumer = { isActive: (failure: number) => failures.has(failure) } as unknown as FailuresConsumer;

  beforeEach(() => {
    simVars.clear();
    failures.clear();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
      simVars.set(name, value);
      return Promise.resolve();
    });
    simVars.set('FUEL WEIGHT PER GALLON', POUNDS_PER_GALLON);
    for (const tank of [2, 5, 6, 9]) {
      simVars.set(`FUELSYSTEM TANK QUANTITY:${tank}`, 5000);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takes the leaked fuel out of the failed feed tank only', () => {
    const leak = new FuelLeak({ deltaTime: 1000 }, failuresConsumer);
    failures.add(A380Failure.FuelFeedTank3Leak);
    for (let s = 0; s < 3600; s++) {
      leak.onUpdate();
    }
    const gallonsPerHour = 6_000 / KG_PER_LB / POUNDS_PER_GALLON;
    expect(simVars.get('FUELSYSTEM TANK QUANTITY:6')).toBeCloseTo(5000 - gallonsPerHour, 3);
    for (const tank of [2, 5, 9]) {
      expect(simVars.get(`FUELSYSTEM TANK QUANTITY:${tank}`)).toBe(5000);
    }
  });

  it('gives the FWS the leak detection of the FQMS', () => {
    const leak = new FuelLeak({ deltaTime: 1000 }, failuresConsumer);
    simVars.set('L:A32NX_TOTAL_FUEL_QUANTITY', 100_000);
    simVars.set('L:A380X_FUEL_JETTISON_IN_PROGRESS', 1);
    for (let engine = 1; engine <= 4; engine++) {
      simVars.set(`L:A32NX_ENGINE_STATE:${engine}`, 1);
    }
    leak.onUpdate();
    expect(simVars.get(FUEL_LEAK_DET_FAULT_VAR)).toBe(true);
    expect(simVars.get(FUEL_LEAK_DETECTED_VAR)).toBe(false);
  });
});
