// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { SdPages } from '@shared/EcamSystemPages';
import {
  DC_ESS_BUS_PART_FAULT_DEFERRED_KEY,
  DC_ESS_BUS_PART_FAULT_STATUS,
  ELEC_SUPPLY_CENTRE_ALERT_KEYS,
  ELEC_SUPPLY_CENTRE_PHASE_INHIBITION,
  elecSupplyCentreAbnormalItems,
  elecSupplyCentreAlertFlags,
  ElecSupplyCentreAlerts,
  elecSupplyCentreDeferredItems,
  ElecSupplyCentreInputs,
  FlightOpsSupplyMemory,
  networkManagementFaultInopSys,
  primarySupplyCentreFaultInopSys,
  readElecSupplyCentreInputs,
} from './FwsElecSupplyCentreAlerts';
import {
  EcamAbnormalProcedures,
  EcamDeferredProcedures,
  EcamInfos,
  EcamInopSys,
  EcamLimitations,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { DeferredProcedureType } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/EcamProcedureTypes';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const ESCAPE = String.fromCharCode(27);
const COLOR_CODE = new RegExp(`${ESCAPE}(<\\dm|4m|'m|m)`, 'g');

/** Text of a line of an EcamMessages table, without its ECAM colour code */
function text(table: 'EcamInopSys' | 'EcamInfos' | 'EcamLimitations', key: string): string | undefined {
  const lines = { EcamInopSys, EcamInfos, EcamLimitations }[table];
  return lines[key]?.replace(new RegExp(`^${ESCAPE}<\\d+m`), '').trim();
}

/** Title (without the ELEC prefix and colour codes) and item names of an ECAM procedure */
function procedure(key: number): { title: string; items: string[] } | undefined {
  const found = EcamAbnormalProcedures[key];
  if (!found) {
    return undefined;
  }
  return {
    title: found.title.replace(new RegExp(`^${ESCAPE}<\\dm${ESCAPE}4mELEC${ESCAPE}m `), '').replace(COLOR_CODE, ''),
    items: found.items.map((item) => item.name),
  };
}

/** Inputs of a normal aircraft in flight: no failure, AC and DC network supplied, ELMU, COMMERCIAL and remote C/B normal */
function normal(): ElecSupplyCentreInputs {
  return {
    primarySupplyCentreFailed: [false, false],
    networkManagementUnitFailed: [false, false],
    loadManagementUnitFailed: false,
    elmuPbOff: false,
    secondarySupplyCentreFailed: [false, false],
    secondarySupplyCentreCommunicationDegraded: [false, false],
    secondarySupplyCentreRedundancyLost: [false, false],
    secondarySupplyCentreFanFailed: [false, false],
    cabinSupplyCentreOverheat: [false, false],
    cabinSupplyCentreOverheatDetectionFailed: [false, false],
    commercialOff: [false, false],
    cbMonitoringFailed: false,
    emerCbMonitoringFailed: false,
    cbTripped: false,
    remoteCbControlOn: false,
    dcEssBusPartLost: false,
    dc1BusPowered: true,
    dcEssBusPowered: true,
    acEhaBusPowered: true,
    anyMainAcBusPowered: true,
    onGround: false,
    flightPhase: 8,
  };
}

/** FwsCore state read by the DC ESS BUS PART FAULT lines */
function dcEssPartContext() {
  return {
    airKnob: Subject.create(1),
    tawsWxrSelected: Subject.create(1),
    fuelEmerOutrTkXfrOn: Subject.create(false),
    feedTanks1And4BelowEmerOutrXfrThreshold: Subject.create(false),
  };
}

const keys = ELEC_SUPPLY_CENTRE_ALERT_KEYS;

describe('ELEC supply centre alert conditions', () => {
  it('raises no alert on a normal aircraft', () => {
    const flags = elecSupplyCentreAlertFlags(normal());
    for (const flag of Object.values(flags)) {
      expect([flag].flat().some((f) => f)).toBe(false);
    }
  });

  it('raises the supply centre, ENMU, ELMU and C/B monitoring alerts from their failures', () => {
    const flags = elecSupplyCentreAlertFlags({
      ...normal(),
      primarySupplyCentreFailed: [false, true],
      networkManagementUnitFailed: [true, false],
      loadManagementUnitFailed: true,
      secondarySupplyCentreFailed: [true, false],
      secondarySupplyCentreFanFailed: [false, true],
      cbMonitoringFailed: true,
      emerCbMonitoringFailed: true,
      remoteCbControlOn: true,
    });
    expect(flags.primarySupplyCentreFault).toEqual([false, true]);
    expect(flags.networkManagementFault).toEqual([true, false]);
    expect(flags.loadManagementFault).toBe(true);
    expect(flags.secondarySupplyCentreFault).toEqual([true, false]);
    expect(flags.secondarySupplyCentreFanFault).toEqual([false, true]);
    expect(flags.cbMonitoringFault).toBe(true);
    expect(flags.emerCbMonitoringFault).toBe(true);
    expect(flags.remoteCbControlActive).toBe(true);
  });

  it('does not raise DEGRADED or REDUND LOST of a secondary supply centre that has its FAULT', () => {
    const lost: ElecSupplyCentreInputs = {
      ...normal(),
      secondarySupplyCentreCommunicationDegraded: [true, true],
      secondarySupplyCentreRedundancyLost: [true, true],
    };
    expect(elecSupplyCentreAlertFlags(lost).secondarySupplyCentreDegraded).toEqual([true, true]);
    expect(elecSupplyCentreAlertFlags(lost).secondarySupplyCentreRedundancyLost).toEqual([true, true]);

    const withFault = elecSupplyCentreAlertFlags({ ...lost, secondarySupplyCentreFailed: [true, false] });
    expect(withFault.secondarySupplyCentreDegraded).toEqual([false, true]);
    expect(withFault.secondarySupplyCentreRedundancyLost).toEqual([false, true]);
  });

  it('raises CABIN SUPPLY CENTER OVHT only while the overheat detectors of that side work', () => {
    const overheat: ElecSupplyCentreInputs = { ...normal(), cabinSupplyCentreOverheat: [true, true] };
    expect(elecSupplyCentreAlertFlags(overheat).cabinSupplyCentreOverheat).toEqual([true, true]);

    const detectorFailed = elecSupplyCentreAlertFlags({
      ...overheat,
      cabinSupplyCentreOverheatDetectionFailed: [true, false],
    });
    expect(detectorFailed.cabinSupplyCentreOverheat).toEqual([false, true]);
    expect(detectorFailed.cabinSupplyCentreOverheatDetFault).toEqual([true, false]);
  });

  it('raises C/B TRIPPED only while the C/B monitoring function works', () => {
    expect(elecSupplyCentreAlertFlags({ ...normal(), cbTripped: true }).cbTripped).toBe(true);
    expect(elecSupplyCentreAlertFlags({ ...normal(), cbTripped: true, cbMonitoringFailed: true }).cbTripped).toBe(
      false,
    );
  });

  it('raises DC ESS BUS PART FAULT only while the DC ESS busbar is still supplied', () => {
    expect(elecSupplyCentreAlertFlags({ ...normal(), dcEssBusPartLost: true }).dcEssBusPartFault).toBe(true);
    expect(
      elecSupplyCentreAlertFlags({ ...normal(), dcEssBusPartLost: true, dcEssBusPowered: false }).dcEssBusPartFault,
    ).toBe(false);
  });

  it('raises F/CTL ACTUATOR PWR SUPPLY FAULT when the AC EHA busbar is lost with the AC network supplied', () => {
    expect(elecSupplyCentreAlertFlags({ ...normal(), acEhaBusPowered: false }).fctlActuatorPowerSupplyFault).toBe(true);
    expect(
      elecSupplyCentreAlertFlags({ ...normal(), acEhaBusPowered: false, anyMainAcBusPowered: false })
        .fctlActuatorPowerSupplyFault,
    ).toBe(false);
  });

  it('senses the flight ops supply by DC ESS with DC 1 lost in flight only', () => {
    expect(elecSupplyCentreAlertFlags({ ...normal(), dc1BusPowered: false }).flightOpsOnDcEss).toBe(true);
    expect(elecSupplyCentreAlertFlags({ ...normal(), dc1BusPowered: false, onGround: true }).flightOpsOnDcEss).toBe(
      false,
    );
    expect(
      elecSupplyCentreAlertFlags({ ...normal(), dc1BusPowered: false, dcEssBusPowered: false }).flightOpsOnDcEss,
    ).toBe(false);
  });
});

describe('ELEC ABNORMAL FLIGHT OPS SUPPLY memory', () => {
  it('keeps the abnormal supply of the flight after landing, until the first engine start of the next flight', () => {
    const memory = new FlightOpsSupplyMemory();
    expect(memory.update(false, 8)).toBe(false);
    expect(memory.update(true, 8)).toBe(true);
    // DC 1 back, landing, engines shut down
    expect(memory.update(false, 9)).toBe(true);
    expect(memory.update(false, 12)).toBe(true);
    expect(memory.update(false, 1)).toBe(true);
    expect(memory.update(false, 2)).toBe(false);
    expect(memory.update(false, 3)).toBe(false);
  });
});

describe('reading the inputs', () => {
  it('reads the flyPad failures, the pb-sw and the busbar L:vars', () => {
    const on = new Set([
      'L:A380X_OVHD_ELEC_ELMU_PB_IS_OFF',
      'L:A380X_OVHD_ELEC_COMMERCIAL_2_PB_IS_OFF',
      'L:A380X_REMOTE_CB_CTRL',
      'L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED',
      'L:A32NX_ELEC_AC_3_BUS_IS_POWERED',
    ]);
    const failures = new Set([
      24200, 24203, 24204, 24211, 24212, 24215, 24216, 24218, 24221, 24222, 24223, 24224, 24225,
    ]);
    const inputs = readElecSupplyCentreInputs(
      (name) => (on.has(name) ? 1 : 0),
      (failure) => failures.has(failure),
      false,
      8,
    );
    expect(inputs).toEqual({
      primarySupplyCentreFailed: [true, false],
      networkManagementUnitFailed: [false, true],
      loadManagementUnitFailed: true,
      elmuPbOff: true,
      secondarySupplyCentreFailed: [false, true],
      secondarySupplyCentreCommunicationDegraded: [true, false],
      secondarySupplyCentreRedundancyLost: [false, true],
      secondarySupplyCentreFanFailed: [true, false],
      cabinSupplyCentreOverheat: [true, false],
      cabinSupplyCentreOverheatDetectionFailed: [false, true],
      // COMMERCIAL 1 pb-sw is "IS_ON": 0 is OFF
      commercialOff: [true, true],
      cbMonitoringFailed: true,
      emerCbMonitoringFailed: true,
      cbTripped: true,
      remoteCbControlOn: true,
      dcEssBusPartLost: true,
      dc1BusPowered: false,
      dcEssBusPowered: true,
      acEhaBusPowered: false,
      anyMainAcBusPowered: true,
      onGround: false,
      flightPhase: 8,
    });
  });
});

describe('STATUS of the ELEC supply centre alerts', () => {
  it('lists the ENMU, its APU generator, on ground its external power units, and PART GALLEY', () => {
    expect(networkManagementFaultInopSys(0, true).map((key) => text('EcamInopSys', key))).toEqual([
      'ENMU 1',
      'APU GEN A',
      'EXT PWR 1',
      'EXT PWR 2',
      'PART GALLEY',
    ]);
    expect(networkManagementFaultInopSys(1, false).map((key) => text('EcamInopSys', key))).toEqual([
      'ENMU 2',
      'APU GEN B',
      'PART GALLEY',
    ]);
  });

  it('lists PART COMMERCIAL for one failed primary supply centre and COMMERCIAL for both', () => {
    expect(primarySupplyCentreFaultInopSys(0, false).map((key) => text('EcamInopSys', key))).toEqual([
      'ELEC PRIMARY CTR 1',
      'PART COMMERCIAL',
    ]);
    expect(primarySupplyCentreFaultInopSys(1, true).map((key) => text('EcamInopSys', key))).toEqual([
      'ELEC PRIMARY CTR 2',
      'COMMERCIAL',
    ]);
  });

  it('gives DC ESS BUS PART FAULT the STATUS of the aircraft', () => {
    expect(DC_ESS_BUS_PART_FAULT_STATUS.inopSysAllPhases.map((key) => text('EcamInopSys', key))).toEqual([
      'PART SPLRs',
      'PRIM 1',
      'SEC 1',
      'ADR 1',
      'WXR 1',
      'FEED TK 2 MAIN PMP',
      'AUTO REFUEL',
      'FUEL AUTO GND XFR',
      'LOUDSPEAKERS',
      'CAPT EFIS CTL',
      'RECORDER SYS',
    ]);
    // AUTO REFUEL and FUEL AUTO GND XFR are the fuel alerts' STATUS lines: one line when both alerts are active
    for (const inopSys of ['AUTO REFUEL', 'FUEL AUTO GND XFR']) {
      const keys = Object.keys(EcamInopSys).filter((id) => EcamInopSys[id] === `${ESCAPE}<4m${inopSys}`);
      expect(keys).toHaveLength(1);
      expect(DC_ESS_BUS_PART_FAULT_STATUS.inopSysAllPhases).toContain(keys[0]);
    }
    expect(DC_ESS_BUS_PART_FAULT_STATUS.inopSysApprLdg.map((key) => text('EcamInopSys', key))).toEqual([
      'SLAT SYS 1',
      'BTV',
      'CAT 2',
      'TAWS 1',
    ]);
    expect(DC_ESS_BUS_PART_FAULT_STATUS.info.map((key) => text('EcamInfos', key))).toEqual([
      'LDG DIST COEF < 1.45 ON DRY RUNWAY',
      'CAPT KEYBOARD CURSOR CTL AVAIL',
    ]);
    expect(DC_ESS_BUS_PART_FAULT_STATUS.limitationsApprLdg.map((key) => text('EcamLimitations', key))).toEqual([
      'SLATS SLOW',
      'LDG DIST AFFECTED',
    ]);
  });
});

describe('ELEC supply centre alert entries (FwsAbnormalSensed)', () => {
  it('uses the flight phase inhibitions of the aircraft', () => {
    const allButOneAndTwelve = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expect(ELEC_SUPPLY_CENTRE_PHASE_INHIBITION).toEqual({
      abnormalFlightOpsSupply: allButOneAndTwelve,
      cbMonitoringFault: allButOneAndTwelve,
      cbTripped: [3, 4, 5, 6, 7, 9, 10],
      cabinSupplyCentreOverheat: [4, 5, 6, 7, 9, 10],
      cabinSupplyCentreOverheatDetFault: allButOneAndTwelve,
      dcEssBusPartFault: [3, 4, 5, 6, 7, 9, 10],
      networkManagementFault: [3, 4, 5, 6, 7, 9, 10],
      emerCbMonitoringFault: allButOneAndTwelve,
      fctlActuatorPowerSupplyFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      loadManagementFault: [3, 4, 5, 6, 7, 9, 10, 11],
      primarySupplyCentreFault: allButOneAndTwelve,
      remoteCbControlActive: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      secondarySupplyCentre: allButOneAndTwelve,
    });
  });

  it('has one entry per alert, each with its ECAM procedure title, level, SD page and one shown line per item', () => {
    const items = elecSupplyCentreAbnormalItems(new ElecSupplyCentreAlerts(), dcEssPartContext());
    const expected: [number, string, number, SdPages][] = [
      [240800001, 'ABNORMAL FLIGHT OPS SUPPLY', 1, SdPages.None],
      [240800020, 'C/B MONITORING FAULT', 1, SdPages.None],
      [240800021, 'C/B TRIPPED', 2, SdPages.None],
      [240800022, 'CABIN L SUPPLY CENTER OVHT', 2, SdPages.None],
      [240800023, 'CABIN R SUPPLY CENTER OVHT', 2, SdPages.None],
      [240800024, 'CABIN L SUPPLY CTR OVHT DET FAULT', 1, SdPages.None],
      [240800025, 'CABIN R SUPPLY CTR OVHT DET FAULT', 1, SdPages.None],
      [240800031, 'DC ESS BUS PART FAULT', 2, SdPages.ElecDc],
      [240800052, 'ELEC NETWORK MANAGEMENT 1 FAULT', 2, SdPages.ElecAc],
      [240800053, 'ELEC NETWORK MANAGEMENT 2 FAULT', 2, SdPages.ElecAc],
      [240800054, 'EMER C/B MONITORING FAULT', 1, SdPages.None],
      [240800060, 'F/CTL ACTUATOR PWR SUPPLY FAULT', 1, SdPages.Fctl],
      [240800069, 'LOAD MANAGEMENT FAULT', 2, SdPages.ElecAc],
      [240800070, 'PRIMARY SUPPLY CENTER 1 FAULT', 1, SdPages.None],
      [240800071, 'PRIMARY SUPPLY CENTER 2 FAULT', 1, SdPages.None],
      [240800073, 'REMOTE C/B CTL ACTIVE', 2, SdPages.None],
      [240800074, 'SECONDARY SUPPLY CENTER 1 DEGRADED', 1, SdPages.None],
      [240800075, 'SECONDARY SUPPLY CENTER 2 DEGRADED', 1, SdPages.None],
      [240800076, 'SECONDARY SUPPLY CENTER 1 FAULT', 1, SdPages.None],
      [240800077, 'SECONDARY SUPPLY CENTER 2 FAULT', 1, SdPages.None],
      [240800078, 'SECONDARY SUPPLY CTR 1 REDUND LOST', 1, SdPages.None],
      [240800079, 'SECONDARY SUPPLY CTR 2 REDUND LOST', 1, SdPages.None],
      [240800092, 'SECONDARY SUPPLY CENTER 1 FAN FAULT', 1, SdPages.None],
      [240800093, 'SECONDARY SUPPLY CENTER 2 FAN FAULT', 1, SdPages.None],
    ];
    expect(Object.keys(items).map(Number).sort()).toEqual(expected.map(([key]) => key).sort());
    for (const [key, title, level, sysPage] of expected) {
      expect(procedure(key)?.title).toBe(title);
      expect(items[key].failure).toBe(level);
      expect(items[key].sysPage).toBe(sysPage);
      expect(items[key].whichItemsToShow().length).toBe(procedure(key)?.items.length);
      expect(items[key].whichItemsChecked().length).toBe(procedure(key)?.items.length);
    }
    expect(procedure(240800022)?.items).toEqual(['COMMERCIAL 1']);
    expect(procedure(240800052)?.items).toEqual(['GEN 1+2 : KEEP ON']);
    expect(procedure(240800069)?.items).toEqual(['ELMU']);
    expect(procedure(240800073)?.items).toEqual(['REMOTE C/B CTL']);
  });

  it('ticks COMMERCIAL n OFF, ELMU OFF and REMOTE C/B CTL OFF from the pb-sw', () => {
    const alerts = new ElecSupplyCentreAlerts();
    const items = elecSupplyCentreAbnormalItems(alerts, dcEssPartContext());
    alerts.update({ ...normal(), cabinSupplyCentreOverheat: [false, true], loadManagementUnitFailed: true });
    expect(alerts.cabinSupplyCentreOverheat[1].get()).toBe(true);
    expect(items[keys.cabinSupplyCentreOverheat[1]].whichItemsChecked()).toEqual([false]);
    expect(items[keys.loadManagementFault].whichItemsChecked()).toEqual([false]);

    alerts.update({
      ...normal(),
      cabinSupplyCentreOverheat: [false, true],
      loadManagementUnitFailed: true,
      commercialOff: [false, true],
      elmuPbOff: true,
    });
    expect(items[keys.cabinSupplyCentreOverheat[1]].whichItemsChecked()).toEqual([true]);
    expect(items[keys.cabinSupplyCentreOverheat[0]].whichItemsChecked()).toEqual([false]);
    expect(items[keys.loadManagementFault].whichItemsChecked()).toEqual([true]);
    expect(items[keys.loadManagementFault].inopSysAllPhases?.([true])).toEqual(['240300024']);

    alerts.update({ ...normal(), remoteCbControlOn: true });
    expect(alerts.remoteCbControlActive.get()).toBe(true);
    expect(items[keys.remoteCbControlActive].whichItemsChecked()).toEqual([false]);
  });

  it('gives the ENMU, primary and secondary supply centre alerts their STATUS', () => {
    const alerts = new ElecSupplyCentreAlerts();
    const items = elecSupplyCentreAbnormalItems(alerts, dcEssPartContext());
    alerts.update({ ...normal(), onGround: true, primarySupplyCentreFailed: [true, true] });
    expect(items[keys.networkManagementFault[1]].inopSysAllPhases?.([false])).toEqual(
      networkManagementFaultInopSys(1, true),
    );
    expect(items[keys.primarySupplyCentreFault[0]].inopSysAllPhases?.([])).toEqual(['240300025', '240300027']);
    expect(items[keys.secondarySupplyCentreFault[1]].inopSysAllPhases?.([])).toEqual(['240300031']);
    expect(items[keys.secondarySupplyCentreDegraded[0]].inopSysAllPhases?.([])).toEqual(['240300030']);
    expect(
      items[keys.secondarySupplyCentreFanFault[1]].inopSysAllPhases?.([]).map((k) => text('EcamInopSys', k ?? '')),
    ).toEqual(['ELEC SEC CTR 2 FAN']);
    expect(
      items[keys.secondarySupplyCentreRedundancyLost[0]].redundLoss?.([]).map((k) => text('EcamInopSys', k ?? '')),
    ).toEqual(['PART ELEC SEC CTR 1']);
    expect(items[keys.cbMonitoringFault].inopSysAllPhases?.([]).map((k) => text('EcamInopSys', k ?? ''))).toEqual([
      'C/B MONITORING',
    ]);
    expect(items[keys.emerCbMonitoringFault].inopSysAllPhases?.([]).map((k) => text('EcamInopSys', k ?? ''))).toEqual([
      'EMER C/B MONITORING',
    ]);
  });

  it('shows the DC ESS BUS PART FAULT fuel lines with low feed tanks and the after landing lines below 80 kt', () => {
    const alerts = new ElecSupplyCentreAlerts();
    const fws = dcEssPartContext();
    const item = elecSupplyCentreAbnormalItems(alerts, fws)[keys.dcEssBusPartFault];
    expect(procedure(keys.dcEssBusPartFault)?.items).toEqual([
      'FOR TAXI : FLAPS SELECT CONF 1+F',
      'AIR DATA SWTG',
      'HEADSETS',
      'WXR & TAWS',
      'DU RECONF P/B AVAIL',
      'CAPT KEYBOARD CURSOR CTL AVAIL',
      'ECP KEYS NOT AVAIL :',
      'SYSTEMS, MORE, TO CONFIG, RCL LAST',
      'FOR SYS PAGES : "ALL" AVAIL',
      'SLATS SLOW',
      'LDG DIST AFFECTED',
      'EMER OUTR TK XFR',
      'EXPECT FEED TKS IMBALANCE',
      'FUEL MAN BALANCING PROC',
      'BEFORE LAST ENG SHUTDOWN :',
      'IR 1 MODE SEL',
    ]);
    alerts.update({ ...normal(), dcEssBusPartLost: true });
    expect(alerts.dcEssBusPartFault.get()).toBe(true);
    expect(item.whichItemsToShow().slice(11)).toEqual([false, false, false, false, false]);

    fws.feedTanks1And4BelowEmerOutrXfrThreshold.set(true);
    fws.fuelEmerOutrTkXfrOn.set(true);
    fws.airKnob.set(0);
    fws.tawsWxrSelected.set(2);
    expect(item.whichItemsToShow().slice(11)).toEqual([true, true, true, false, false]);
    const checked = item.whichItemsChecked();
    expect([checked[1], checked[3], checked[11]]).toEqual([true, true, true]);

    alerts.update({ ...normal(), dcEssBusPartLost: true, onGround: true, flightPhase: 11 });
    expect(item.whichItemsToShow().slice(14)).toEqual([true, true]);
    expect(item.limitationsApprLdg?.([])).toEqual(DC_ESS_BUS_PART_FAULT_STATUS.limitationsApprLdg);
  });

  it('has the FOR APPROACH deferred procedure of DC ESS BUS PART FAULT', () => {
    const deferred = elecSupplyCentreDeferredItems()[DC_ESS_BUS_PART_FAULT_DEFERRED_KEY];
    expect(deferred.whichItemsToShow()).toEqual([true]);
    const procedureOfAlert = EcamDeferredProcedures[DC_ESS_BUS_PART_FAULT_DEFERRED_KEY];
    expect(procedureOfAlert.fromAbnormalProcs).toEqual(['240800031']);
    expect(procedureOfAlert.type).toBe(DeferredProcedureType.FOR_APPROACH);
    expect(procedureOfAlert.items.map((item) => item.name)).toContain('LDG DIST COMPUTATION');
  });
});

describe('FwsAbnormalSensed and FwsCore wiring', () => {
  it('shows PART ELEC SEC CTR under REDUND LOSS while a secondary supply centre has lost its redundancy', () => {
    const { core } = createFws();
    ['240300032', '240300033'].forEach((id, centre) => {
      const entry = core.inopSys.inopSys[id];
      expect(entry, `centre ${centre + 1}`).toBeDefined();
      expect(entry.redundancyLoss).toBe(true);
      expect(entry.simVarIsActive).toBe(core.elecSupplyCentreAlerts.secondarySupplyCentreRedundancyLost[centre]);
    });
  });

  it('adds the entries and the deferred procedure', () => {
    const { core } = createFws();
    const listed = elecSupplyCentreAbnormalItems(core.elecSupplyCentreAlerts, core);
    for (const key of Object.keys(listed).map(Number)) {
      // The same alert state, so no other entry shadows the key
      expect(core.abnormalSensed.ewdAbnormalSensed[key].simVarIsActive, `${key}`).toBe(listed[key].simVarIsActive);
    }
    expect(core.abnormalSensed.ewdDeferredProcs[DC_ESS_BUS_PART_FAULT_DEFERRED_KEY]).toBeDefined();
  });

  it('updates the alerts every cycle', () => {
    const { core, simVars } = createFws(new Set());
    const remoteCbControl = core.abnormalSensed.ewdAbnormalSensed[keys.remoteCbControlActive];
    expect(remoteCbControl.simVarIsActive.get()).toBe(false);

    simVars.set('L:A380X_REMOTE_CB_CTRL', 1);
    runFwsCycle(core);
    expect(remoteCbControl.simVarIsActive.get()).toBe(true);
  });
});
