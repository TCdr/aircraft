// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import {
  doorsNotClosedChecked,
  doorsNotClosedItems,
  doorsNotClosedLimitations,
  FwsGearAlerts,
  gearNotLockedDownChecked,
  gearNotLockedDownItems,
  gearNotLockedUpItems,
  gearNotLockedUpLimitations,
  LeverRecycleMonitor,
  lgcisFault,
  lgcisSensorDisagree,
  lgcisVote,
  LgciuWords,
  lgCtl12Items,
  lgCtl12Limitations,
  splitLgcisFaults,
} from './FwsGearAlerts';

/** One LGCIU word with the given bits set */
function word(bits: number[], ssm = Arinc429SignStatusMatrix.NormalOperation): Arinc429Register {
  const w = Arinc429Register.empty();
  w.setSsm(ssm);
  bits.forEach((bit) => w.setBitValue(bit, true));
  return w;
}

/** Gear state seen by one LGCIS (three gears: left, right, nose) */
interface GearState {
  leverDown: boolean;
  /** downlocked per gear */
  down: [boolean, boolean, boolean];
  /** uplocked per gear */
  up: [boolean, boolean, boolean];
  /** door closed and locked per gear */
  doorClosed: [boolean, boolean, boolean];
  fault?: boolean;
  unpowered?: boolean;
}

/** The LGCIU words of one LGCIS, built as landing_gear/mod.rs discrete_word_1..4 */
function lgcis(s: GearState): LgciuWords {
  if (s.unpowered) {
    const fw = Arinc429SignStatusMatrix.FailureWarning;
    return { word1: word([], fw), word2: word([], fw), word3: word([], fw), word4: word([], fw) };
  }
  const w1: number[] = [];
  const w3: number[] = [];
  [0, 1, 2].forEach((g) => {
    if (!s.up[g] && !s.leverDown) w1.push(11 + g);
    if (!s.down[g] && s.leverDown) w1.push(14 + g);
    if (!s.doorClosed[g]) w1.push(17 + g);
    if (s.down[g]) w1.push(23 + g);
    if (!s.up[g]) w3.push(11 + g);
  });
  if (s.leverDown) w1.push(29);
  if (!s.leverDown) w3.push(14);
  return { word1: word(w1), word2: word([]), word3: word(w3), word4: word(s.fault ? [29] : []) };
}

const ALL: [boolean, boolean, boolean] = [true, true, true];
const NONE: [boolean, boolean, boolean] = [false, false, false];
const GEAR_DOWN: GearState = { leverDown: true, down: ALL, up: NONE, doorClosed: ALL };
const GEAR_UP: GearState = { leverDown: false, down: NONE, up: ALL, doorClosed: ALL };

/** Runs the monitor for a time with the same inputs, 100 ms steps */
function run(
  alerts: FwsGearAlerts,
  seconds: number,
  a: GearState,
  b: GearState = a,
  onGround = false,
  gravity = false,
): FwsGearAlerts {
  for (let t = 0; t < seconds * 10; t++) {
    alerts.update(100, lgcis(a), lgcis(b), onGround, gravity);
  }
  return alerts;
}

describe('LGCIS vote (as the A32NX FWC)', () => {
  it('both valid: both must see it; one valid: that one; none: false', () => {
    expect(lgcisVote(true, true)).toBe(true);
    expect(lgcisVote(true, false)).toBe(false);
    expect(lgcisVote(true, null)).toBe(true);
    expect(lgcisVote(null, false)).toBe(false);
    expect(lgcisVote(null, null)).toBe(false);
  });
});

describe('L/G CTL 1(2)(1+2) FAULT (A380 FCOM l.160908, l.160939-160940)', () => {
  it('an LGCIS is failed with its system fault bit or without valid words', () => {
    expect(lgcisFault(lgcis(GEAR_DOWN))).toBe(false);
    expect(lgcisFault(lgcis({ ...GEAR_DOWN, fault: true }))).toBe(true);
    expect(lgcisFault(lgcis({ ...GEAR_DOWN, unpowered: true }))).toBe(true);
  });

  it('1, 2 and 1+2 never show together', () => {
    expect(splitLgcisFaults(true, false)).toEqual({ ctl1: true, ctl2: false, ctl12: false });
    expect(splitLgcisFaults(false, true)).toEqual({ ctl1: false, ctl2: true, ctl12: false });
    expect(splitLgcisFaults(true, true)).toEqual({ ctl1: false, ctl2: false, ctl12: true });
  });

  it('the monitor raises CTL 1 for an LGCIS 1 fault and CTL 1+2 with both, remembering the gear was down', () => {
    const alerts = run(new FwsGearAlerts(), 1, { ...GEAR_DOWN, fault: true }, GEAR_DOWN);
    expect(alerts.lgCtl1Fault.get()).toBe(true);
    expect(alerts.lgCtl12Fault.get()).toBe(false);
    run(alerts, 1, { ...GEAR_DOWN, fault: true }, { ...GEAR_DOWN, unpowered: true });
    expect(alerts.lgCtl12Fault.get()).toBe(true);
    expect(alerts.lgCtl1Fault.get()).toBe(false);
    // LGCIS 1 still gives valid words: all gears downlocked when the 1+2 fault came up
    expect(alerts.ctl12WithGearDown.get()).toBe(true);
  });

  it('without valid data from both LGCIS the gear is not known to be down: no NO L/G RETRACTION', () => {
    const unpowered: GearState = { ...GEAR_DOWN, unpowered: true };
    const alerts = run(new FwsGearAlerts(), 1, unpowered, unpowered);
    expect(alerts.lgCtl12Fault.get()).toBe(true);
    expect(alerts.ctl12WithGearDown.get()).toBe(false);
  });

  it('NO L/G RETRACTION only with an engine running and the gear down at the failure; else gravity extension limits', () => {
    expect(lgCtl12Items(true, true)).toEqual([true, true]);
    expect(lgCtl12Items(true, false)).toEqual([true, false]);
    expect(lgCtl12Limitations(true)).toEqual(['320400006']);
    expect(lgCtl12Limitations(false)).toEqual(['320400001', '320400002']);
  });
});

describe('L/G GEAR NOT LOCKED DOWN: lever DOWN and a gear not downlocked after about 60 s (l.161245-161246)', () => {
  const noseStuck: GearState = { leverDown: true, down: [true, true, false], up: NONE, doorClosed: ALL };

  it('not before 60 s, then on', () => {
    const alerts = run(new FwsGearAlerts(), 59, noseStuck);
    expect(alerts.gearNotLockedDown.get()).toBe(false);
    run(alerts, 2, noseStuck);
    expect(alerts.gearNotLockedDown.get()).toBe(true);
  });

  it('stays while the lever is recycled UP for the gravity extension, goes when all gears are downlocked', () => {
    const alerts = run(new FwsGearAlerts(), 61, noseStuck);
    run(alerts, 5, { ...noseStuck, leverDown: false });
    expect(alerts.gearNotLockedDown.get()).toBe(true);
    run(alerts, 1, noseStuck);
    expect(alerts.notLockedDownRecycled.get()).toBe(true);
    run(alerts, 1, GEAR_DOWN);
    expect(alerts.gearNotLockedDown.get()).toBe(false);
  });

  it('only one LGCIS seeing the gear not downlocked is not enough (that is SYSTEM DISAGREE)', () => {
    const alerts = run(new FwsGearAlerts(), 70, noseStuck, GEAR_DOWN);
    expect(alerts.gearNotLockedDown.get()).toBe(false);
  });

  it('the gravity extension lines show after 120 s (l.161276)', () => {
    const alerts = run(new FwsGearAlerts(), 61 + 119, noseStuck);
    expect(alerts.notLockedDownGravityDue.get()).toBe(false);
    run(alerts, 1, noseStuck);
    expect(alerts.notLockedDownGravityDue.get()).toBe(true);
    expect(gearNotLockedDownItems(true, false, false)).toEqual([true, false, false, false, false, false]);
    expect(gearNotLockedDownItems(true, true, false)).toEqual([true, true, true, true, true, false]);
    expect(gearNotLockedDownItems(true, true, true)).toEqual([true, true, true, true, true, true]);
    expect(gearNotLockedDownChecked(true, false, true)).toEqual([true, false, true, true, false, false]);
  });
});

describe('L/G GEAR NOT LOCKED UP: lever UP and a gear not locked up after about 40 s (l.161360-161361)', () => {
  const noseHanging: GearState = {
    leverDown: false,
    down: [false, false, true],
    up: [true, true, false],
    doorClosed: ALL,
  };

  it('not before 40 s, then on', () => {
    const alerts = run(new FwsGearAlerts(), 39, noseHanging);
    expect(alerts.gearNotLockedUp.get()).toBe(false);
    run(alerts, 2, noseHanging);
    expect(alerts.gearNotLockedUp.get()).toBe(true);
  });

  it('a normal retraction (gear up within 40 s) does not trigger it', () => {
    const alerts = run(new FwsGearAlerts(), 20, noseHanging);
    run(alerts, 60, GEAR_UP);
    expect(alerts.gearNotLockedUp.get()).toBe(false);
  });

  it('stays after L/G LEVER DOWN (IF NOT SUCCESSFUL), goes after 5 s locked up, and on ground', () => {
    const alerts = run(new FwsGearAlerts(), 41, noseHanging);
    run(alerts, 30, GEAR_DOWN);
    expect(alerts.gearNotLockedUp.get()).toBe(true);
    run(alerts, 4, GEAR_UP);
    expect(alerts.gearNotLockedUp.get()).toBe(true);
    run(alerts, 2, GEAR_UP);
    expect(alerts.gearNotLockedUp.get()).toBe(false);
    run(alerts, 41, noseHanging);
    run(alerts, 0.1, GEAR_DOWN, GEAR_DOWN, true);
    expect(alerts.gearNotLockedUp.get()).toBe(false);
  });

  it('door open: speed and recycle lines, IF NOT SUCCESSFUL lines after the recycle; doors closed: AVOID EXCESS G LOAD', () => {
    expect(gearNotLockedUpItems(true, true, true, false)).toEqual([true, true, false, false, true, true, false]);
    expect(gearNotLockedUpItems(true, true, false, true)).toEqual([false, true, true, true, true, true, false]);
    expect(gearNotLockedUpItems(true, false, false, false)).toEqual([false, false, false, false, true, true, true]);
    expect(gearNotLockedUpItems(false, true, true, true)).toEqual([false, false, false, false, false, false, false]);
    expect(gearNotLockedUpLimitations(true, true)).toEqual(['260400002', '320400007']);
    expect(gearNotLockedUpLimitations(false, true)).toEqual([]);
  });
});

describe('L/G DOORS NOT CLOSED (l.161061-161062)', () => {
  const doorOpenGearDown: GearState = { ...GEAR_DOWN, doorClosed: [true, false, true] };

  it('a door not closed 30 s after the gear stopped', () => {
    const alerts = run(new FwsGearAlerts(), 29, doorOpenGearDown);
    expect(alerts.doorsNotClosed.get()).toBe(false);
    run(alerts, 2, doorOpenGearDown);
    expect(alerts.doorsNotClosed.get()).toBe(true);
    run(alerts, 0.1, GEAR_DOWN);
    expect(alerts.doorsNotClosed.get()).toBe(false);
  });

  it('not after a gravity extension: the L/G doors remain open (l.82399)', () => {
    expect(run(new FwsGearAlerts(), 40, doorOpenGearDown, doorOpenGearDown, false, true).doorsNotClosed.get()).toBe(
      false,
    );
  });

  it('not while a gear is still moving (doors open in transit)', () => {
    const transit: GearState = { leverDown: true, down: [false, true, true], up: NONE, doorClosed: NONE };
    expect(run(new FwsGearAlerts(), 50, transit).doorsNotClosed.get()).toBe(false);
  });

  it('lines by speed, fuel lines in flight with an engine running, MAX SPEED 250/.55 in flight', () => {
    expect(doorsNotClosedItems(true, false, true)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(doorsNotClosedItems(true, true, false)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(doorsNotClosedItems(false, false, true).every((shown) => !shown)).toBe(true);
    expect(doorsNotClosedChecked(false, true)[3]).toBe(true);
    expect(doorsNotClosedLimitations(true)).toEqual(['260400002']);
    expect(doorsNotClosedLimitations(false)).toEqual([]);
  });
});

describe('L/G SYSTEM DISAGREE (l.162504-162506)', () => {
  it('a sensor of LGCIS 1 differs from the redundant sensor of LGCIS 2', () => {
    const noseDownlockDamaged: GearState = { ...GEAR_DOWN, down: [true, true, false] };
    expect(lgcisSensorDisagree(lgcis(GEAR_DOWN), lgcis(GEAR_DOWN))).toBe(false);
    expect(lgcisSensorDisagree(lgcis(GEAR_DOWN), lgcis(noseDownlockDamaged))).toBe(true);
    expect(lgcisSensorDisagree(lgcis(GEAR_DOWN), lgcis({ ...GEAR_DOWN, unpowered: true }))).toBe(false);
  });

  it('confirmed for 5 s', () => {
    const damaged: GearState = { ...GEAR_UP, up: [true, true, false] };
    const alerts = run(new FwsGearAlerts(), 4.9, GEAR_UP, damaged);
    expect(alerts.systemDisagree.get()).toBe(false);
    run(alerts, 0.5, GEAR_UP, damaged);
    expect(alerts.systemDisagree.get()).toBe(true);
  });
});

describe('lever recycle', () => {
  it('ticks once the lever went to the other position and back', () => {
    const monitor = new LeverRecycleMonitor();
    monitor.update(true, false);
    expect(monitor.update(true, true)).toBe(false);
    expect(monitor.update(true, false)).toBe(true);
    expect(monitor.update(false, false)).toBe(false);
  });
});

describe('FWS wiring of the L/G alerts', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
  const messages = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata31-32-33.ts'),
    'utf-8',
  );

  /** The source of one alert entry */
  function block(id: string): string {
    const start = abnormalSensed.indexOf(`    ${id}: {`);
    expect(start).toBeGreaterThan(0);
    return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
  }

  /** Number of lines of a procedure in ata31-32-33.ts */
  function itemCount(id: string): number {
    const start = messages.indexOf(`  ${id}: {`);
    const end = messages.indexOf('\n  },', start);
    return (messages.slice(start, end).match(/^ {6}\{/gm) ?? []).length;
  }

  it('FwsCore reads word 3 of both LGCIS and updates the monitor', () => {
    expect(fwsCore).toContain("this.lgciu1DiscreteWord3.setFromSimVar('L:A32NX_LGCIU_1_DISCRETE_WORD_3');");
    expect(fwsCore).toContain("this.lgciu2DiscreteWord3.setFromSimVar('L:A32NX_LGCIU_2_DISCRETE_WORD_3');");
    expect(fwsCore).toContain('this.gearAlerts.update(');
  });

  it.each([
    ['320800033', 'lgCtl1Fault', 1],
    ['320800034', 'lgCtl2Fault', 1],
    ['320800035', 'lgCtl12Fault', 2],
    ['320800039', 'gearNotLockedDown', 3],
    ['320800040', 'gearNotLockedUp', 2],
    ['320800036', 'doorsNotClosed', 2],
    ['320800045', 'systemDisagree', 1],
  ])('%s is raised by gearAlerts.%s at level %i on the WHEEL page', (id, subject, level) => {
    const b = block(id);
    expect(b).toContain(`simVarIsActive: this.fws.gearAlerts.${subject},`);
    expect(b).toContain(`failure: ${level},`);
    expect(b).toContain('sysPage: SdPages.Wheel,');
  });

  it.each([
    ['320800035', 2],
    ['320800039', 6],
    ['320800040', 7],
    ['320800036', 12],
  ])('%s: the line functions match the %i lines of the procedure', (id, count) => {
    expect(itemCount(id)).toBe(count);
  });

  it('STATUS lines: L/G CTL 1+2 and GPWS 1+2; L/G RETRACTION; L/G DOORS', () => {
    expect(block('320800035')).toContain("inopSysApprLdg: () => ['320300011', '340300003']");
    expect(block('320800040')).toContain("inopSysAllPhases: () => ['320300013']");
    expect(block('320800036')).toContain("inopSysApprLdg: () => ['320300012']");
  });
});
