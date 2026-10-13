// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  DUAL_RETARD_INTERVAL_SECONDS,
  DualRetardCallout,
  THR_LEVER_ABOVE_IDLE_LEVEL,
  THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION,
  ThrustLeverAboveIdleInputs,
  ThrustLeverAboveIdleMonitor,
} from './EngineThrustLeverAlerts';

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

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) THR LEVER ABOVE IDLE, a380_fcom.txt l.173271-173292 */
describe('A380X ENG THR LEVER ABOVE IDLE', () => {
  it('"One thrust lever is above idle and at least one thrust reverser lever is in reverse detent" (l.173277)', () => {
    const monitor = new ThrustLeverAboveIdleMonitor();
    monitor.update(levers([CLIMB, REVERSE, REVERSE, IDLE]));
    expect(activeEngines(monitor)).toEqual([1]);
    monitor.update(levers([IDLE, REVERSE, CLIMB, IDLE]));
    expect(activeEngines(monitor)).toEqual([3]);
  });

  it('"at least one thrust lever on the other engines is at idle", during the reversers de-selection (l.173278-173280)', () => {
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

  it('"The auto-idle protection is active." (l.173281), for the outboard engines only', () => {
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

  it('is a red MASTER WARN alert inhibited in the flight phases 1, 6, 7 and 12 (FCOM PDF page 5819)', () => {
    expect(THR_LEVER_ABOVE_IDLE_LEVEL).toBe(3);
    expect(THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION).toEqual([1, 6, 7, 12]);
  });

  it('"In addition, a dual RETARD callout triggers." (l.173285): two RETARD, then none', () => {
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

describe('A380X ENG THR LEVER ABOVE IDLE wiring', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const ata70 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
    'utf-8',
  );
  const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

  it.each([1, 2, 3, 4])('ENG %i: red title and THR LEVER n ... IDLE (l.173292)', (engine) => {
    const id = 701800161 + engine;
    const start = ata70.indexOf(`  ${id}: {`);
    expect(start).toBeGreaterThan(0);
    const procedure = ata70.slice(start, ata70.indexOf('\n  },', start));
    expect(procedure).toContain(`title: '\\x1b<2m\\x1b4mENG\\x1bm ${engine} THR LEVER ABOVE IDLE',`);
    expect(procedure).toContain(`{ name: 'THR LEVER ${engine}', sensed: true, labelNotCompleted: 'IDLE' }`);

    const alertStart = abnormalSensed.indexOf(`    ${id}: {`);
    expect(alertStart).toBeGreaterThan(0);
    const alert = abnormalSensed.slice(alertStart, abnormalSensed.indexOf('\n    },', alertStart));
    expect(alert).toContain('flightPhaseInhib: THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION,');
    expect(alert).toContain(`simVarIsActive: this.fws.thrLeverAboveIdle[${engine - 1}],`);
    expect(alert).toContain('failure: THR_LEVER_ABOVE_IDLE_LEVEL,');
    // the dual RETARD replaces the CRC of a level 3 alert
    expect(alert).toContain('auralWarning: Subject.create(FwcAuralWarning.None),');
    expect(alert).toContain(`this.fws.thrustLever${engine}Idle.get()`);
  });

  it('sounds RETARD from the DualRetardCallout', () => {
    expect(fwsCore).toContain("this.soundManager.enqueueSound('retard');");
    // only while the alert is shown: not in its inhibited flight phases
    expect(fwsCore).toMatch(
      /thrLeverAboveIdleShown =\s+this\.thrustLeverAboveIdleMonitor\.isAnyActive\(\) &&\s+!THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION\.includes\(this\.flightPhase\.get\(\)\);/,
    );
    expect(fwsCore).toContain('this.dualRetardCallout.update(thrLeverAboveIdleShown, deltaTime / 1000)');
  });
});
