// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { A320Failure } from '@failures';
import {
  FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
  FUEL_USED_FOB_DISAGREE_CONFIRM_S,
  FUEL_USED_FOB_DISAGREE_PHASE_INHIBITION,
  FuelSystemFaultAlerts,
  FuelSystemFaultFailuresSource,
  FuelSystemFaultInputs,
  FuelSystemFaultKeys,
  isFuelUsedFobDisagree,
  LOW_LEVEL_DETECTION_FAULT_PHASE_INHIBITION,
  nextInitialFob,
  WingOverflowProcedureInputs,
  wingOverflowLines,
} from './FuelSystemFaultAlerts';
import { ewdLines, statusLines } from './FwcAlertSpecHelpers';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, shownCodes, shownText, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements FuelSystemFaultFailuresSource {
  public readonly registered: number[] = [];

  public readonly active = new Set<number>();

  register(identifier: number): void {
    this.registered.push(identifier);
  }

  update(): void {}

  isActive(identifier: number): boolean {
    return this.active.has(identifier);
  }
}

const pbs: WingOverflowProcedureInputs = {
  ctrTkXfrOn: true,
  crossFeedOn: false,
  pump1On: true,
  pump2On: true,
  centreTankEmpty: false,
};

const normal: FuelSystemFaultInputs = {
  apuLpValveFault: false,
  fobKg: 10_000,
  fuelUsedKg: 0,
  onGround: true,
  outerXfrClosed: [false, false],
  outerXfrOpen: [false, false],
  wingTankOverflow: [false, false],
  lowLevelSensorFault: [false, false],
  anyEngineRunning: true,
  overflowProcedure: [pbs, pbs],
};

function activeKeys(alerts: FuelSystemFaultAlerts): string[] {
  return Object.keys(alerts.ewdFailures)
    .filter((key) => alerts.ewdFailures[key].simVarIsActive.get())
    .sort();
}

function item(alerts: FuelSystemFaultAlerts, key: string) {
  return alerts.ewdFailures[key];
}

describe('FUEL APU LP VALVE FAULT', () => {
  it('triggers from the APU LP valve position monitoring, crew awareness', () => {
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    alerts.update({ ...normal, apuLpValveFault: true }, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.apuLpValveFault]);
    expect(ewdLines(item(alerts, FuelSystemFaultKeys.apuLpValveFault))).toEqual(['FUEL APU LP VALVE FAULT']);
    expect(FUEL_SYSTEM_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });
});

describe('FUEL F. USED/FOB DISAGREE', () => {
  it('keeps the initial FOB from the ground and raises it with fuel added in flight', () => {
    expect(nextInitialFob(null, 10_000, 0, true)).toBe(10_000);
    expect(nextInitialFob(10_000, 12_000, 0, true)).toBe(12_000);
    expect(nextInitialFob(12_000, 9_000, 2_500, false)).toBe(12_000);
    expect(nextInitialFob(12_000, 13_000, 500, false)).toBe(13_500);
  });

  it('disagrees when FOB + fuel used is more than 1 500 kg below the initial FOB', () => {
    expect(isFuelUsedFobDisagree(12_000, 8_000, 2_500)).toBe(false);
    expect(isFuelUsedFobDisagree(12_000, 8_000, 2_499)).toBe(true);
  });

  it('triggers after its confirmation time in flight, with FUEL LEAK PROC APPLY, phase 6 only', () => {
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    alerts.update({ ...normal, fobKg: 12_000 }, 100);
    // a leak: 2 000 kg lost without being used by the engines
    const leaking = { ...normal, onGround: false, fobKg: 8_000, fuelUsedKg: 2_000 };
    alerts.update(leaking, 100);
    alerts.update(leaking, FUEL_USED_FOB_DISAGREE_CONFIRM_S * 1000 - 1000);
    expect(activeKeys(alerts)).toEqual([]);
    alerts.update(leaking, 2000);
    alerts.update(leaking, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.fuelUsedFobDisagree]);
    expect(ewdLines(item(alerts, FuelSystemFaultKeys.fuelUsedFobDisagree))).toEqual([
      'FUEL F.USED/FOB DISAGREE',
      ' -FUEL LEAK PROC...APPLY',
    ]);
    expect(FUEL_USED_FOB_DISAGREE_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10]);
  });

  it('does not trigger when the engines burn the fuel', () => {
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    alerts.update({ ...normal, fobKg: 12_000 }, 100);
    const burning = { ...normal, onGround: false, fobKg: 6_000, fuelUsedKg: 6_000 };
    alerts.update(burning, 100);
    alerts.update(burning, FUEL_USED_FOB_DISAGREE_CONFIRM_S * 2000);
    expect(activeKeys(alerts)).toEqual([]);
  });
});

describe('FUEL L (R) OUTER XFR CLOSED / OPEN', () => {
  it('gives OUTER XFR CLOSED with L (R) OUTER TK UNUSABLE on the E/WD and the STATUS', () => {
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    alerts.update({ ...normal, outerXfrClosed: [false, true] }, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.outerXfrClosed[1]]);
    const closed = item(alerts, FuelSystemFaultKeys.outerXfrClosed[1]);
    expect(ewdLines(closed)).toEqual(['FUEL R OUTER XFR CLOSED', ' R OUTER TK UNUSABLE']);
    expect(statusLines({ left: closed.statusInfo(), inopSys: closed.inopSys() }).left).toEqual(['R OUTER TK UNUSABLE']);
  });

  it('gives OUTER XFR OPEN with the INOP SYS L (R) CELL VALVE', () => {
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    alerts.update({ ...normal, outerXfrOpen: [true, false] }, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.outerXfrOpen[0]]);
    const open = item(alerts, FuelSystemFaultKeys.outerXfrOpen[0]);
    expect(ewdLines(open)).toEqual(['FUEL L OUTER XFR OPEN']);
    expect(statusLines({ left: open.statusInfo(), inopSys: open.inopSys() }).right).toEqual([
      'INOP SYS',
      'L CELL VALVE',
    ]);
  });
});

describe('FUEL L (R) WING TK OVERFLOW', () => {
  it('asks for CTR TK XFR OFF first', () => {
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    alerts.update({ ...normal, wingTankOverflow: [true, false] }, 100);
    const overflow = item(alerts, FuelSystemFaultKeys.wingTankOverflow[0]);
    expect(overflow.simVarIsActive.get()).toBe(true);
    expect(ewdLines(overflow)).toEqual(['FUEL L WING TK OVERFLOW', ' -CTR TK L XFR.......OFF']);
    expect(statusLines({ left: overflow.statusInfo(), inopSys: overflow.inopSys() }).right).toEqual([
      'INOP SYS',
      'CTR TK L XFR',
    ]);
  });

  it('then, if unsuccessful with fuel in the centre tank, feeds both engines from the other wing', () => {
    expect(wingOverflowLines({ ...pbs, ctrTkXfrOn: false })).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9]);
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    const done = { ...pbs, ctrTkXfrOn: false, crossFeedOn: true, pump1On: false, pump2On: false };
    alerts.update({ ...normal, wingTankOverflow: [false, true], overflowProcedure: [pbs, done] }, 100);
    expect(ewdLines(item(alerts, FuelSystemFaultKeys.wingTankOverflow[1]))).toEqual([
      'FUEL R WING TK OVERFLOW',
      '   .IF UNSUCCESSFUL:',
      '   .WHEN CTR TK EMPTY:',
      ' -R TK PUMP 1.........ON',
      ' -R TK PUMP 2.........ON',
      ' -FUEL X FEED........OFF',
    ]);
  });

  it('with the centre tank empty, asks to restore the wing pumps and the X FEED', () => {
    expect(
      wingOverflowLines({ ...pbs, ctrTkXfrOn: false, crossFeedOn: true, pump1On: false, centreTankEmpty: true }),
    ).toEqual([0, 6, 7, null, 9]);
  });
});

describe('FUEL LO LVL DET FAULT', () => {
  it('triggers when both low level sensors are failed only', () => {
    const alerts = new FuelSystemFaultAlerts(new TestFailures());
    alerts.update({ ...normal, lowLevelSensorFault: [true, false] }, 100);
    expect(activeKeys(alerts)).toEqual([]);
    alerts.update({ ...normal, lowLevelSensorFault: [true, true] }, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.lowLevelDetectionFault]);
    expect(ewdLines(item(alerts, FuelSystemFaultKeys.lowLevelDetectionFault))).toEqual(['FUEL LO LVL DET FAULT']);
    expect(LOW_LEVEL_DETECTION_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8, 9]);
  });
});

describe('FUEL INERTING SYS FAULT', () => {
  it('triggers from the flyPad failure of the inerting system while an engine runs, crew awareness', () => {
    const failures = new TestFailures();
    const alerts = new FuelSystemFaultAlerts(failures);
    alerts.init();
    expect(failures.registered).toEqual([A320Failure.FuelTankInertingSystem]);

    alerts.update(normal, 100);
    expect(activeKeys(alerts)).toEqual([]);
    failures.active.add(A320Failure.FuelTankInertingSystem);
    alerts.update(normal, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.inertingSystemFault]);

    const inerting = item(alerts, FuelSystemFaultKeys.inertingSystemFault);
    expect(ewdLines(inerting)).toEqual(['FUEL INERTING SYS FAULT']);
    expect(inerting.failure).toBe(1);
    expect(inerting.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(statusLines({ left: inerting.statusInfo(), inopSys: inerting.inopSys() })).toEqual({
      left: [],
      right: ['INOP SYS', 'FUEL INERT'],
    });
  });

  it('works from the engine start to their stop only: no alert with the engines stopped', () => {
    const failures = new TestFailures();
    failures.active.add(A320Failure.FuelTankInertingSystem);
    const alerts = new FuelSystemFaultAlerts(failures);
    alerts.update({ ...normal, anyEngineRunning: false }, 100);
    expect(activeKeys(alerts)).toEqual([]);
  });
});

describe('the real FWC: fuel system fault alerts', () => {
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  it('offers the alerts in the E/WD list and raises FUEL APU LP VALVE FAULT from the systems variable', () => {
    const { fwc } = startCruiseFwc(simvars);
    expect(isAlertTriggered(fwc, FuelSystemFaultKeys.apuLpValveFault)).toBe(false);
    expect(failureItem(fwc, FuelSystemFaultKeys.apuLpValveFault).flightPhaseInhib).toEqual(
      FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
    );

    simvars.set('L:A32NX_FUEL_APU_LP_VALVE_FAULT', 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, FuelSystemFaultKeys.apuLpValveFault)).toBe(true);
    expect(shownText(fwc, FuelSystemFaultKeys.apuLpValveFault)).toEqual(['FUEL APU LP VALVE FAULT']);
  });

  it('gives each wing overflow procedure the CTR TK XFR pb-sw of its own side', () => {
    const { fwc } = startCruiseFwc(simvars);
    simvars.set('L:A32NX_FUEL_L_WING_TK_OVERFLOW', 1);
    simvars.set('L:A32NX_FUEL_R_WING_TK_OVERFLOW', 1);
    runFwc(fwc, 1);
    const [leftKey, rightKey] = FuelSystemFaultKeys.wingTankOverflow;
    expect(isAlertTriggered(fwc, leftKey)).toBe(true);
    expect(isAlertTriggered(fwc, rightKey)).toBe(true);
    // both CTR TK XFR pb-sw ON: the procedure asks for -CTR TK XFR OFF
    expect(shownCodes(fwc, leftKey)).toEqual(['280024001', '280024002']);
    expect(shownCodes(fwc, rightKey)).toEqual(['280024101', '280024102']);

    simvars.set('L:A32NX_OVHD_FUEL_CTR_TK_L_XFR_PB_IS_ON', 0);
    runFwc(fwc, 1);
    expect(shownCodes(fwc, leftKey)).not.toEqual(['280024001', '280024002']);
    expect(shownCodes(fwc, rightKey)).toEqual(['280024101', '280024102']);
  });
});
