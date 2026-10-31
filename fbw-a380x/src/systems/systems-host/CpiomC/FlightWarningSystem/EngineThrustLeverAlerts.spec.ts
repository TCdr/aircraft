// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import {
  DUAL_RETARD_INTERVAL_SECONDS,
  DualRetardCallout,
  THR_LEVER_ABOVE_IDLE_LEVEL,
  THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION,
  ThrustLeverAboveIdleInputs,
  ThrustLeverAboveIdleMonitor,
  isThrLeverAboveIdleShown,
} from './EngineThrustLeverAlerts';
import { FwcAuralWarning } from './FwsCore';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const IDLE = 0;
const CLIMB = 25;
const REVERSE = -10;

const levers = (tlaDegrees: number[], overrides: Partial<ThrustLeverAboveIdleInputs> = {}) => ({
  tlaDegrees,
  fadecAutoIdle: [false, false, false, false],
  thrLeverFault: [false, false, false, false],
  ...overrides,
});

const activeEngines = (monitor: ThrustLeverAboveIdleMonitor) =>
  [0, 1, 2, 3].filter((engineIndex) => monitor.isActive(engineIndex)).map((engineIndex) => engineIndex + 1);

describe('A380X ENG THR LEVER ABOVE IDLE', () => {
  it('"One thrust lever is above idle and at least one thrust reverser lever is in reverse detent"', () => {
    const monitor = new ThrustLeverAboveIdleMonitor();
    monitor.update(levers([CLIMB, REVERSE, REVERSE, IDLE]));
    expect(activeEngines(monitor)).toEqual([1]);
    monitor.update(levers([IDLE, REVERSE, CLIMB, IDLE]));
    expect(activeEngines(monitor)).toEqual([3]);
  });

  it('"at least one thrust lever on the other engines is at idle", during the reversers de-selection', () => {
    const monitor = new ThrustLeverAboveIdleMonitor();
    monitor.update(levers([IDLE, REVERSE, REVERSE, IDLE]));
    expect(activeEngines(monitor)).toEqual([]);
    // reverser 2 stowed straight to forward thrust while engines 1, 3 and 4 are at idle
    monitor.update(levers([IDLE, CLIMB, IDLE, IDLE]));
    expect(activeEngines(monitor)).toEqual([2]);
    // all levers at idle: the de-selection is finished
    monitor.update(levers([IDLE, IDLE, IDLE, IDLE]));
    expect(activeEngines(monitor)).toEqual([]);
    monitor.update(levers([IDLE, CLIMB, IDLE, IDLE]));
    expect(activeEngines(monitor)).toEqual([]);
  });

  it('stays away from a take-off or a taxi with asymmetric thrust (no reverse selected)', () => {
    const monitor = new ThrustLeverAboveIdleMonitor();
    monitor.update(levers([CLIMB, IDLE, IDLE, IDLE]));
    monitor.update(levers([CLIMB, CLIMB, CLIMB, IDLE]));
    expect(activeEngines(monitor)).toEqual([]);
  });

  it('"The auto-idle protection is active.", for the outboard engines only', () => {
    const monitor = new ThrustLeverAboveIdleMonitor();
    monitor.update(levers([IDLE, IDLE, IDLE, IDLE], { fadecAutoIdle: [false, false, false, true] }));
    expect(activeEngines(monitor)).toEqual([4]);
    // engines 2 and 3: the variable is the IDLE ONLY of an unlocked reverser, not the auto-idle protection
    monitor.update(levers([IDLE, IDLE, IDLE, IDLE], { fadecAutoIdle: [false, true, true, false] }));
    expect(activeEngines(monitor)).toEqual([]);
    // THR LEVER FAULT on ground: the FADEC holds idle (ENG IDLE ONLY), not the auto-idle protection
    monitor.update(
      levers([IDLE, IDLE, IDLE, IDLE], {
        fadecAutoIdle: [true, false, false, false],
        thrLeverFault: [true, false, false, false],
      }),
    );
    expect(activeEngines(monitor)).toEqual([]);
  });

  it('ignores a lever with a THR LEVER FAULT', () => {
    const monitor = new ThrustLeverAboveIdleMonitor();
    monitor.update(
      levers([CLIMB, REVERSE, IDLE, IDLE], {
        thrLeverFault: [true, false, false, false],
      }),
    );
    expect(activeEngines(monitor)).toEqual([]);
  });

  it('is a red MASTER WARN alert inhibited in the flight phases 1, 6, 7 and 12', () => {
    expect(THR_LEVER_ABOVE_IDLE_LEVEL).toBe(3);
    expect(THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION).toEqual([1, 6, 7, 12]);
  });

  it('"In addition, a dual RETARD callout triggers.": two RETARD, then none', () => {
    const callout = new DualRetardCallout();
    const calls: number[] = [];
    for (let step = 0; step < 50; step++) {
      if (callout.update(true, 0.1)) {
        calls.push(step);
      }
    }
    expect(calls.length).toBe(2);
    expect(calls[0]).toBe(0);
    expect(calls[1] * 0.1).toBeGreaterThanOrEqual(DUAL_RETARD_INTERVAL_SECONDS - 1e-9);
  });

  it('makes no second RETARD when the alert has gone, and two again on a new alert', () => {
    const callout = new DualRetardCallout();
    expect(callout.update(true, 0.1)).toBe(true);
    expect(callout.update(false, 0.1)).toBe(false);
    for (let step = 0; step < 20; step++) {
      expect(callout.update(false, 0.1)).toBe(false);
    }
    expect(callout.update(true, 0.1)).toBe(true);
  });
});

describe('A380X ENG THR LEVER ABOVE IDLE shown', () => {
  it('is shown with a lever above idle, except in the inhibited flight phases', () => {
    expect(isThrLeverAboveIdleShown(true, 8)).toBe(true);
    expect(isThrLeverAboveIdleShown(false, 8)).toBe(false);
    for (const phase of THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION) {
      expect(isThrLeverAboveIdleShown(true, phase)).toBe(false);
    }
  });
});

describe('A380X ENG THR LEVER ABOVE IDLE wiring', () => {
  const { core, simVars } = createFws();
  const sensed = (id: number) => core.abnormalSensed.ewdAbnormalSensed[id];

  it.each([1, 2, 3, 4])('ENG %i: red title and THR LEVER n ... IDLE', (engine) => {
    const id = 701800161 + engine;
    const procedure = EcamAbnormalProcedures[id];
    expect(procedure.title).toBe(`\x1b<2m\x1b4mENG\x1bm ${engine} THR LEVER ABOVE IDLE`);
    expect(procedure.items).toContainEqual({ name: `THR LEVER ${engine}`, sensed: true, labelNotCompleted: 'IDLE' });

    const entry = sensed(id);
    expect(entry.flightPhaseInhib).toEqual(THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION);
    expect(entry.simVarIsActive).toBe(core.thrLeverAboveIdle[engine - 1]);
    expect(entry.failure).toBe(THR_LEVER_ABOVE_IDLE_LEVEL);
    // the dual RETARD replaces the CRC of a level 3 alert
    expect(entry.auralWarning?.get()).toBe(FwcAuralWarning.None);
    const atIdle = [core.thrustLever1Idle, core.thrustLever2Idle, core.thrustLever3Idle, core.thrustLever4Idle];
    expect(entry.whichItemsChecked()).toEqual([atIdle[engine - 1].get()]);
  });

  it('raises the alert for a lever above idle with a reverser lever in the reverse detent', () => {
    simVars.set('L:A32NX_AUTOTHRUST_TLA:1', 25);
    simVars.set('L:A32NX_AUTOTHRUST_TLA:2', -10);
    simVars.set('L:A32NX_AUTOTHRUST_TLA:3', -10);
    runFwsCycle(core);
    expect(core.thrLeverAboveIdle.map((alert) => alert.get())).toEqual([true, false, false, false]);
  });

  it('sounds no RETARD in an inhibited flight phase', () => {
    const retard = vi.spyOn(core.soundManager, 'enqueueSound');
    // on the ground in phase 1 the alert is inhibited
    expect(core.flightPhase.get()).toBe(1);
    runFwsCycle(core);
    expect(retard).not.toHaveBeenCalledWith('retard');
  });

  it('sounds RETARD when a lever is above idle in a flight phase that does not inhibit the alert', () => {
    const retard = vi.spyOn(core.soundManager, 'enqueueSound');
    const flightPhase = vi.spyOn(core.flightPhase, 'get').mockReturnValue(8);
    runFwsCycle(core);
    flightPhase.mockRestore();
    expect(retard).toHaveBeenCalledWith('retard');
  });
});
