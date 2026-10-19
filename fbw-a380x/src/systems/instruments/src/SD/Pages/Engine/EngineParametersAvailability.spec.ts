// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EngineParametersInputs, areEngineParametersShown, areVibrationsShown } from './EngineParametersAvailability';

describe('SD ENG page engine parameters', () => {
  const powered: EngineParametersInputs = {
    fadecPowered: true,
    fadecNetworkLost: false,
  };

  it('shows the parameters of a powered FADEC', () => {
    expect(areEngineParametersShown(powered)).toBe(true);
  });

  /* A380 FCOM ENG FADEC FAULT (a380_fcom.txt l.171563-171564): "The ENG 1(2)(3)(4) parameters on the ENG SD page are lost" */
  it('loses the parameters of a FADEC that cannot communicate via the avionics networks', () => {
    expect(areEngineParametersShown({ ...powered, fadecNetworkLost: true })).toBe(false);
  });

  it('loses the parameters of an unpowered FADEC', () => {
    expect(areEngineParametersShown({ ...powered, fadecPowered: false })).toBe(false);
  });

  it('loses the vibrations without the supply of the engine monitoring unit', () => {
    expect(areVibrationsShown(true, true)).toBe(true);
    expect(areVibrationsShown(true, false)).toBe(false);
    expect(areVibrationsShown(false, true)).toBe(false);
  });
});
