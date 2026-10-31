// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import {
  AbnormalRefuelDistributionMonitor,
  autoGndXfrFaultLines,
  FUEL_REFUEL_ALERT_IDS,
  FUEL_REFUEL_INOP_SYS,
  FUEL_REFUEL_PHASE_INHIBITION,
  fuelRefuelAlertEntries,
  FuelRefuelInputs,
  FwsFuelRefuelAlerts,
  PredictedCgMonitor,
  readFuelRefuelInputs,
  RefuelDataFmsMonitor,
  wingTkOverflowLines,
} from './FwsFuelRefuelAlerts';
import { FuelTankProcedureInputs } from './FwsFuelTankAlerts';
import {
  FUEL_MANAGEMENT_ALERT_IDS,
  FuelManagementAlerts,
  fuelManagementAbnormalItems,
  readFuelManagementInputs,
} from './FwsFuelManagementAlerts';
import { FUEL_GAUGING_DEGRADED_TANKS_VAR } from '@shared/FuelQuantityMeasurement';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

const quiet: FuelRefuelInputs = {
  onGround: true,
  enginesRunning: 0,
  apuMasterOn: false,
  apuFeedAbnormallyClosed: false,
  apuFeedAbnormallyOpen: false,
  autoGndXfrPbOn: false,
  autoGndXfrCompleted: false,
  autoGndXfrFault: false,
  refuelRequested: false,
  refuelFault: false,
  refuelIsolValveFault: [false, false],
  wingTkOverflow: [false, false],
  trimTkOverflow: false,
  wbbcFailed: false,
  fmsZfwKg: null,
  fmsZfcgPercentMac: null,
  refuelZfwKg: 0,
  refuelZfcgPercentMac: 0,
  predicted: { grossWeightKg: null, cgPercentMac: null },
  distributionDeviationKg: null,
  allTransferPumpPbsOn: true,
};

const normalSelections: FuelTankProcedureInputs = {
  onGround: true,
  feedMainPbOn: [true, true, true, true],
  feedStbyPbOn: [true, true, true, true],
  crossFeedPbOn: [false, false, false, false],
  outerXfrMan: false,
  midXfrMan: false,
  innerXfrMan: false,
  trimXfrFwd: false,
  trimTankFeedAuto: true,
  emerOuterXfrOn: false,
};

describe('FUEL ABNORM AUTO REFUEL DISTRIBUTION', () => {
  it('shows when a refuel ends with a tank more than 900 lb away from the standard distribution', () => {
    const monitor = new AbnormalRefuelDistributionMonitor();
    expect(monitor.update(true, 1_000, false, true)).toBe(false);
    expect(monitor.update(false, 1_000, false, true)).toBe(true);
  });

  it('is evaluated at the end of the refuel only: later transfers do not change it', () => {
    const monitor = new AbnormalRefuelDistributionMonitor();
    monitor.update(true, 0, false, true);
    expect(monitor.update(false, 100, false, true)).toBe(false);
    expect(monitor.update(false, 5_000, false, true)).toBe(false);
    expect(new AbnormalRefuelDistributionMonitor().update(false, 5_000, false, true)).toBe(false);
  });

  it('the completed ground transfer, a new refuel or the takeoff clear it', () => {
    for (const [refuel, completed, onGround] of [
      [true, false, true],
      [false, true, true],
      [false, false, false],
    ]) {
      const monitor = new AbnormalRefuelDistributionMonitor();
      monitor.update(true, 1_000, false, true);
      monitor.update(false, 1_000, false, true);
      expect(monitor.update(refuel, 1_000, completed, onGround)).toBe(false);
    }
  });
});

describe('FUEL PREDICTED CG OUT OF T.O RANGE', () => {
  it('shows during a refuel predicted outside the takeoff CG limits, until the ground transfer completes', () => {
    const monitor = new PredictedCgMonitor();
    expect(monitor.update(true, { grossWeightKg: 550_000, cgPercentMac: 36 }, false, true)).toBe(true);
    expect(monitor.update(false, { grossWeightKg: null, cgPercentMac: null }, false, true)).toBe(true);
    expect(monitor.update(false, { grossWeightKg: null, cgPercentMac: null }, true, true)).toBe(false);
  });

  it('not for a prediction within the limits', () => {
    expect(new PredictedCgMonitor().update(true, { grossWeightKg: 550_000, cgPercentMac: 40 }, false, true)).toBe(
      false,
    );
  });

  it('320 t at 42.6 % (ZFW 300 t at 43 % with 20 t of fuel) is aft of the takeoff limit', () => {
    expect(new PredictedCgMonitor().update(true, { grossWeightKg: 320_000, cgPercentMac: 42.6 }, false, true)).toBe(
      true,
    );
  });
});

describe('FUEL REFUEL DATA / FMS DISAGREE', () => {
  it('shows when the refuel ZFW changes to another value after the FMS entry', () => {
    const monitor = new RefuelDataFmsMonitor();
    expect(monitor.update(300_000, 36.5, 300_000, 36.5)).toBe(false);
    expect(monitor.update(300_000, 36.5, 310_000, 36.5)).toBe(true);
  });

  it('a new FMS entry clears it', () => {
    const monitor = new RefuelDataFmsMonitor();
    monitor.update(300_000, 36.5, 300_000, 36.5);
    monitor.update(300_000, 36.5, 300_000, 38);
    expect(monitor.update(305_000, 36.5, 300_000, 38)).toBe(false);
  });

  it('not without an FMS entry', () => {
    const monitor = new RefuelDataFmsMonitor();
    monitor.update(null, null, 300_000, 36.5);
    expect(monitor.update(null, null, 310_000, 36.5)).toBe(false);
  });
});

describe('FUEL refuel alert lines', () => {
  it('AUTO GND XFR FAULT after the second engine start: INHIBITED BY SECOND ENG START', () => {
    const lines = autoGndXfrFaultLines({ ...quiet, enginesRunning: 2, autoGndXfrPbOn: true }, normalSelections);
    expect(lines.show).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(lines.checked.slice(0, 4)).toEqual([true, false, false, false]);
  });

  it('AUTO GND XFR FAULT without the FMS ZFW: FMS ZFW OR ZFWCG VALUES and the pump and transfer lines', () => {
    const lines = autoGndXfrFaultLines(
      { ...quiet, allTransferPumpPbsOn: false },
      { ...normalSelections, crossFeedPbOn: [true, false, false, false], trimXfrFwd: true },
    );
    expect(lines.show).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(lines.checked.slice(4)).toEqual([true, true, false, false, false, true, true, true, false, true]);
  });

  it('WING TK OVERFLOW: the transfers back to AUTO after a manual selection, else FUEL XFR : MAN ONLY', () => {
    expect(wingTkOverflowLines(true, true, { ...normalSelections, innerXfrMan: true })).toEqual({
      show: [true, true, true, true, true, true, true, false, false],
      checked: [false, true, true, true, true, false, true, false, false],
    });
    expect(wingTkOverflowLines(false, false, normalSelections).show).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('FwsFuelRefuelAlerts', () => {
  it('raises each alert from its input', () => {
    const alerts = new FwsFuelRefuelAlerts();
    alerts.update(
      {
        ...quiet,
        apuFeedAbnormallyClosed: true,
        apuFeedAbnormallyOpen: true,
        autoGndXfrCompleted: true,
        autoGndXfrFault: true,
        refuelFault: true,
        refuelIsolValveFault: [false, true],
        wingTkOverflow: [true, false],
        trimTkOverflow: true,
        wbbcFailed: true,
      },
      normalSelections,
    );
    for (const alert of [
      alerts.apuFeedFault,
      alerts.apuFeedVlvNotClosed,
      alerts.autoGndXfrCompleted,
      alerts.autoGndXfrFault,
      alerts.refuelFault,
      alerts.refuelDefuelSysFault,
      alerts.wingTkOverflow,
      alerts.trimTkOverflow,
      alerts.weightBalanceBkupFault,
    ]) {
      expect(alert.get()).toBe(true);
    }
  });

  it('remembers whether a manual transfer was selected when WING TK OVERFLOW triggered', () => {
    const alerts = new FwsFuelRefuelAlerts();
    alerts.update({ ...quiet, wingTkOverflow: [false, true] }, { ...normalSelections, midXfrMan: true });
    alerts.update({ ...quiet, wingTkOverflow: [false, true] }, normalSelections);
    expect(alerts.manualTransferAtWingOverflow).toBe(true);
  });

  it('gives the abnormal sensed entries with their phase inhibitions, levels and INOP SYS', () => {
    const alerts = new FwsFuelRefuelAlerts();
    const entries = fuelRefuelAlertEntries(alerts);
    const ids = FUEL_REFUEL_ALERT_IDS;
    expect(Object.keys(entries).sort()).toEqual(Object.values(ids).map(String).sort());
    expect(entries[ids.refuelFault].failure).toBe(1);
    expect(entries[ids.weightBalanceBkupFault].failure).toBe(1);
    expect(entries[ids.wingTkOverflow].failure).toBe(2);
    expect(entries[ids.apuFeedFault].flightPhaseInhib).toEqual(FUEL_REFUEL_PHASE_INHIBITION.apuFeedFault);
    expect(entries[ids.apuFeedFault].inopSysAllPhases?.([])).toEqual([FUEL_REFUEL_INOP_SYS.apu]);
    expect(entries[ids.autoGndXfrFault].whichItemsToShow()).toHaveLength(14);
    expect(entries[ids.wingTkOverflow].whichItemsToShow()).toHaveLength(9);
    // In flight the overflow and APU feed alerts are not inhibited in cruise (phase 8), the refuel ones are
    expect(FUEL_REFUEL_PHASE_INHIBITION.wingTkOverflow).not.toContain(8);
    expect(FUEL_REFUEL_PHASE_INHIBITION.refuelFault).toContain(8);
  });
});

describe('readFuelRefuelInputs', () => {
  const arinc = (value: number, ssm: Arinc429SignStatusMatrix) => {
    const register = Arinc429Register.empty();
    register.setValue(value);
    register.setSsm(ssm);
    return register.rawWord;
  };

  it('reads the systems outputs, the FMS ZFW and the WBBC failure warning', () => {
    const vars = new Map<string, number>([
      ['L:A380X_FUEL_TRIM_TK_OVERFLOW', 1],
      ['L:A32NX_FM2_ZERO_FUEL_WEIGHT', arinc(300_000, Arinc429SignStatusMatrix.NormalOperation)],
      ['L:A380X_WBBC_GROSS_WEIGHT', arinc(0, Arinc429SignStatusMatrix.FailureWarning)],
      ['L:A32NX_FQMS_REFUEL_DISTRIBUTION_DEVIATION', arinc(500, Arinc429SignStatusMatrix.NormalOperation)],
    ]);
    const inputs = readFuelRefuelInputs((name) => vars.get(name) ?? 0, true, 0, false);
    expect(inputs.trimTkOverflow).toBe(true);
    expect(inputs.fmsZfwKg).toBe(300_000);
    expect(inputs.fmsZfcgPercentMac).toBe(null);
    expect(inputs.wbbcFailed).toBe(true);
    expect(inputs.distributionDeviationKg).toBe(500);
    expect(inputs.allTransferPumpPbsOn).toBe(false);
  });
});

describe('FUEL refuel alert wiring', () => {
  it('the ata28 procedures have the lines of their alert', () => {
    const entries = fuelRefuelAlertEntries(new FwsFuelRefuelAlerts());
    for (const id of Object.values(FUEL_REFUEL_ALERT_IDS)) {
      expect(EcamAbnormalProcedures[id].items).toHaveLength(entries[id].whichItemsToShow().length);
    }
  });

  it('the FWS lists the alerts in its abnormal sensed table, on the refuel alerts of the core', () => {
    const { core } = createFws();
    for (const id of Object.values(FUEL_REFUEL_ALERT_IDS)) {
      expect(core.abnormalSensed.ewdAbnormalSensed[id]).toBeDefined();
    }
    expect(core.abnormalSensed.ewdAbnormalSensed[FUEL_REFUEL_ALERT_IDS.trimTkOverflow].simVarIsActive).toBe(
      core.fuelRefuelAlerts.trimTkOverflow,
    );
  });

  it('the FWS reads the systems outputs into the alerts on every update', () => {
    const { core, simVars } = createFws();
    core.startupCompleted.set(true);
    simVars.set('L:A380X_FUEL_TRIM_TK_OVERFLOW', 1);
    core.update(1000);
    expect(core.fuelRefuelAlerts.trimTkOverflow.get()).toBe(true);
    simVars.set('L:A380X_FUEL_TRIM_TK_OVERFLOW', 0);
    core.update(1000);
    expect(core.fuelRefuelAlerts.trimTkOverflow.get()).toBe(false);
  });

  it('the INOP SYS lines exist', () => {
    for (const key of [FUEL_REFUEL_INOP_SYS.refuel, FUEL_REFUEL_INOP_SYS.wbbc, FUEL_REFUEL_INOP_SYS.autoGndXfr]) {
      expect(EcamInopSys[key]).toBeDefined();
    }
  });

  it('FUEL AUTO GND XFR is one INOP SYS line, shared with the fuel quantity alerts', () => {
    const keys = Object.keys(EcamInopSys).filter((key) => EcamInopSys[key] === '\x1b<4mFUEL AUTO GND XFR');
    expect(keys).toEqual([FUEL_REFUEL_INOP_SYS.autoGndXfr]);
    // The gauging fault takes it away on ground, with the same message
    const management = new FuelManagementAlerts();
    const trimTankDegraded = 1024;
    management.update(
      readFuelManagementInputs(
        (name) => (name === FUEL_GAUGING_DEGRADED_TANKS_VAR ? trimTankDegraded : 0),
        () => false,
        true,
        0,
      ),
      1,
    );
    const gaugingFault = fuelManagementAbnormalItems(management)[FUEL_MANAGEMENT_ALERT_IDS.gaugingFault];
    expect(management.gaugingFault.get()).toBe(true);
    expect(gaugingFault.inopSysAllPhases?.([])).toContain(FUEL_REFUEL_INOP_SYS.autoGndXfr);
  });

  it('the systems host runs the systems of the alerts', () => {
    // SystemsHost cannot be built in vitest (it needs the sim), so its source text is read
    const systemsHost = readFileSync(resolve(__dirname, '../../SystemsHost.ts'), 'utf-8');
    for (const instrument of ['FuelApuFeed', 'FuelOverflow', 'FuelRefuelFaults']) {
      expect(systemsHost).toContain(`addInstrument('${instrument}'`);
    }
  });
});
