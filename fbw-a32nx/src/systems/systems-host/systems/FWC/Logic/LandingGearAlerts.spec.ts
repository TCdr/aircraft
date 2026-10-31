// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { discreteWordWithBits, probedFailure, startCruiseFwc } from '../FwcControlsAlertProbe';
import {
  DOORS_NOT_CLOSED_CONFIRM_SECONDS,
  DOORS_NOT_CLOSED_PHASE_INHIBITION,
  LandingGearAlertKeys,
  LandingGearAlerts,
  LandingGearInputs,
  LgciuGearPosition,
  SYS_DISAGREE_PHASE_INHIBITION,
  antiSkidOffStatus,
  fromValidLgcius,
  gearNotUplockedStatus,
  isLgciuGearPositionDisagree,
  lgciu1And2FaultStatus,
  lgciuFaultStatus,
} from './LandingGearAlerts';
import { ewdLines, statusLines } from './FwcAlertSpecHelpers';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** A gear up and locked, doors closed, lever up */
const gearUp: LgciuGearPosition = {
  downlocked: [false, false, false],
  notLockedUp: [false, false, false],
  doorNotClosed: [false, false, false],
  leverUp: true,
};

const inputs = (lgciu1: LgciuGearPosition, lgciu2: LgciuGearPosition = lgciu1, gearNotUplocked = false) =>
  ({ lgcius: [lgciu1, lgciu2], gearNotUplocked }) as LandingGearInputs;

function run(alerts: LandingGearAlerts, gear: LandingGearInputs, seconds: number): LandingGearAlerts {
  for (let i = 0; i < seconds; i++) {
    alerts.update(gear, 1);
  }
  return alerts;
}

const active = (alerts: LandingGearAlerts, key: string) => alerts.ewdFailures[key].simVarIsActive.get();

describe('LGCIU conditions', () => {
  it('both valid LGCIUs must agree, one valid LGCIU is enough', () => {
    expect(fromValidLgcius(true, true)).toBe(true);
    expect(fromValidLgcius(true, false)).toBe(false);
    expect(fromValidLgcius(null, true)).toBe(true);
    expect(fromValidLgcius(null, null)).toBe(false);
  });
});

/* L/G DOORS NOT CLOSED: triggers when one gear door is not uplocked. With the L/G lever up: WHEN SPD < 220/0.54,
   L/G LEVER RECYCLE; IF UNSUCCESSFUL: MAX SPEED 250/0.60, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE. STATUS: MAX SPEED
   250/.60, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE, INOP SYS L/G DOOR. */
describe('L/G DOORS NOT CLOSED', () => {
  const doorOpen = { ...gearUp, doorNotClosed: [false, true, false] } as LgciuGearPosition;

  it('triggers after the 30 s of a gear sequence', () => {
    const alerts = new LandingGearAlerts();
    run(alerts, inputs(doorOpen), DOORS_NOT_CLOSED_CONFIRM_SECONDS - 1);
    expect(active(alerts, LandingGearAlertKeys.doorsNotClosed)).toBe(false);
    run(alerts, inputs(doorOpen), 1);
    expect(active(alerts, LandingGearAlertKeys.doorsNotClosed)).toBe(true);
  });

  it('needs both LGCIUs, and is not shown with GEAR NOT UPLOCKED', () => {
    expect(
      active(run(new LandingGearAlerts(), inputs(doorOpen, gearUp), 40), LandingGearAlertKeys.doorsNotClosed),
    ).toBe(false);
    expect(
      active(run(new LandingGearAlerts(), inputs(doorOpen, doorOpen, true), 40), LandingGearAlertKeys.doorsNotClosed),
    ).toBe(false);
  });

  it('lever up: the recycle lines, then IF UNSUCCESSFUL; STATUS with INOP SYS L/G DOOR', () => {
    const item = run(new LandingGearAlerts(), inputs(doorOpen), 30).ewdFailures[LandingGearAlertKeys.doorsNotClosed];
    expect(ewdLines(item)).toEqual([
      'L/G DOORS NOT CLOSED',
      '  .WHEN SPD < 220/.54:',
      ' -L/G LEVER......RECYCLE',
      '    .IF UNSUCCESSFUL:',
      ' MAX SPEED.......250/.60',
      ' FUEL CONSUMPT INCRSD',
      ' FMS PRED UNRELIABLE',
    ]);
    const page = statusLines({ left: item.statusInfo(), inopSys: item.inopSys() });
    expect(page.left).toEqual(['MAX SPEED.......250/.60', 'FUEL CONSUMPT INCRSD', 'FMS PRED UNRELIABLE']);
    expect(page.right).toEqual(['INOP SYS', 'L/G DOOR']);
    expect(DOORS_NOT_CLOSED_PHASE_INHIBITION).toEqual([1, 3, 4, 5, 8, 9, 10]);
  });

  it('lever down: no recycle lines', () => {
    const down = { ...doorOpen, leverUp: false };
    const item = run(new LandingGearAlerts(), inputs(down), 30).ewdFailures[LandingGearAlertKeys.doorsNotClosed];
    expect(ewdLines(item).join('|')).not.toContain('RECYCLE');
  });
});

/* L/G SYS DISAGREE: triggers when LGCIU 1 and LGCIU 2 disagree on the landing gear positions; crew awareness. */
describe('L/G SYS DISAGREE', () => {
  it('a gear seen downlocked by one LGCIU only, or uplocked by one only, is a disagreement', () => {
    const gearDown: LgciuGearPosition = { ...gearUp, downlocked: [true, true, true], notLockedUp: [true, true, true] };
    expect(isLgciuGearPositionDisagree(inputs(gearDown))).toBe(false);
    expect(isLgciuGearPositionDisagree(inputs(gearDown, { ...gearDown, downlocked: [false, true, true] }))).toBe(true);
    expect(isLgciuGearPositionDisagree(inputs(gearUp, { ...gearUp, notLockedUp: [false, false, true] }))).toBe(true);
  });

  it('needs both LGCIU words', () => {
    expect(isLgciuGearPositionDisagree(inputs(gearUp, { ...gearUp, downlocked: null, notLockedUp: null }))).toBe(false);
  });

  it('is a title only caution, shown in phases 1, 2, 9 and 10', () => {
    const alerts = run(new LandingGearAlerts(), inputs(gearUp, { ...gearUp, notLockedUp: [true, false, false] }), 1);
    const item = alerts.ewdFailures[LandingGearAlertKeys.sysDisagree];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual(['L/G SYS DISAGREE']);
    expect(SYS_DISAGREE_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('the L/G alerts are wired in the PseudoFWC: fed by the LGCIU words, updated every cycle', () => {
    const rig = startCruiseFwc();
    const disagree = probedFailure(rig.fwc, LandingGearAlertKeys.sysDisagree);
    const doorsNotClosed = probedFailure(rig.fwc, LandingGearAlertKeys.doorsNotClosed);
    expect(disagree.simVarIsActive.get()).toBe(false);
    expect(doorsNotClosed.simVarIsActive.get()).toBe(false);

    // LGCIU discrete word 3 bit 11: LH gear not locked up, seen by LGCIU 1 only
    rig.simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_3', discreteWordWithBits(11));
    rig.run(5);
    expect(disagree.simVarIsActive.get()).toBe(true);
    expect(disagree.flightPhaseInhib).toEqual(SYS_DISAGREE_PHASE_INHIBITION);
    rig.simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_3', discreteWordWithBits());
    rig.run(5);
    expect(disagree.simVarIsActive.get()).toBe(false);

    // LGCIU discrete word 1 bit 17: LH gear door not closed, on both LGCIUs, for the time of a gear sequence
    for (const lgciu of [1, 2]) {
      rig.simvars.set(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_1`, discreteWordWithBits(17));
    }
    rig.run(DOORS_NOT_CLOSED_CONFIRM_SECONDS - 5);
    expect(doorsNotClosed.simVarIsActive.get()).toBe(false);
    rig.run(10);
    expect(doorsNotClosed.simVarIsActive.get()).toBe(true);
    expect(doorsNotClosed.flightPhaseInhib).toEqual(DOORS_NOT_CLOSED_PHASE_INHIBITION);
  });
});

/* The STATUS of the ATA 32 alerts: GEAR NOT UPLOCKED, LGCIU 1(2) FAULT, LGCIU 1+2 FAULT, BRAKES A/SKID N/WS OFF. */
describe('ATA 32 STATUS', () => {
  it('GEAR NOT UPLOCKED: MAX SPEED 280/.67 with the gear down; INOP SYS L/G RETRACT', () => {
    expect(statusLines(gearNotUplockedStatus(true))).toEqual({
      left: ['MAX SPEED.......280/.67', 'FUEL CONSUMPT INCRSD', 'FMS PRED UNRELIABLE'],
      right: ['INOP SYS', 'L/G RETRACT'],
    });
    expect(statusLines(gearNotUplockedStatus(false)).left).toEqual([]);
  });

  it('LGCIU 1(2) FAULT: ENG 1(2) APPR IDLE ONLY; LGCIU, REVERSER, GPWS with LGCIU 1', () => {
    const page = statusLines(lgciuFaultStatus(1));
    expect(page.left).toEqual(['ENG 1 APPR IDLE ONLY']);
    expect(page.right).toHaveLength(4);
    expect(page.right).toEqual(expect.arrayContaining(['INOP SYS', 'REVERSER 1', 'GPWS', 'LGCIU 1']));
    expect(statusLines(lgciuFaultStatus(2)).right).toContain('LGCIU 2');
    expect(statusLines(lgciuFaultStatus(2)).right).not.toContain('GPWS');
  });

  it('LGCIU 1+2 FAULT: FOR LDG USE FLAP 3, L/G GRVTY EXTN, L/G CONTROL NOT AVAIL; INOP SYS', () => {
    const page = statusLines(lgciu1And2FaultStatus());
    expect(page.left).toEqual(
      expect.arrayContaining([
        'FOR LDG......USE FLAP 3',
        'L/G..........GRVTY EXTN',
        'L/G CONTROL NOT AVAIL',
        'ENG 1 APPR IDLE ONLY',
        'ENG 2 APPR IDLE ONLY',
      ]),
    );
    expect(page.right).toEqual(
      expect.arrayContaining(['REVERSER 1+2', 'AP 1+2', 'CAT 2', 'A/THR', 'LGCIU 1', 'LGCIU 2', 'GPWS']),
    );
  });

  it('A/SKID N/WS OFF: MAX BRK PR, LDG DIST PROC, CAT 3 SINGLE ONLY; BRK Y ACCU PR ONLY with Y SYS LO PR', () => {
    const page = statusLines(antiSkidOffStatus(false));
    expect(page.left).toEqual(['MAX BRK PR.....1000 PSI', 'LDG DIST PROC....APPLY', 'CAT 3 SINGLE ONLY']);
    expect(page.right).toEqual(expect.arrayContaining(['CAT 3 DUAL', 'ANTI SKID', 'N/W STRG', 'NORM BRK', 'AUTO BRK']));
    expect(statusLines(antiSkidOffStatus(true)).left).toContain('BRK Y ACCU PR ONLY');
  });

  it.each([
    ['3200130', gearNotUplockedStatus(false)],
    ['3200180', lgciuFaultStatus(1)],
    ['3200190', lgciuFaultStatus(2)],
    ['3200195', lgciu1And2FaultStatus()],
    ['3200070', antiSkidOffStatus(false)],
  ])('PseudoFWC gives %s its STATUS', (key, status) => {
    const alert = probedFailure(startCruiseFwc().fwc, key);
    expect(alert.statusInfo?.()).toEqual(status.left);
    expect(alert.inopSys?.()).toEqual(status.inopSys);
  });

  it('PseudoFWC gives the A/SKID N/WS OFF STATUS the yellow system low pressure and GEAR NOT UPLOCKED the gear state', () => {
    const rig = startCruiseFwc();
    rig.simvars.set('L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH', 0);
    rig.run(1);
    expect(probedFailure(rig.fwc, '3200070').statusInfo?.()).toEqual(antiSkidOffStatus(true).left);

    for (const lgciu of [1, 2]) {
      rig.simvars.set(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_1`, discreteWordWithBits(23, 24, 25));
    }
    rig.run(1);
    expect(probedFailure(rig.fwc, '3200130').statusInfo?.()).toEqual(gearNotUplockedStatus(true).left);
  });
});
