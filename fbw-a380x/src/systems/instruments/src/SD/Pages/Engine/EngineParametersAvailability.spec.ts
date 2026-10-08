// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EngineParametersInputs, areEngineParametersShown } from './EngineParametersAvailability';

describe('SD ENG page engine parameters', () => {
  const running: EngineParametersInputs = {
    ignition: false,
    anyEngineRunning: true,
    fadecManuallyPowered: false,
    engineFirePbReleased: false,
    fadecNetworkLost: false,
  };

  it('shows the parameters of a powered FADEC', () => {
    expect(areEngineParametersShown(running)).toBe(true);
  });

  /* A380 FCOM ENG FADEC FAULT (a380_fcom.txt l.171563-171564): "The ENG 1(2)(3)(4) parameters on the ENG SD page are lost" */
  it('loses the parameters of a FADEC that cannot communicate via the avionics networks', () => {
    expect(areEngineParametersShown({ ...running, fadecNetworkLost: true })).toBe(false);
  });

  it('loses the parameters with the FIRE pb released or the FADEC unpowered', () => {
    expect(areEngineParametersShown({ ...running, engineFirePbReleased: true })).toBe(false);
    expect(areEngineParametersShown({ ...running, anyEngineRunning: false })).toBe(false);
    expect(areEngineParametersShown({ ...running, anyEngineRunning: false, fadecManuallyPowered: true })).toBe(true);
  });
});
