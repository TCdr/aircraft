// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EcamMemos } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

/*
 * EVAC panel COMMAND pb-sw: the flight crew orders an evacuation, whatever the CAPT and PURS sw position. Pressed, its
 * ON and EVAC lights flash and the ECAM shows EVAC ACTIVE.
 */
describe('A380X EVAC ACTIVE memo', () => {
  it('is an ECAM memo text', () => {
    expect(EcamMemos['230000016']).toMatch(/EVAC ACTIVE$/);
  });

  it('reads the EVAC COMMAND pb-sw state, not the inverted cockpit L:var', () => {
    // A380_Cockpit_Behavior.xml EVAC component: ON light = (L:A32NX_EVAC_COMMAND_TOGGLE, Bool) !, so 1 = OFF
    const { core, simVars } = createFws();
    core.startupCompleted.set(true);
    simVars.set('L:A32NX_EVAC_COMMAND_TOGGLE', 1);
    core.update(1000);
    expect(core.evacCommandOn.get()).toBe(false);
    simVars.set('L:A32NX_EVAC_COMMAND_TOGGLE', 0);
    core.update(1000);
    expect(core.evacCommandOn.get()).toBe(true);
  });

  it('is shown while the EVAC COMMAND pb-sw is ON (L:var 0), in every flight phase', () => {
    const { core, simVars } = createFws();
    core.startupCompleted.set(true);
    const memo = core.memos.ewdMemos['230000016'];
    expect(memo).toBeDefined();
    expect(memo.flightPhaseInhib).toEqual([]);
    expect(memo.codesToReturn).toEqual(['230000016']);

    // L:A32NX_EVAC_COMMAND_TOGGLE = 1: pb-sw OFF (the normal state, recorded for a whole flight in the sim)
    simVars.set('L:A32NX_EVAC_COMMAND_TOGGLE', 1);
    core.update(1000);
    expect(memo.simVarIsActive.get()).toBe(false);
    // L:A32NX_EVAC_COMMAND_TOGGLE = 0: pb-sw ON
    simVars.set('L:A32NX_EVAC_COMMAND_TOGGLE', 0);
    core.update(1000);
    expect(memo.simVarIsActive.get()).toBe(true);
    simVars.set('L:A32NX_EVAC_COMMAND_TOGGLE', 1);
    core.update(1000);
    expect(memo.simVarIsActive.get()).toBe(false);
  });
});
