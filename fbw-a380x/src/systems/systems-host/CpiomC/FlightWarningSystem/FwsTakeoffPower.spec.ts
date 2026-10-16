// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { engineTakeoffPowerSignal, reducedTakeoffThrustSet, twoEnginesTakeoffPowerSignal } from './FwsTakeoffPower';

const IDLE = 0;
const CL = 25;
const FLX_MCT = 35;
const TOGA = 45;

describe('A380X FWS take-off power signal', () => {
  it('counts a lever at TOGA, above FLX/MCT, or at FLX/MCT with a FLEX TEMP', () => {
    expect(engineTakeoffPowerSignal(TOGA, false)).toBe(true);
    expect(engineTakeoffPowerSignal(40, false)).toBe(true);
    expect(engineTakeoffPowerSignal(FLX_MCT, true)).toBe(true);
    expect(engineTakeoffPowerSignal(FLX_MCT, false)).toBe(false);
    expect(engineTakeoffPowerSignal(CL, true)).toBe(false);
    expect(engineTakeoffPowerSignal(IDLE, true)).toBe(false);
  });

  // A380 FCOM DSC-22-FG-50-30 l.11406-11408: a derated takeoff is made at the FLX-MCT detent, as a FLEX takeoff
  it('takes the FLX/MCT detent as take-off power with a FLEX TEMP or a derate', () => {
    expect(reducedTakeoffThrustSet(60, 0)).toBe(true);
    expect(reducedTakeoffThrustSet(0.1, 0)).toBe(true);
    expect(reducedTakeoffThrustSet(0, 12)).toBe(true);
    expect(reducedTakeoffThrustSet(0, 0)).toBe(false);
  });

  it('needs two levers at take-off power', () => {
    expect(twoEnginesTakeoffPowerSignal([IDLE, IDLE, FLX_MCT, FLX_MCT], true)).toBe(true);
    expect(twoEnginesTakeoffPowerSignal([IDLE, IDLE, IDLE, FLX_MCT], true)).toBe(false);
  });

  it('judges engine 4 on lever 4: lever 3 alone at TOGA is one engine, not two', () => {
    expect(twoEnginesTakeoffPowerSignal([IDLE, IDLE, TOGA, IDLE], false)).toBe(false);
    expect(twoEnginesTakeoffPowerSignal([IDLE, IDLE, IDLE, TOGA], false)).toBe(false);
  });

  it('is what the flight phases use for all four engines', () => {
    const phases = readFileSync(resolve(__dirname, 'FwsFlightPhases.ts'), 'utf8');
    expect(phases).toContain('twoEnginesTakeoffPowerSignal([eng1TLA, eng2TLA, eng3TLA, eng4TLA], flexTempSet)');
    expect(phases).not.toMatch(/eng4TLAFullPwr\s*=\s*eng3TLA/);
  });
});
