// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
  FUEL_USED_FOB_DISAGREE_CONFIRM_S,
  FUEL_USED_FOB_DISAGREE_PHASE_INHIBITION,
  FuelSystemFaultAlerts,
  FuelSystemFaultInputs,
  FuelSystemFaultKeys,
  isFuelUsedFobDisagree,
  LOW_LEVEL_DETECTION_FAULT_PHASE_INHIBITION,
  nextInitialFob,
  WingOverflowProcedureInputs,
  wingOverflowLines,
} from './FuelSystemFaultAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

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
    const alerts = new FuelSystemFaultAlerts();
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
    const alerts = new FuelSystemFaultAlerts();
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
    const alerts = new FuelSystemFaultAlerts();
    alerts.update({ ...normal, fobKg: 12_000 }, 100);
    const burning = { ...normal, onGround: false, fobKg: 6_000, fuelUsedKg: 6_000 };
    alerts.update(burning, 100);
    alerts.update(burning, FUEL_USED_FOB_DISAGREE_CONFIRM_S * 2000);
    expect(activeKeys(alerts)).toEqual([]);
  });
});

describe('FUEL L (R) OUTER XFR CLOSED / OPEN', () => {
  it('gives OUTER XFR CLOSED with L (R) OUTER TK UNUSABLE on the E/WD and the STATUS', () => {
    const alerts = new FuelSystemFaultAlerts();
    alerts.update({ ...normal, outerXfrClosed: [false, true] }, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.outerXfrClosed[1]]);
    const closed = item(alerts, FuelSystemFaultKeys.outerXfrClosed[1]);
    expect(ewdLines(closed)).toEqual(['FUEL R OUTER XFR CLOSED', ' R OUTER TK UNUSABLE']);
    expect(statusLines({ left: closed.statusInfo(), inopSys: closed.inopSys() }).left).toEqual(['R OUTER TK UNUSABLE']);
  });

  it('gives OUTER XFR OPEN with the INOP SYS L (R) CELL VALVE', () => {
    const alerts = new FuelSystemFaultAlerts();
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
    const alerts = new FuelSystemFaultAlerts();
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
    const alerts = new FuelSystemFaultAlerts();
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
    const alerts = new FuelSystemFaultAlerts();
    alerts.update({ ...normal, lowLevelSensorFault: [true, false] }, 100);
    expect(activeKeys(alerts)).toEqual([]);
    alerts.update({ ...normal, lowLevelSensorFault: [true, true] }, 100);
    expect(activeKeys(alerts)).toEqual([FuelSystemFaultKeys.lowLevelDetectionFault]);
    expect(ewdLines(item(alerts, FuelSystemFaultKeys.lowLevelDetectionFault))).toEqual(['FUEL LO LVL DET FAULT']);
    expect(LOW_LEVEL_DETECTION_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8, 9]);
  });
});

describe('PseudoFWC fuel system fault alerts', () => {
  it('is wired in the PseudoFWC', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.fuelSystemFaultAlerts.ewdFailures');
    expect(fwc).toContain('this.fuelSystemFaultAlerts.update(');
    expect(fwc).toContain('readFuelSystemFaultInputs(this.aircraftOnGround.get()');
  });
});
