// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  EngineAttentionGetterInputs,
  hasOtherAmberOrRedEngineIndication,
  isReverserIndicationAmber,
} from './EngineAttentionGetter';
import { FadecEngineState } from './EngineFailAlerts';
import { createFws, runFwsCycle } from './FwsSpecFixture';

/** A running engine with normal oil indications, no CLOGGED, no amber REV */
const normal: EngineAttentionGetterInputs = {
  engineRunning: true,
  oilPressurePsi: 120,
  oilTemperatureCelsius: 120,
  fuelFilterClogged: false,
  oilFilterClogged: false,
  reverserIndicationAmber: false,
};

/* Engine attention getting box */
describe('engine amber attention getting box: the other amber and red indications', () => {
  it('no box with normal indications', () => {
    expect(hasOtherAmberOrRedEngineIndication(normal)).toBe(false);
  });

  it('the oil pressure in red at or below 25 PSI', () => {
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, oilPressurePsi: 25 })).toBe(true);
    expect(hasOtherAmberOrRedEngineIndication({ ...normal, oilPressurePsi: 26 })).toBe(false);
  });

  it('the oil temperature in amber above 177 °C', () => {
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

/* REV 2(3) indications */
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
  it('adds the other indications to the primary abnormal parameters of each engine', () => {
    const { core, simVars } = createFws(new Set());
    simVars.set('L:A32NX_ENGINE_STATE:1', FadecEngineState.On);
    simVars.set('L:A32NX_ENGINE_STATE:2', FadecEngineState.On);
    simVars.set('GENERAL ENG OIL PRESSURE:1', 120);
    simVars.set('GENERAL ENG OIL PRESSURE:2', 120);
    simVars.set('GENERAL ENG OIL TEMPERATURE:1', 120);
    simVars.set('GENERAL ENG OIL TEMPERATURE:2', 120);
    runFwsCycle(core);
    expect(core.eng1PrimaryAbnormalParams.get()).toBe(false);
    expect(core.eng2PrimaryAbnormalParams.get()).toBe(false);

    simVars.set('GENERAL ENG OIL PRESSURE:2', 20);
    runFwsCycle(core);
    expect(core.eng1PrimaryAbnormalParams.get()).toBe(false);
    expect(core.eng2PrimaryAbnormalParams.get()).toBe(true);
  });
});
