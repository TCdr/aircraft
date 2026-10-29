// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  CIDS_123_FAULT_INOP_SYS,
  cidsAlerts,
  CidsInputs,
  COM_ALERT_IDS,
  COM_ALERT_PHASE_INHIBITION,
  COM_DEGRADED_PHASE_INHIBITION,
  ComTransmissionInputs,
  ComTransmissionMonitor,
  DATALINK_FAULT_ITEMS_TO_SHOW,
  datalinkAlerts,
  isPaInUse,
  readRmpTransmissionKeys,
  RmpTransmissionKeys,
  VHF3_DATALINK_FAULT_INOP_SYS,
  ADS_DATALINK_FAULT_INOP_SYS,
  ATC_DATALINK_FAULT_INOP_SYS,
  ATC_DATALINK_FAULT_LIMITATIONS,
  INFO_SYS_ALERT_IDS,
  INFO_SYS_ALERT_PHASE_INHIBITION,
  informationSystemAlerts,
  InformationSystemInputs,
  NSS_AVNCS_DATA_XFR_FAULT_INOP_SYS,
  NSS_DATA_TO_AVNCS_XFR_FAULT_INOP_SYS,
} from './CommunicationAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata23 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata21-22-23.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
const memos = readFileSync(resolve(__dirname, 'FwsMemos.ts'), 'utf-8');
const failures = readFileSync(resolve(__dirname, '../../../failures/src/a380.ts'), 'utf-8');

/** The item names of an ata21-22-23.ts procedure */
function itemNames(id: string): string[] {
  const start = ata23.indexOf(`  ${id}: {`);
  expect(start, id).toBeGreaterThan(0);
  const block = ata23.slice(start, ata23.indexOf('\n  },', start));
  return [...block.matchAll(/name: '([^']*)'/g)].map((match) => match[1]);
}

const noCidsFailure: CidsInputs = {
  directorFailed: [false, false, false],
  upperDeckPaFailed: false,
  mainDeckPaFailed: false,
  lowerDeckPaFailed: false,
  cabinInterphoneFailed: false,
  paDegraded: false,
  cabinInterphoneDegraded: false,
};

const noKey: RmpTransmissionKeys = { vhf: [false, false, false], pa: false, any: false };
const vhfKey = (vhf: number): RmpTransmissionKeys => ({
  vhf: [0, 1, 2].map((index) => index === vhf),
  pa: false,
  any: true,
});
const quiet: ComTransmissionInputs = { pttPressed: [false, false, false], rmpKeys: [noKey, noKey, noKey] };

/** Runs the monitor for a time, in 100 ms steps, and returns the last outputs */
function runFor(monitor: ComTransmissionMonitor, inputs: ComTransmissionInputs, seconds: number) {
  let out = monitor.update(inputs, 0);
  for (let t = 0; t < seconds * 10; t++) {
    out = monitor.update(inputs, 100);
  }
  return out;
}

describe('CAB COM alerts of the CIDS', () => {
  it('CIDS 1+2+3 FAULT needs the three CIDS failed', () => {
    expect(cidsAlerts(noCidsFailure).cids123Fault).toBe(false);
    expect(cidsAlerts({ ...noCidsFailure, directorFailed: [true, true, false] }).cids123Fault).toBe(false);
    expect(cidsAlerts({ ...noCidsFailure, directorFailed: [true, true, true] }).cids123Fault).toBe(true);
  });

  it('CIDS CABIN COM FAULT: cabin interphone, upper or main deck PA failed; LOWER DECK PA only adds its line', () => {
    expect(cidsAlerts({ ...noCidsFailure, upperDeckPaFailed: true }).cabinComFault).toBe(true);
    expect(cidsAlerts({ ...noCidsFailure, mainDeckPaFailed: true }).cabinComFault).toBe(true);
    expect(cidsAlerts({ ...noCidsFailure, cabinInterphoneFailed: true }).cabinComFault).toBe(true);
    expect(cidsAlerts({ ...noCidsFailure, lowerDeckPaFailed: true }).cabinComFault).toBe(false);
    const alerts = cidsAlerts({ ...noCidsFailure, mainDeckPaFailed: true, lowerDeckPaFailed: true });
    expect(alerts.cabinComFaultLines).toEqual([false, true, true, false]);
    // MAIN DECK PA, LOWER DECK PA, each one only when affected
    expect(alerts.cabinComFaultInopSys).toEqual(['230300003', '230300004']);
  });

  it('COM DEGRADED: PA or cabin interphone degraded, with its line', () => {
    expect(cidsAlerts(noCidsFailure).comDegraded).toBe(false);
    const alerts = cidsAlerts({ ...noCidsFailure, cabinInterphoneDegraded: true });
    expect(alerts.comDegraded).toBe(true);
    expect(alerts.comDegradedLines).toEqual([false, true]);
  });

  it('flight phase inhibitions of the aircraft', () => {
    expect(COM_ALERT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(COM_DEGRADED_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('PTT STUCK and VHF EMITTING', () => {
  it('reads the transmission keys of an RMP', () => {
    const on = ['L:A380X_RMP_2_VHF_TX_3', 'L:A380X_RMP_2_PA_TX'];
    expect(readRmpTransmissionKeys(2, (name) => on.includes(name))).toEqual({
      vhf: [false, false, true],
      pa: true,
      any: true,
    });
    expect(readRmpTransmissionKeys(1, (name) => on.includes(name))).toEqual(noKey);
    expect(readRmpTransmissionKeys(3, (name) => name === 'L:A380X_RMP_3_INT_TX').any).toBe(true);
  });

  it('PTT STUCK after 40 s of a stuck PTT with no transmission key on the associated RMP', () => {
    const monitor = new ComTransmissionMonitor();
    const stuckFo: ComTransmissionInputs = { ...quiet, pttPressed: [false, true, false] };
    expect(runFor(monitor, stuckFo, 39.5).pttStuck).toEqual([false, false, false]);
    expect(runFor(monitor, stuckFo, 1).pttStuck).toEqual([false, true, false]);
    // released: off at once
    expect(monitor.update(quiet, 100).pttStuck).toEqual([false, false, false]);
  });

  it('no PTT STUCK when a transmission key is selected on the associated RMP (RMP 2 for the F/O)', () => {
    const monitor = new ComTransmissionMonitor();
    const keyOnRmp1: ComTransmissionInputs = { pttPressed: [false, true, false], rmpKeys: [vhfKey(0), noKey, noKey] };
    expect(runFor(monitor, keyOnRmp1, 41).pttStuck[1]).toBe(true);
    const keyOnRmp2: ComTransmissionInputs = { pttPressed: [false, true, false], rmpKeys: [noKey, vhfKey(0), noKey] };
    expect(runFor(new ComTransmissionMonitor(), keyOnRmp2, 41).pttStuck[1]).toBe(false);
  });

  it('VHF EMITTING after 60 s of transmission (transmission key and PTT pressed), raised with its SC', () => {
    const monitor = new ComTransmissionMonitor();
    const captOnVhf2: ComTransmissionInputs = { pttPressed: [true, false, false], rmpKeys: [vhfKey(1), noKey, noKey] };
    expect(runFor(monitor, captOnVhf2, 59.5).vhfEmitting).toEqual([false, false, false]);
    expect(runFor(monitor, captOnVhf2, 1).vhfEmitting).toEqual([false, true, false]);
    // RMP TX KEY DESELECT ends the transmission
    expect(monitor.update({ ...captOnVhf2, rmpKeys: [noKey, noKey, noKey] }, 100).vhfEmitting[1]).toBe(false);
  });

  it('no VHF EMITTING with the key selected but no PTT pressed', () => {
    const keyOnly: ComTransmissionInputs = { ...quiet, rmpKeys: [vhfKey(0), vhfKey(1), vhfKey(2)] };
    expect(runFor(new ComTransmissionMonitor(), keyOnly, 120).vhfEmitting).toEqual([false, false, false]);
  });
});

describe('COM DATALINK FAULT and VHF 3 DATALINK FAULT', () => {
  it('VHF 3 DATALINK FAULT on the VHF 3 failure', () => {
    expect(datalinkAlerts({ vhf3Failed: false, vhf3DataMode: true }).vhf3DatalinkFault).toBe(false);
    expect(datalinkAlerts({ vhf3Failed: true, vhf3DataMode: true }).vhf3DatalinkFault).toBe(true);
  });

  it('COM DATALINK FAULT when VHF 3, the only data medium of the sim, is failed or in voice mode', () => {
    expect(datalinkAlerts({ vhf3Failed: false, vhf3DataMode: true }).datalinkFault).toBe(false);
    expect(datalinkAlerts({ vhf3Failed: true, vhf3DataMode: true }).datalinkFault).toBe(true);
    expect(datalinkAlerts({ vhf3Failed: false, vhf3DataMode: false }).datalinkFault).toBe(true);
  });

  it('COM DATALINK FAULT has the lines, only VHF & HF & SATCOM DATA NOT AVAIL is shown', () => {
    expect(itemNames(COM_ALERT_IDS.datalinkFault)).toEqual([
      'DATALINK INIT FAULT',
      'ATC COM VOICE ONLY',
      'VHF & HF & SATCOM DATA NOT AVAIL',
    ]);
    expect(DATALINK_FAULT_ITEMS_TO_SHOW).toEqual([false, false, true]);
  });
});

describe('PA IN USE memo', () => {
  it('shows while the PA transmission key of any RMP is on', () => {
    expect(isPaInUse([noKey, noKey, noKey])).toBe(false);
    expect(isPaInUse([noKey, noKey, { ...noKey, pa: true, any: true }])).toBe(true);
  });

  it('is wired in FwsMemos', () => {
    const entry = memos.slice(memos.indexOf("    '230000008': {"));
    expect(memos.indexOf("    '230000008': {")).toBeGreaterThan(0);
    expect(entry).toContain('simVarIsActive: this.fws.paInUse,');
    expect(messageIndex).toContain("'230000008': '\\x1b<3mPA IN USE',");
  });
});

describe('COM alerts wiring', () => {
  const comAlerts = abnormalSensed.slice(abnormalSensed.indexOf('  private comAlerts(): EwdAbnormalDict {'));

  it('comAlerts() is spread into the alerts and feeds every alert', () => {
    expect(abnormalSensed).toContain('    ...this.comAlerts(),');
    for (const subject of [
      'cids123Fault',
      'cidsCabinComFault',
      'cabComDegraded',
      'comDatalinkFault',
      'vhf3DatalinkFault',
      'pttStuck[station]',
      'vhfEmitting[vhf]',
    ]) {
      expect(comAlerts, subject).toContain(`simVarIsActive: this.fws.${subject},`);
    }
    expect(comAlerts).toContain('inopSysAllPhases: () => CIDS_123_FAULT_INOP_SYS,');
    expect(comAlerts).toContain('inopSysAllPhases: () => VHF3_DATALINK_FAULT_INOP_SYS,');
  });

  it('every alert has its message, the INOP SYS exist', () => {
    const ids = [
      COM_ALERT_IDS.cids123Fault,
      COM_ALERT_IDS.cidsCabinComFault,
      COM_ALERT_IDS.comDegraded,
      COM_ALERT_IDS.datalinkFault,
      COM_ALERT_IDS.vhf3DatalinkFault,
      ...COM_ALERT_IDS.pttStuck,
      ...COM_ALERT_IDS.vhfEmitting,
    ];
    for (const id of ids) {
      expect(ata23.indexOf(`  ${id}: {`), id).toBeGreaterThan(0);
    }
    expect(itemNames(COM_ALERT_IDS.vhfEmitting[0])).toEqual(['RMP TX KEY']);
    expect(messageIndex).toContain(`${CIDS_123_FAULT_INOP_SYS[0]}: '\\x1b<4mCIDS 1+2+3',`);
    expect(messageIndex).toContain(`${VHF3_DATALINK_FAULT_INOP_SYS[0]}: '\\x1b<4mVHF 3 DATALINK',`);
  });

  it('FwsCore reads the CIDS / PTT failures and the RMP keys', () => {
    for (const failure of [
      'CidsDirector1',
      'UpperDeckPa',
      'LowerDeckPa',
      'CabinInterphoneDegraded',
      'CaptPttStuck',
      'ThirdOccupantPttStuck',
      'Vhf3',
    ]) {
      expect(fwsCore, failure).toContain(`A380Failure.${failure}`);
    }
    expect(fwsCore).toContain('this.comTransmissionMonitor.update(');
    expect(fwsCore).toContain('this.paInUse.set(isPaInUse(this.rmpTransmissionKeys));');
  });

  it('the flyPad failures are listed in ATA 23', () => {
    for (const [name, id] of [
      ['CidsDirector1', 23008],
      ['CidsDirector2', 23009],
      ['CidsDirector3', 23010],
      ['UpperDeckPa', 23011],
      ['MainDeckPa', 23012],
      ['LowerDeckPa', 23013],
      ['CabinInterphone', 23014],
      ['PaDegraded', 23015],
      ['CabinInterphoneDegraded', 23016],
      ['CaptPttStuck', 23017],
      ['FoPttStuck', 23018],
      ['ThirdOccupantPttStuck', 23019],
    ]) {
      expect(failures, `${name}`).toContain(`  ${name}: ${id},`);
      expect(failures, `${name}`).toContain(`  [23, A380Failure.${name}, '`);
    }
  });
});

describe('ATA 46 information system COM alerts', () => {
  const normal: InformationSystemInputs = {
    cpiomD1Available: true,
    atcResetPulled: false,
    adsFunctionFailed: false,
    nssDataToAvncsPbOff: false,
    sciFailed: [false, false],
  };
  const ata46 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata46-49-52-56.ts'), 'utf-8');

  it('no alert in the normal state', () => {
    expect(informationSystemAlerts(normal)).toEqual({
      adsDatalinkFault: false,
      atcDatalinkFault: false,
      nssDataToAvncsXfrFault: false,
      nssAvncsDataXfrFault: false,
    });
  });

  it('COM ATC DATALINK FAULT when CPIOM D1 (the ATC applications) is lost, the ADS stops with it', () => {
    const alerts = informationSystemAlerts({ ...normal, cpiomD1Available: false });
    expect(alerts.atcDatalinkFault).toBe(true);
    expect(alerts.adsDatalinkFault).toBe(true);
  });

  it('COM ATC DATALINK FAULT while the ATC RESET pb is pulled', () => {
    const alerts = informationSystemAlerts({ ...normal, atcResetPulled: true });
    expect(alerts.atcDatalinkFault).toBe(true);
    expect(alerts.adsDatalinkFault).toBe(true);
  });

  it('COM ADS DATALINK FAULT alone when only the ADS function is stopped (l.169820)', () => {
    const alerts = informationSystemAlerts({ ...normal, adsFunctionFailed: true });
    expect(alerts.adsDatalinkFault).toBe(true);
    expect(alerts.atcDatalinkFault).toBe(false);
  });

  it('COM NSS DATA TO AVNCS XFR FAULT with the pb-sw OFF', () => {
    expect(informationSystemAlerts({ ...normal, nssDataToAvncsPbOff: true }).nssDataToAvncsXfrFault).toBe(true);
  });

  it('COM NSS/AVNCS DATA XFR FAULT only with both SCIs lost', () => {
    expect(informationSystemAlerts({ ...normal, sciFailed: [true, false] }).nssAvncsDataXfrFault).toBe(false);
    expect(informationSystemAlerts({ ...normal, sciFailed: [false, true] }).nssAvncsDataXfrFault).toBe(false);
    expect(informationSystemAlerts({ ...normal, sciFailed: [true, true] }).nssAvncsDataXfrFault).toBe(true);
  });

  it('uses the flight phase inhibition of the aircraft', () => {
    expect(INFO_SYS_ALERT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('defines the alerts, INOP SYS and the ATC COM VOICE ONLY limitation', () => {
    for (const id of Object.values(INFO_SYS_ALERT_IDS)) {
      expect(ata46.indexOf(`  ${id}: {`), id).toBeGreaterThan(0);
    }
    expect(ata46).toContain("title: '\\x1b<4m\\x1b4mCOM\\x1bm ATC DATALINK FAULT',");
    expect(messageIndex).toContain(`${ADS_DATALINK_FAULT_INOP_SYS[0]}: '\\x1b<4mADS DATALINK',`);
    expect(messageIndex).toContain(`${ATC_DATALINK_FAULT_INOP_SYS[0]}: '\\x1b<4mATC DATALINK',`);
    expect(messageIndex).toContain(`${NSS_DATA_TO_AVNCS_XFR_FAULT_INOP_SYS[0]}: '\\x1b<4mNSS DATA TO AVNCS',`);
    expect(messageIndex).toContain(`${NSS_AVNCS_DATA_XFR_FAULT_INOP_SYS[0]}: '\\x1b<4mNSS/AVNCS DATA XFR',`);
    expect(messageIndex).toContain(`${ATC_DATALINK_FAULT_LIMITATIONS[0]}: '\\x1b<5mATC COM VOICE ONLY',`);
  });

  it('is wired in FwsCore and FwsAbnormalSensed, the ADS and NSS alerts give way to the wider ones', () => {
    const infoSysAlerts = abnormalSensed.slice(
      abnormalSensed.indexOf('  private informationSystemAlerts(): EwdAbnormalDict {'),
    );
    expect(abnormalSensed).toContain('    ...this.informationSystemAlerts(),');
    expect(infoSysAlerts).toContain('notActiveWhenItemActive: [ids.atcDatalinkFault],');
    expect(infoSysAlerts).toContain('notActiveWhenItemActive: [ids.nssAvncsDataXfrFault],');
    expect(infoSysAlerts).toContain('limitationsAllPhases: () => ATC_DATALINK_FAULT_LIMITATIONS,');
    expect(fwsCore).toContain("cpiomD1Available: readBoolLvar('L:A32NX_CPIOM_D1_AVAIL'),");
    expect(fwsCore).toContain("nssDataToAvncsPbOff: !readBoolLvar('L:A32NX_OVHD_NSS_DATA_TO_AVNCS_TOGGLE'),");
    for (const failure of ['AdsFunction', 'Sci1', 'Sci2']) {
      expect(fwsCore, failure).toContain(`A380Failure.${failure}`);
    }
  });

  it('lists the SCI and ADS flyPad failures in ATA 46', () => {
    for (const [name, id] of [
      ['Sci1', 46008],
      ['Sci2', 46009],
      ['AdsFunction', 46010],
    ]) {
      expect(failures, `${name}`).toContain(`  ${name}: ${id},`);
      expect(failures, `${name}`).toContain(`  [46, A380Failure.${name}, '`);
    }
  });
});
