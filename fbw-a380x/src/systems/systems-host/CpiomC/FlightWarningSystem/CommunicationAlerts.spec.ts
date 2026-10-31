// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

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

import {
  EcamAbnormalProcedures,
  EcamInopSys,
  EcamLimitations,
  EcamMemos,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { A380Failure, A380FailureDefinitions } from '../../../failures/src/a380';
import { createFws, runFwsCycle, procedureItemNames } from './FwsSpecFixture';

/** The flyPad failure is listed under its ATA chapter */
function isListedInAta(ata: number, failure: number): boolean {
  return A380FailureDefinitions.some((definition) => definition[0] === ata && definition[1] === failure);
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
    expect(procedureItemNames(COM_ALERT_IDS.datalinkFault)).toEqual([
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
    const { core } = createFws(new Set());
    const memo = core.memos.ewdMemos['230000008'];
    expect(memo.simVarIsActive).toBe(core.paInUse);
    expect(EcamMemos['230000008']).toBe('\x1b<3mPA IN USE');
  });
});

describe('COM alerts wiring', () => {
  it('feeds every alert from its FWS signal, with the INOP SYS where the alert has one', () => {
    const { core } = createFws(new Set());
    const alerts = core.abnormalSensed.ewdAbnormalSensed;
    expect(alerts[COM_ALERT_IDS.cids123Fault].simVarIsActive).toBe(core.cids123Fault);
    expect(alerts[COM_ALERT_IDS.cidsCabinComFault].simVarIsActive).toBe(core.cidsCabinComFault);
    expect(alerts[COM_ALERT_IDS.comDegraded].simVarIsActive).toBe(core.cabComDegraded);
    expect(alerts[COM_ALERT_IDS.datalinkFault].simVarIsActive).toBe(core.comDatalinkFault);
    expect(alerts[COM_ALERT_IDS.vhf3DatalinkFault].simVarIsActive).toBe(core.vhf3DatalinkFault);
    COM_ALERT_IDS.pttStuck.forEach((id, station) => {
      expect(alerts[id].simVarIsActive).toBe(core.pttStuck[station]);
    });
    COM_ALERT_IDS.vhfEmitting.forEach((id, vhf) => {
      expect(alerts[id].simVarIsActive).toBe(core.vhfEmitting[vhf]);
    });
    expect(alerts[COM_ALERT_IDS.cids123Fault].inopSysAllPhases?.([])).toEqual(CIDS_123_FAULT_INOP_SYS);
    expect(alerts[COM_ALERT_IDS.vhf3DatalinkFault].inopSysAllPhases?.([])).toEqual(VHF3_DATALINK_FAULT_INOP_SYS);
  });

  it('every alert has its message, the INOP SYS exist', () => {
    const ids: string[] = [
      COM_ALERT_IDS.cids123Fault,
      COM_ALERT_IDS.cidsCabinComFault,
      COM_ALERT_IDS.comDegraded,
      COM_ALERT_IDS.datalinkFault,
      COM_ALERT_IDS.vhf3DatalinkFault,
      ...COM_ALERT_IDS.pttStuck,
      ...COM_ALERT_IDS.vhfEmitting,
    ];
    for (const id of ids) {
      expect(EcamAbnormalProcedures[id], id).toBeDefined();
    }
    expect(procedureItemNames(COM_ALERT_IDS.vhfEmitting[0])).toEqual(['RMP TX KEY']);
    expect(EcamInopSys[CIDS_123_FAULT_INOP_SYS[0]]).toBe('\x1b<4mCIDS 1+2+3');
    expect(EcamInopSys[VHF3_DATALINK_FAULT_INOP_SYS[0]]).toBe('\x1b<4mVHF 3 DATALINK');
  });

  it('FwsCore raises the CIDS and VHF 3 alerts from the flyPad failures', () => {
    const allCidsFailed = createFws(
      new Set([A380Failure.CidsDirector1, A380Failure.CidsDirector2, A380Failure.CidsDirector3]),
    );
    runFwsCycle(allCidsFailed.core);
    expect(allCidsFailed.core.cids123Fault.get()).toBe(true);

    const upperDeckPaFailed = createFws(new Set([A380Failure.UpperDeckPa]));
    runFwsCycle(upperDeckPaFailed.core);
    expect(upperDeckPaFailed.core.cids123Fault.get()).toBe(false);
    expect(upperDeckPaFailed.core.cidsCabinComFault.get()).toBe(true);

    const vhf3Failed = createFws(new Set([A380Failure.Vhf3]));
    runFwsCycle(vhf3Failed.core);
    expect(vhf3Failed.core.vhf3DatalinkFault.get()).toBe(true);
  });

  it('FwsCore raises PTT STUCK after 40 s from the flyPad failure, and PA IN USE from the RMP key', () => {
    const { core, simVars } = createFws(new Set([A380Failure.CaptPttStuck]));
    simVars.set('L:A380X_RMP_3_PA_TX', 1);
    for (let second = 0; second < 45; second++) {
      runFwsCycle(core);
    }
    expect(core.pttStuck[0].get()).toBe(true);
    expect(core.paInUse.get()).toBe(true);
  });

  it('the flyPad failures are listed in ATA 23', () => {
    const failureIds = A380Failure as unknown as { [name: string]: number };
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
    ] as [string, number][]) {
      expect(failureIds[name], name).toBe(id);
      expect(isListedInAta(23, id), name).toBe(true);
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

  it('COM ADS DATALINK FAULT alone when only the ADS function is stopped', () => {
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
      expect(EcamAbnormalProcedures[id], id).toBeDefined();
    }
    expect(EcamAbnormalProcedures['460800002'].title).toBe('\x1b<4m\x1b4mCOM\x1bm ATC DATALINK FAULT');
    expect(EcamInopSys[ADS_DATALINK_FAULT_INOP_SYS[0]]).toBe('\x1b<4mADS DATALINK');
    expect(EcamInopSys[ATC_DATALINK_FAULT_INOP_SYS[0]]).toBe('\x1b<4mATC DATALINK');
    expect(EcamInopSys[NSS_DATA_TO_AVNCS_XFR_FAULT_INOP_SYS[0]]).toBe('\x1b<4mNSS DATA TO AVNCS');
    expect(EcamInopSys[NSS_AVNCS_DATA_XFR_FAULT_INOP_SYS[0]]).toBe('\x1b<4mNSS/AVNCS DATA XFR');
    expect(EcamLimitations[ATC_DATALINK_FAULT_LIMITATIONS[0]]).toBe('\x1b<5mATC COM VOICE ONLY');
  });

  it('is wired in FwsCore and FwsAbnormalSensed, the ADS and NSS alerts give way to the wider ones', () => {
    const { core, simVars } = createFws(new Set());
    const alerts = core.abnormalSensed.ewdAbnormalSensed;
    expect(alerts['460800001'].simVarIsActive).toBe(core.comAdsDatalinkFault);
    expect(alerts['460800001'].notActiveWhenItemActive).toEqual(['460800002']);
    expect(alerts['460800003'].notActiveWhenItemActive).toEqual(['460800004']);
    expect(alerts['460800002'].limitationsAllPhases?.([])).toEqual(ATC_DATALINK_FAULT_LIMITATIONS);

    simVars.set('L:A32NX_CPIOM_D1_AVAIL', 1);
    simVars.set('L:A32NX_OVHD_NSS_DATA_TO_AVNCS_TOGGLE', 1);
    runFwsCycle(core);
    expect(core.comAtcDatalinkFault.get()).toBe(false);
    expect(core.comNssDataToAvncsXfrFault.get()).toBe(false);
    simVars.set('L:A32NX_CPIOM_D1_AVAIL', 0);
    simVars.set('L:A32NX_OVHD_NSS_DATA_TO_AVNCS_TOGGLE', 0);
    runFwsCycle(core);
    expect(core.comAtcDatalinkFault.get()).toBe(true);
    expect(core.comNssDataToAvncsXfrFault.get()).toBe(true);
  });

  it('raises the information system alerts from the SCI and ADS flyPad failures', () => {
    const { core, simVars } = createFws(new Set([A380Failure.Sci1, A380Failure.Sci2, A380Failure.AdsFunction]));
    simVars.set('L:A32NX_CPIOM_D1_AVAIL', 1);
    simVars.set('L:A32NX_OVHD_NSS_DATA_TO_AVNCS_TOGGLE', 1);
    runFwsCycle(core);
    expect(core.comNssAvncsDataXfrFault.get()).toBe(true);
    expect(core.comAdsDatalinkFault.get()).toBe(true);
  });

  it('lists the SCI and ADS flyPad failures in ATA 46', () => {
    const failureIds = A380Failure as unknown as { [name: string]: number };
    for (const [name, id] of [
      ['Sci1', 46008],
      ['Sci2', 46009],
      ['AdsFunction', 46010],
    ] as [string, number][]) {
      expect(failureIds[name], name).toBe(id);
      expect(isListedInAta(46, id), name).toBe(true);
    }
  });
});
