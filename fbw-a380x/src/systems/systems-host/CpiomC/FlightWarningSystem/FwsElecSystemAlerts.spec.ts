// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  apuBatFaultInfo,
  apuTrFaultInfo,
  batteryFaultInopSys,
  ELEC_SYSTEM_PHASE_INHIBITION,
  elecSystemAbnormalItems,
  elecSystemAlertFlags,
  ElecSystemAlerts,
  ElecSystemInputs,
  engineGeneratorLostApprLdg,
  engineGeneratorLostInfo,
  EXT_PWR_INOP_SYS,
  PushButtonRecycleMonitor,
  RAT_INOP_SYS,
  readElecSystemInputs,
  TR_MONITORING_FAILURES,
} from './FwsElecSystemAlerts';

/*
 * The EcamMessages tables are read from the source text (see FwsElecAlertsStatus.spec.ts: importing EcamMessages in a
 * test fails on a circular import).
 */
const ecamDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ecamMessages = readFileSync(resolve(ecamDir, 'index.ts'), 'utf-8');
const ata24 = readFileSync(resolve(ecamDir, 'AbnormalSensed/ata24.ts'), 'utf-8');

/** Text of a line of an EcamMessages table, without its ECAM colour code */
function text(table: 'EcamInopSys' | 'EcamInfos', key: string): string | undefined {
  const start = ecamMessages.indexOf(`export const ${table}`);
  const body = ecamMessages.slice(start, ecamMessages.indexOf('\n};', start));
  const line = body.match(new RegExp(`^\\s*'?${key}'?: '\\\\x1b<\\d+m([^']*)',`, 'm'));
  return line ? line[1].trim() : undefined;
}

/** Title (without the ELEC prefix codes) and item names of an ata24.ts alert */
function alert(key: number): { title: string; items: string[] } | undefined {
  const start = ata24.indexOf(`\n  ${key}: {`);
  if (start < 0) {
    return undefined;
  }
  const end = ata24.indexOf('\n  },', start);
  const block = ata24.slice(start, end);
  const title = block.match(/title: '\\x1b<4m\\x1b4mELEC\\x1bm ([^']*)'/)?.[1] ?? '';
  const items = [...block.matchAll(/name: '([^']*)'/g)].map((m) => m[1]);
  return { title, items };
}

/** Inputs of a normal aircraft: all batteries AUTO, no failure */
function normal(): ElecSystemInputs {
  return {
    batFaultLight: [false, false, false, false],
    batPbAuto: [true, true, true, true],
    apuTrFault: false,
    extPwrFault: [false, false, false, false],
    extPwrPbOn: [true, true, true, true],
    ratFault: false,
    trMonitoringFailed: [false, false, false],
    driveDiscFault: [false, false, false, false],
    apuAvailable: false,
  };
}

describe('ELEC BAT FAULT and BAT OFF conditions', () => {
  it('raises no alert on a normal aircraft', () => {
    const flags = elecSystemAlertFlags(normal());
    expect(flags.batFault).toEqual([false, false, false, false]);
    expect(flags.batOff).toEqual([false, false, false, false]);
  });

  it('raises BAT n FAULT with the FAULT light of its pb-sw', () => {
    const flags = elecSystemAlertFlags({ ...normal(), batFaultLight: [false, false, true, false] });
    expect(flags.batFault).toEqual([false, false, true, false]);
  });

  it('raises BAT n OFF when one battery pb-sw is OFF', () => {
    const flags = elecSystemAlertFlags({ ...normal(), batPbAuto: [true, false, true, true] });
    expect(flags.batOff).toEqual([false, true, false, false]);
  });

  it('does not raise BAT OFF for a failed battery (its procedure asks BAT OFF)', () => {
    const flags = elecSystemAlertFlags({
      ...normal(),
      batFaultLight: [true, false, false, false],
      batPbAuto: [false, true, true, true],
    });
    expect(flags.batOff).toEqual([false, false, false, false]);
    expect(flags.batFault).toEqual([true, false, false, false]);
  });

  it('does not raise APU BAT OFF with ELEC APU TR FAULT (its procedure asks APU BAT OFF)', () => {
    const flags = elecSystemAlertFlags({ ...normal(), batPbAuto: [true, true, true, false], apuTrFault: true });
    expect(flags.batOff).toEqual([false, false, false, false]);
  });

  it('does not raise BAT OFF with all four batteries OFF (securing the aircraft, battery check)', () => {
    const flags = elecSystemAlertFlags({ ...normal(), batPbAuto: [false, false, false, false] });
    expect(flags.batOff).toEqual([false, false, false, false]);
  });
});

describe('ELEC EXT PWR, RAT and TR MONITORING FAULT conditions', () => {
  it('raises EXT PWR n FAULT from the GGPCU fault, RAT FAULT, TR n MONITORING and DRIVE n DISC FAULT from their failures', () => {
    const flags = elecSystemAlertFlags({
      ...normal(),
      extPwrFault: [false, false, false, true],
      ratFault: true,
      trMonitoringFailed: [false, true, false],
      driveDiscFault: [true, false, false, false],
    });
    expect(flags.extPwrFault).toEqual([false, false, false, true]);
    expect(flags.ratFault).toBe(true);
    expect(flags.trMonitoringFault).toEqual([false, true, false]);
    expect(flags.driveDiscFault).toEqual([true, false, false, false]);
  });

  it('reads the L:vars the Rust system writes and the flyPad TR monitoring failures', () => {
    const on = new Set([
      'L:A32NX_OVHD_ELEC_BAT_ESS_PB_HAS_FAULT',
      'L:A32NX_OVHD_ELEC_BAT_1_PB_IS_AUTO',
      'L:A32NX_OVHD_ELEC_BAT_APU_PB_IS_AUTO',
      'L:A32NX_ELEC_EXT_PWR_2_FAULT',
      'L:A32NX_OVHD_ELEC_EXT_PWR_3_PB_IS_ON',
      'L:A32NX_ELEC_RAT_FAULT',
      'L:A32NX_ELEC_ENG_GEN_4_DRIVE_DISC_FAULT',
    ]);
    const inputs = readElecSystemInputs(
      (name) => (on.has(name) ? 1 : 0),
      (failure) => failure === 24072,
      true,
      true,
    );
    expect(inputs).toEqual({
      batFaultLight: [false, false, true, false],
      batPbAuto: [true, false, false, true],
      apuTrFault: true,
      extPwrFault: [false, true, false, false],
      extPwrPbOn: [false, false, true, false],
      ratFault: true,
      trMonitoringFailed: [false, false, true],
      driveDiscFault: [false, false, false, true],
      apuAvailable: true,
    });
    expect(TR_MONITORING_FAILURES).toEqual([24070, 24071, 24072]);
  });
});

describe('EXT PWR ... RECYCLE line', () => {
  it('is done once the pb has been set OFF then ON during the alert', () => {
    const monitor = new PushButtonRecycleMonitor();
    expect(monitor.update(true, true)).toBe(false);
    expect(monitor.update(true, false)).toBe(false);
    expect(monitor.update(true, true)).toBe(true);
    expect(monitor.update(true, true)).toBe(true);
  });

  it('starts not done again when the alert comes back', () => {
    const monitor = new PushButtonRecycleMonitor();
    monitor.update(true, false);
    monitor.update(true, true);
    expect(monitor.update(false, true)).toBe(false);
    expect(monitor.update(true, true)).toBe(false);
  });
});

describe('STATUS of the ELEC alerts', () => {
  it('shows BAT 1+2 instead of BAT 1 and BAT 2 when both are failed', () => {
    expect(batteryFaultInopSys(0, [true, false, false, false]).map((k) => text('EcamInopSys', k))).toEqual(['BAT 1']);
    expect(batteryFaultInopSys(0, [true, true, false, false]).map((k) => text('EcamInopSys', k))).toEqual(['BAT 1+2']);
    expect(batteryFaultInopSys(1, [true, true, false, false]).map((k) => text('EcamInopSys', k))).toEqual(['BAT 1+2']);
    expect(batteryFaultInopSys(2, [true, true, true, false]).map((k) => text('EcamInopSys', k))).toEqual(['BAT ESS']);
    expect(batteryFaultInopSys(3, [false, false, false, true]).map((k) => text('EcamInopSys', k))).toEqual(['APU BAT']);
  });

  it('shows the APU start INFOs only with the other APU DC source failed', () => {
    expect(apuBatFaultInfo(false)).toEqual([]);
    expect(apuBatFaultInfo(true).map((k) => text('EcamInfos', k))).toEqual(['APU BAT START NOT AVAIL']);
    expect(apuTrFaultInfo(false)).toEqual([]);
    expect(apuTrFaultInfo(true).map((k) => text('EcamInfos', k))).toEqual(['APU START NOT AVAIL']);
  });

  it('shows CAT 3 DUAL INOP and CAT 3 SINGLE ONLY for a lost engine generator with the APU off', () => {
    expect(engineGeneratorLostApprLdg(false).map((k) => text('EcamInopSys', k))).toEqual(['CAT 3 DUAL']);
    expect(engineGeneratorLostInfo(false).map((k) => text('EcamInfos', k))).toEqual(['CAT 3 SINGLE ONLY']);
    expect(engineGeneratorLostApprLdg(true)).toEqual([]);
    expect(engineGeneratorLostInfo(true)).toEqual([]);
  });

  it('names the EXT PWR and RAT INOP SYS lines as the aircraft', () => {
    expect(EXT_PWR_INOP_SYS.map((k) => text('EcamInopSys', k))).toEqual([
      'EXT PWR 1',
      'EXT PWR 2',
      'EXT PWR 3',
      'EXT PWR 4',
    ]);
    expect(text('EcamInopSys', RAT_INOP_SYS)).toBe('RAT');
  });
});

describe('ELEC alert entries (FwsAbnormalSensed)', () => {
  it('uses the flight phase inhibitions of the aircraft', () => {
    expect(ELEC_SYSTEM_PHASE_INHIBITION).toEqual({
      battery: [3, 4, 5, 6, 7, 9, 10],
      extPwrFault: [3, 4, 5, 6, 7, 8, 9, 10],
      ratFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      trMonitoringFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      driveDiscFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    });
  });

  it('has one entry per alert, each with its ata24.ts title and one shown line per item', () => {
    const alerts = new ElecSystemAlerts();
    const items = elecSystemAbnormalItems(alerts);
    const expectedTitles: [number, string][] = [
      [240800017, 'BAT 1 FAULT'],
      [240800018, 'BAT 2 FAULT'],
      [240800087, 'BAT ESS FAULT'],
      [240800013, 'APU BAT FAULT'],
      [240800088, 'BAT 1 OFF'],
      [240800089, 'BAT 2 OFF'],
      [240800090, 'BAT ESS OFF'],
      [240800091, 'APU BAT OFF'],
      [240800056, 'EXT PWR 1 FAULT'],
      [240800057, 'EXT PWR 2 FAULT'],
      [240800058, 'EXT PWR 3 FAULT'],
      [240800059, 'EXT PWR 4 FAULT'],
      [240800072, 'RAT FAULT'],
      [240800084, 'TR 1 MONITORING FAULT'],
      [240800085, 'TR 2 MONITORING FAULT'],
      [240800086, 'TR ESS MONITORING FAULT'],
      [240800032, 'DRIVE 1 DISC FAULT'],
      [240800033, 'DRIVE 2 DISC FAULT'],
      [240800034, 'DRIVE 3 DISC FAULT'],
      [240800035, 'DRIVE 4 DISC FAULT'],
    ];
    expect(Object.keys(items).map(Number).sort()).toEqual(expectedTitles.map(([key]) => key).sort());
    for (const [key, title] of expectedTitles) {
      expect(alert(key)?.title).toBe(title);
      expect(items[key].whichItemsToShow().length).toBe(alert(key)?.items.length);
      expect(items[key].whichItemsChecked().length).toBe(alert(key)?.items.length);
    }
    expect(alert(240800017)?.items).toEqual(['BAT 1']);
    expect(alert(240800087)?.items).toEqual(['BAT ESS']);
    expect(alert(240800091)?.items).toEqual(['APU BAT']);
  });

  it('ticks BAT ... OFF of BAT FAULT and BAT ... ON of BAT OFF from the pb-sw', () => {
    const alerts = new ElecSystemAlerts();
    const items = elecSystemAbnormalItems(alerts);
    alerts.update({ ...normal(), batFaultLight: [false, true, false, false] });
    expect(alerts.batFault[1].get()).toBe(true);
    expect(items[240800018].whichItemsChecked()).toEqual([false]);
    alerts.update({ ...normal(), batFaultLight: [false, true, false, false], batPbAuto: [true, false, true, true] });
    expect(items[240800018].whichItemsChecked()).toEqual([true]);
    expect(alerts.batOff[1].get()).toBe(false);

    alerts.update({ ...normal(), batPbAuto: [true, true, false, true] });
    expect(alerts.batOff[2].get()).toBe(true);
    expect(items[240800090].whichItemsChecked()).toEqual([false]);
    expect(items[240800090].failure).toBe(2);
  });

  it('ticks EXT PWR ... RECYCLE after OFF then ON and lists EXT PWR n in INOP SYS', () => {
    const alerts = new ElecSystemAlerts();
    const items = elecSystemAbnormalItems(alerts);
    const fault: ElecSystemInputs = { ...normal(), extPwrFault: [false, false, true, false] };
    alerts.update(fault);
    expect(alerts.extPwrFault[2].get()).toBe(true);
    expect(items[240800058].whichItemsChecked()).toEqual([false]);
    alerts.update({ ...fault, extPwrPbOn: [true, true, false, true] });
    alerts.update(fault);
    expect(items[240800058].whichItemsChecked()).toEqual([true]);
    expect(items[240800058].inopSysAllPhases?.([true])).toEqual(['240300018']);
    expect(items[240800058].failure).toBe(1);
  });

  it('shows APU BAT START NOT AVAIL with APU BAT FAULT only while APU TR FAULT is active', () => {
    const alerts = new ElecSystemAlerts();
    const items = elecSystemAbnormalItems(alerts);
    alerts.update({ ...normal(), batFaultLight: [false, false, false, true] });
    expect(items[240800013].info?.([false])).toEqual([]);
    alerts.update({ ...normal(), batFaultLight: [false, false, false, true], apuTrFault: true });
    expect(items[240800013].info?.([false])).toEqual(['240200001']);
    expect(items[240800017].info?.([false])).toEqual([]);
  });
});

describe('FwsAbnormalSensed and FwsCore wiring', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

  /** The source of a helper method of FwsAbnormalSensed */
  const helper = (name: string): string => {
    const start = abnormalSensed.indexOf(`private ${name}(`);
    return abnormalSensed.slice(start, abnormalSensed.indexOf('\n  }', start));
  };

  it('adds the entries to the abnormal sensed procedures and updates the alerts every cycle', () => {
    expect(abnormalSensed).toContain('...elecSystemAbnormalItems(this.fws.elecSystemAlerts),');
    expect(core).toContain('public readonly elecSystemAlerts = new ElecSystemAlerts();');
    expect(core).toContain('this.elecSystemAlerts.update(');
  });

  it('gives the generator, drive, APU generator and TR alerts their INOP SYS', () => {
    for (const name of ['elecGenFaultItem', 'elecGenOffItem']) {
      expect(helper(name)).toContain('inopSysAllPhases: () => [ENG_GEN_INOP_SYS[gen]],');
      expect(helper(name)).toContain('inopSysApprLdg: () => engineGeneratorLostApprLdg(this.fws.apuAvail.get()),');
      expect(helper(name)).toContain('info: () => engineGeneratorLostInfo(this.fws.apuAvail.get()),');
    }
    expect(helper('elecDriveDisconnectedItem')).toContain('inopSysAllPhases: () => [ENG_GEN_INOP_SYS[drive]],');
    expect(helper('elecApuGenFaultItem')).toContain('inopSysAllPhases: () => [APU_GEN_INOP_SYS[gen]],');
    expect(helper('elecTrFaultItem')).toContain('inopSysAllPhases: () => [TR_INOP_SYS[tr]],');
    expect(abnormalSensed).toContain('inopSysAllPhases: () => [APU_TR_INOP_SYS],');
  });
});
