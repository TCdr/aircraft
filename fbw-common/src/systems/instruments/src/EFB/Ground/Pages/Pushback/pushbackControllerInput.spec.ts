// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { controllerHeadingFactor, controllerSpeedFactor, isPushbackActive } from './pushbackControllerInput';

describe('the pushback steered from the flyPad root', () => {
  it('moves the aircraft only with the system on, the tug attached and the nose wheel steering disconnected', () => {
    expect(isPushbackActive(true, true, true)).toBe(true);
    expect(isPushbackActive(false, true, true)).toBe(false);
    // the tug on its way (attached without NW STRG DISC yet, or released with it still shown)
    expect(isPushbackActive(true, true, false)).toBe(false);
    expect(isPushbackActive(true, false, true)).toBe(false);
    expect(isPushbackActive(true, false, false)).toBe(false);
  });

  it('turns the tug with the rudder pedals, with a deadzone', () => {
    expect(controllerHeadingFactor(0.02)).toBe(0);
    expect(controllerHeadingFactor(-0.04)).toBe(0);
    expect(controllerHeadingFactor(50)).toBeCloseTo(0.5, 9);
    expect(controllerHeadingFactor(-100)).toBeCloseTo(-1, 9);
  });

  it('pushes back with the sidestick pulled, with a deadzone', () => {
    expect(controllerSpeedFactor(0.03)).toBe(0);
    expect(controllerSpeedFactor(-0.6)).toBeCloseTo(0.6, 9);
    expect(controllerSpeedFactor(0.5)).toBeCloseTo(-0.5, 9);
  });
});
