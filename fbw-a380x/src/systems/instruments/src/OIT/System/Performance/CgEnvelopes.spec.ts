// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import JSON5 from 'json5';
import { describe, expect, it } from 'vitest';
import { A380842TakeoffPerformanceCalculator } from '@shared/performance/a380x_takeoff';
import {
  A380_CG_LIMITS,
  LANDING_ENVELOPE,
  TAKEOFF_ENVELOPE,
  ZERO_FUEL_ENVELOPE,
  envelopeCgLimits,
} from './CgEnvelopes';

const AIRFRAME_FILE = resolve(
  __dirname,
  '../../../../../../base/flybywire-aircraft-a380-842/config/a380x/a380-842/airframe.json5',
);

describe('CG envelopes', () => {
  it('equal the performance envelopes of the airframe configuration', () => {
    const envelope = JSON5.parse(readFileSync(AIRFRAME_FILE, 'utf-8')).designLimits.performanceEnvelope;
    // The configuration closes the zero fuel outline with a repeated first vertex
    expect(ZERO_FUEL_ENVELOPE.vertices).toEqual(envelope.mzfw.slice(0, 5));
    expect(LANDING_ENVELOPE.vertices).toEqual(envelope.mlw);
    expect(TAKEOFF_ENVELOPE.vertices).toEqual(envelope.mtow);
  });

  it('gives the forward and aft limits of each envelope at a weight', () => {
    // Halfway up the sloped part of the takeoff envelope
    expect(envelopeCgLimits(TAKEOFF_ENVELOPE, 442_500)).toEqual({ forward: 32.375, aft: 43 });
    expect(envelopeCgLimits(LANDING_ENVELOPE, 300_000)).toEqual({ forward: 29, aft: 43 });
    expect(envelopeCgLimits(LANDING_ENVELOPE, 390_000).forward).toBeCloseTo(30.625, 9);
    // The zero fuel envelope leans aft below its weight limit
    expect(envelopeCgLimits(ZERO_FUEL_ENVELOPE, 365_000).forward).toBe(31.5);
    expect(envelopeCgLimits(ZERO_FUEL_ENVELOPE, 362_500).forward).toBeCloseTo(30.25, 9);
  });

  it('keeps the limits of the nearest edge for a weight outside the envelope', () => {
    expect(envelopeCgLimits(TAKEOFF_ENVELOPE, 600_000)).toEqual(envelopeCgLimits(TAKEOFF_ENVELOPE, 510_000));
    expect(envelopeCgLimits(TAKEOFF_ENVELOPE, 200_000)).toEqual({ forward: 29, aft: 43 });
  });

  it('judges the ZFW, TOW and LW CG by their own envelope', () => {
    // 30 % MAC at 390 t: within the takeoff limits, forward of the landing limit
    expect(A380_CG_LIMITS.takeoff(30, 390_000)).toBe(true);
    expect(A380_CG_LIMITS.landing(30, 390_000)).toBe(false);
    // 30 % MAC at 364 t: forward of the zero fuel limit that leans aft near the maximum weight
    expect(A380_CG_LIMITS.takeoff(30, 364_000)).toBe(true);
    expect(A380_CG_LIMITS.zeroFuel(30, 364_000)).toBe(false);
    expect(A380_CG_LIMITS.zeroFuel(36, 364_000)).toBe(true);
    expect(A380_CG_LIMITS.zeroFuel(43.5, 330_000)).toBe(false);
  });

  it('keeps the takeoff check equal to the CG table of the takeoff calculator', () => {
    const calculator = new A380842TakeoffPerformanceCalculator();
    for (let weight = 262_000; weight <= 520_000; weight += 7_000) {
      for (let cg = 25.1; cg <= 46; cg += 0.37) {
        expect(A380_CG_LIMITS.takeoff(cg, weight), `${cg} % at ${weight} kg`).toBe(
          calculator.isCgWithinLimits(cg, weight),
        );
      }
    }
  });
});
