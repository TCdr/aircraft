// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  EngineAttentionGetterInputs,
  hasOtherAmberOrRedEngineIndication,
  isReverserIndicationAmber,
} from './EngineAttentionGetter';

/** A running engine with normal oil indications, no CLOGGED, no amber REV */
const normal: EngineAttentionGetterInputs = {
  engineRunning: true,
  oilPressurePsi: 120,
  oilTemperatureCelsius: 120,
  fuelFilterClogged: false,
  oilFilterClogged: false,
  reverserIndicationAmber: false,
};

/* A380 FCOM DSC-70-90 ATTENTION GETTING BOX, a380_fcom.txt l.112876-112904 (FCOM audit T2-44, row B17) */
describe('engine amber attention getting box: the other amber and red indications', () => {
  it('no box with normal indications', () => {
    expect(hasOtherAmberOrRedEngineIndication(normal)).toBe(false);
  });

  it('the oil pressure in red at or below 25 PSI (l.113385)', () => {
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, oilPressurePsi: 25 })).toBe(true);
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, oilPressurePsi: 26 })).toBe(false);
  });

  it('the oil temperature in amber above 177 °C (l.113371)', () => {
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, oilTemperatureCelsius: 178 })).toBe(true);
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, oilTemperatureCelsius: 177 })).toBe(false);
  });

  it('the amber CLOGGED of the fuel filter and of the oil filter', () => {
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, fuelFilterClogged: true })).toBe(true);
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, oilFilterClogged: true })).toBe(true);
  });

  it('not the oil indications of a stopped engine (0 PSI)', () => {
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, engineRunning: false, oilPressurePsi: 0 })).toBe(false);
  });

  it('the amber REV 2(3)', () => {
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, reverserIndicationAmber: true })).toBe(true);
  });
});

/* A380 FCOM DSC-70-90 REV 2(3) INDICATIONS, a380_fcom.txt l.113134-113142 */
describe('amber REV 2(3) indication', () => {
  it('on ground: the lever in the reverse range and the reverse mode not available', () => {
    expect(isReverserIndicationAmber(true, -10, true, false)).toBe(true);
    // a normal deployment: the reverser is available
    expect(isReverserIndicationAmber(true, -10, false, false)).toBe(false);
    // the reverser inoperative with the lever forward: no REV indication
    expect(isReverserIndicationAmber(true, 0, true, false)).toBe(false);
  });

  it('in flight: the reverser unlocked', () => {
    expect(isReverserIndicationAmber(false, 0, false, true)).toBe(true);
    expect(isReverserIndicationAmber(false, 0, true, false)).toBe(false);
  });
});

describe('FwsCore wiring of the attention getting box', () => {
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

  it('adds the other indications to the primary abnormal parameters of each engine', () => {
    expect(core).toContain('const otherIndicationAbnormal = hasOtherAmberOrRedEngineIndication({');
    expect(core).toContain('primaryAbnormal.set(primaryAbnormal.get() || otherIndicationAbnormal);');
  });
});
