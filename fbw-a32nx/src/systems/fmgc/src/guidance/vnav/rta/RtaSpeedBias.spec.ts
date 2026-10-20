// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EconSpeedSet } from '@fmgc/guidance/vnav/EconSpeeds';
import { applyRtaSpeedBias, RtaSpeedEnvelope, rtaSpeedSpan } from './RtaSpeedBias';

const econ: EconSpeedSet = {
  climbSpeed: 300,
  climbMach: 0.78,
  cruiseSpeed: 280,
  cruiseMach: 0.78,
  descentSpeed: 290,
  descentMach: 0.78,
};

const envelope: RtaSpeedEnvelope = {
  climbMinSpeed: 220,
  cruiseMinSpeed: 230,
  descentMinSpeed: 210,
  cruiseMinMach: 0.66,
  maxSpeed: 340,
  maxMach: 0.8,
};

describe('applyRtaSpeedBias', () => {
  it('keeps the ECON speeds at bias 0', () => {
    expect(applyRtaSpeedBias(econ, 0, envelope)).toBe(econ);
  });

  it('gives the highest RTA speeds (VMO - 10 / MMO - 0.02) at bias +1', () => {
    expect(applyRtaSpeedBias(econ, 1, envelope)).toEqual({
      climbSpeed: 340,
      climbMach: 0.8,
      cruiseSpeed: 340,
      cruiseMach: 0.8,
      descentSpeed: 340,
      descentMach: 0.8,
    });
  });

  it('gives green dot at bias -1', () => {
    const slowest = applyRtaSpeedBias(econ, -1, envelope);
    expect(slowest.climbSpeed).toBe(220);
    expect(slowest.cruiseSpeed).toBe(230);
    expect(slowest.descentSpeed).toBe(210);
    expect(slowest.cruiseMach).toBe(0.66);
  });

  it('moves the Mach continuously and monotonically with the bias', () => {
    const half = applyRtaSpeedBias(econ, 0.25, envelope);
    expect(half.cruiseMach).toBeCloseTo(0.785, 9);
    expect(half.climbSpeed).toBe(310);
    const a = applyRtaSpeedBias(econ, -0.3, envelope).cruiseMach;
    const b = applyRtaSpeedBias(econ, -0.2, envelope).cruiseMach;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(econ.cruiseMach);
  });

  it('clamps the bias to [-1, 1]', () => {
    expect(applyRtaSpeedBias(econ, 3, envelope)).toEqual(applyRtaSpeedBias(econ, 1, envelope));
  });
});

describe('rtaSpeedSpan', () => {
  it('is the relative Mach change of the full bias up and down', () => {
    const span = rtaSpeedSpan(econ, envelope);
    expect(span.up).toBeCloseTo(0.02 / 0.78, 6);
    expect(span.down).toBeCloseTo(0.12 / 0.78, 6);
  });
});
