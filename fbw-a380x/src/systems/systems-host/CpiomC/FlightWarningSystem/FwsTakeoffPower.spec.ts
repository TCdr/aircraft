// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { createFws, runFwsCycle } from './FwsSpecFixture';
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

  // A derated takeoff is made at the FLX-MCT detent, as a FLEX takeoff
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

  describe('in the flight phases of the real FWS', () => {
    /** On the runway with all four engines running (the FWS confirms that for 30 s), the levers as given */
    function flightPhaseWithLevers(levers: number[], flexTemp: number): number {
      const { core, simVars } = createFws(new Set());
      simVars.set('L:A32NX_AIRLINER_TO_FLEX_TEMP', flexTemp);
      levers.forEach((lever, index) => {
        simVars.set(`L:A32NX_AUTOTHRUST_TLA:${index + 1}`, lever);
        simVars.set(`L:A32NX_ENGINE_N1:${index + 1}`, 20);
        simVars.set(`L:A32NX_ENGINE_STATE:${index + 1}`, 1);
      });
      for (let step = 0; step < 60; step++) {
        runFwsCycle(core);
      }
      return core.flightPhase.get();
    }

    it('enters the take-off phase with the levers 3 and 4 at FLX/MCT', () => {
      expect(flightPhaseWithLevers([IDLE, IDLE, FLX_MCT, FLX_MCT], 60)).toBe(3);
    });

    it('stays in phase 2 with the lever 3 alone at TOGA', () => {
      expect(flightPhaseWithLevers([IDLE, IDLE, TOGA, IDLE], 0)).toBe(2);
    });

    it('stays in phase 2 with the lever 4 alone at TOGA', () => {
      expect(flightPhaseWithLevers([IDLE, IDLE, IDLE, TOGA], 0)).toBe(2);
    });
  });
});
