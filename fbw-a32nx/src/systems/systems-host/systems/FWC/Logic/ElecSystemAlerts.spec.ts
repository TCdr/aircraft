// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BAT_FAULT_PHASE_INHIBITION,
  BCL_FAULT_PHASE_INHIBITION,
  ElecSystemAlertMonitor,
  ElecSystemInputs,
  GEN_OVERLOAD_PHASE_INHIBITION,
  IDG_OIL_OVERHEAT_CELSIUS,
  IDG_OIL_PHASE_INHIBITION,
  STATIC_INV_FAULT_PHASE_INHIBITION,
  batFaultStatus,
  bclFaultStatus,
  elecSystemAlertStates,
  genOverloadLines,
  genOverloadStatus,
  idgOilLines,
  idgOilStatus,
} from './ElecSystemAlerts';
import { formatStatusPage, orderStatusCodes } from '../../../../shared/src/StatusMessages';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { SdPages as EcamSysPage } from '../../../../shared/src/SdPages';
import { isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name) */
let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

const normal: ElecSystemInputs = {
  bclBatteryFault: [false, false],
  bclFault: [false, false],
  idgConnected: [true, true],
  idgOilLowPressure: [false, false],
  idgOilOutletTemperature: [80, 80],
  engineGeneratorLoadNormal: [true, true],
  engineGeneratorLineContactorClosed: [true, true],
  apuGeneratorLoadNormal: true,
  apuGeneratorContactorClosed: false,
  staticInverterFault: false,
};

describe('ELEC system alerts', () => {
  it('raises nothing in the normal state', () => {
    expect(elecSystemAlertStates(normal)).toEqual({
      batFault: [false, false],
      bclFault: [false, false],
      idgOilLowPressure: [false, false],
      idgOilOverheat: [false, false],
      genOverload: [false, false],
      apuGenOverload: false,
      staticInverterFault: false,
    });
  });

  it('BAT 1(2) FAULT follows the BCL abnormal charge detection', () => {
    expect(elecSystemAlertStates({ ...normal, bclBatteryFault: [false, true] }).batFault).toEqual([false, true]);
  });

  it('BCL 1(2) FAULT follows the BCL failure', () => {
    expect(elecSystemAlertStates({ ...normal, bclFault: [true, false] }).bclFault).toEqual([true, false]);
  });

  it('IDG 1(2) OIL LO PR follows the GCU low pressure signal of a connected IDG', () => {
    expect(elecSystemAlertStates({ ...normal, idgOilLowPressure: [true, false] }).idgOilLowPressure).toEqual([
      true,
      false,
    ]);
    expect(
      elecSystemAlertStates({ ...normal, idgOilLowPressure: [true, false], idgConnected: [false, true] })
        .idgOilLowPressure,
    ).toEqual([false, false]);
  });

  it('IDG 1(2) OIL OVHT triggers above 180 °C on a connected IDG', () => {
    expect(elecSystemAlertStates({ ...normal, idgOilOutletTemperature: [180, 181] }).idgOilOverheat).toEqual([
      false,
      true,
    ]);
    expect(
      elecSystemAlertStates({ ...normal, idgOilOutletTemperature: [190, 190], idgConnected: [false, false] })
        .idgOilOverheat,
    ).toEqual([false, false]);
  });

  it('GEN 1(2) OVERLOAD triggers when a supplying generator is above 100 %', () => {
    expect(elecSystemAlertStates({ ...normal, engineGeneratorLoadNormal: [true, false] }).genOverload).toEqual([
      false,
      true,
    ]);
    expect(
      elecSystemAlertStates({
        ...normal,
        engineGeneratorLoadNormal: [false, false],
        engineGeneratorLineContactorClosed: [false, false],
      }).genOverload,
    ).toEqual([false, false]);
  });

  it('APU GEN OVERLOAD triggers when the supplying APU generator is above 100 %', () => {
    expect(elecSystemAlertStates({ ...normal, apuGeneratorLoadNormal: false }).apuGenOverload).toBe(false);
    expect(
      elecSystemAlertStates({ ...normal, apuGeneratorLoadNormal: false, apuGeneratorContactorClosed: true })
        .apuGenOverload,
    ).toBe(true);
  });

  it('STATIC INV FAULT follows the inverter fault output', () => {
    expect(elecSystemAlertStates({ ...normal, staticInverterFault: true }).staticInverterFault).toBe(true);
  });

  it('sets the PseudoFWC subjects', () => {
    const monitor = new ElecSystemAlertMonitor();
    monitor.update({ ...normal, bclBatteryFault: [true, false], idgOilOutletTemperature: [80, 185] });
    expect(monitor.batFault[0].get()).toBe(true);
    expect(monitor.idgOilOverheat[1].get()).toBe(true);
    expect(monitor.idgOilOverheat[0].get()).toBe(false);
  });

  it('is inhibited in the aircraft flight phases', () => {
    expect(BAT_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
    expect(BCL_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
    expect(GEN_OVERLOAD_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
    expect(STATIC_INV_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
    expect(IDG_OIL_PHASE_INHIBITION).toEqual([1, 4, 5, 7, 8, 10]);
  });
});

describe('ELEC system alert procedures and STATUS', () => {
  it('IDG OIL LO PR/OVHT: IDG (AFFECTED) OFF', () => {
    expect(idgOilLines()).toEqual([0, 1]);
  });

  it('GEN OVERLOAD: GALY/CAB OFF until done', () => {
    expect(genOverloadLines(false)).toEqual([0, 1]);
    expect(genOverloadLines(true)).toEqual([0, null]);
  });

  it('BAT and BCL FAULT: APU BAT START NOT AVAIL, INOP SYS BAT 1(2) / BCL 1(2)', () => {
    expect(batFaultStatus(1)).toEqual({ left: ['240200201'], inopSys: ['240300201'] });
    expect(batFaultStatus(2)).toEqual({ left: ['240200201'], inopSys: ['240300202'] });
    expect(bclFaultStatus(1)).toEqual({ left: ['240200201'], inopSys: ['240300203'] });
    expect(bclFaultStatus(2)).toEqual({ left: ['240200201'], inopSys: ['240300204'] });
  });

  it('GEN OVERLOAD: INOP SYS GALY/CAB', () => {
    expect(genOverloadStatus()).toEqual({ left: [], inopSys: ['240300205'] });
  });

  it('IDG OIL: CAT 3 SINGLE ONLY; MAIN GALLEY only without the APU GEN, GEN 1(2), CAT 3 DUAL', () => {
    expect(idgOilStatus(1, false)).toEqual({ left: ['220200001'], inopSys: ['240300001', '240300002', '220300001'] });
    expect(idgOilStatus(2, true)).toEqual({ left: ['220200001'], inopSys: ['240300003', '220300001'] });
  });

  it('knows every STATUS code', () => {
    const codes = ['240200201', '240300201', '240300202', '240300203', '240300204', '240300205'];
    expect(orderStatusCodes(codes)).toHaveLength(codes.length);
  });
});

// eslint-disable-next-line no-control-regex
const plain = (text: string) => text.replace(/[^m]*m/g, '');

describe('the real PseudoFWC ELEC system alerts', () => {
  /** Each alert with the simvars the Rust electrical system sets to raise it */
  const ALERT_CASES: {
    key: string;
    inhibition: number[];
    codes: string[];
    title: string;
    raiseWith: [string, number][];
  }[] = [
    {
      key: '2400201',
      inhibition: BAT_FAULT_PHASE_INHIBITION,
      codes: ['240020101'],
      title: ' BAT 1 FAULT',
      raiseWith: [['L:A32NX_ELEC_BCL_1_BAT_FAULT', 1]],
    },
    {
      key: '2400202',
      inhibition: BAT_FAULT_PHASE_INHIBITION,
      codes: ['240020201'],
      title: ' BAT 2 FAULT',
      raiseWith: [['L:A32NX_ELEC_BCL_2_BAT_FAULT', 1]],
    },
    {
      key: '2400203',
      inhibition: BCL_FAULT_PHASE_INHIBITION,
      codes: ['240020301'],
      title: ' BCL 1 FAULT',
      raiseWith: [['L:A32NX_ELEC_BCL_1_FAULT', 1]],
    },
    {
      key: '2400204',
      inhibition: BCL_FAULT_PHASE_INHIBITION,
      codes: ['240020401'],
      title: ' BCL 2 FAULT',
      raiseWith: [['L:A32NX_ELEC_BCL_2_FAULT', 1]],
    },
    {
      key: '2400205',
      inhibition: IDG_OIL_PHASE_INHIBITION,
      codes: ['240020501', '240020502'],
      title: ' IDG 1 OIL LO PR',
      raiseWith: [['L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_LOW_PRESSURE', 1]],
    },
    {
      key: '2400206',
      inhibition: IDG_OIL_PHASE_INHIBITION,
      codes: ['240020601', '240020602'],
      title: ' IDG 2 OIL LO PR',
      raiseWith: [['L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_LOW_PRESSURE', 1]],
    },
    {
      key: '2400207',
      inhibition: IDG_OIL_PHASE_INHIBITION,
      codes: ['240020701', '240020702'],
      title: ' IDG 1 OIL OVHT',
      raiseWith: [['L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE', IDG_OIL_OVERHEAT_CELSIUS + 10]],
    },
    {
      key: '2400208',
      inhibition: IDG_OIL_PHASE_INHIBITION,
      codes: ['240020801', '240020802'],
      title: ' IDG 2 OIL OVHT',
      raiseWith: [['L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_OUTLET_TEMPERATURE', IDG_OIL_OVERHEAT_CELSIUS + 10]],
    },
    {
      key: '2400209',
      inhibition: GEN_OVERLOAD_PHASE_INHIBITION,
      codes: ['240020901', '240020902'],
      title: ' GEN 1 OVERLOAD',
      raiseWith: [['L:A32NX_ELEC_ENG_GEN_1_LOAD_NORMAL', 0]],
    },
    {
      key: '2400210',
      inhibition: GEN_OVERLOAD_PHASE_INHIBITION,
      codes: ['240021001', '240021002'],
      title: ' GEN 2 OVERLOAD',
      raiseWith: [['L:A32NX_ELEC_ENG_GEN_2_LOAD_NORMAL', 0]],
    },
    {
      key: '2400211',
      inhibition: GEN_OVERLOAD_PHASE_INHIBITION,
      codes: ['240021101', '240021102'],
      title: ' APU GEN OVERLOAD',
      raiseWith: [
        ['L:A32NX_ELEC_CONTACTOR_3XS_IS_CLOSED', 1],
        ['L:A32NX_ELEC_APU_GEN_1_LOAD_NORMAL', 0],
      ],
    },
    {
      key: '2400212',
      inhibition: STATIC_INV_FAULT_PHASE_INHIBITION,
      codes: ['240021201'],
      title: ' STATIC INV FAULT',
      raiseWith: [['L:A32NX_ELEC_STAT_INV_FAULT', 1]],
    },
  ];

  it('raises each alert from the electrical system simvars, as an amber caution of the ELEC page', () => {
    const fwc = startCruiseFwc(simvars).fwc;
    // the APU generator works normally, its line contactor is open
    simvars.set('L:A32NX_ELEC_APU_GEN_1_LOAD_NORMAL', 1);
    runFwc(fwc, 1);
    for (const alertCase of ALERT_CASES) {
      const item = fwc.ewdMessageFailures[alertCase.key];
      expect(item.simVarIsActive.get(), `${alertCase.key} before`).toBe(false);
      const normalValues = alertCase.raiseWith.map(([name]) => simvars.get(name) ?? 0);
      alertCase.raiseWith.forEach(([name, value]) => simvars.set(name, value));
      runFwc(fwc, 2);
      expect(item.simVarIsActive.get(), `${alertCase.key} raised`).toBe(true);
      alertCase.raiseWith.forEach(([name], index) => simvars.set(name, normalValues[index]));
      runFwc(fwc, 2);
      expect(item.simVarIsActive.get(), `${alertCase.key} cleared`).toBe(false);

      expect(item.flightPhaseInhib, alertCase.key).toEqual(alertCase.inhibition);
      expect(item.failure, alertCase.key).toBe(2);
      expect(item.sysPage, alertCase.key).toBe(EcamSysPage.ELEC);
      expect(item.codesToReturn, alertCase.key).toEqual(alertCase.codes);
      expect(plain(formatEwdMessages(alertCase.codes)[0]), alertCase.key).toContain(alertCase.title.trim());
    }
  });

  it('does not raise the IDG alerts of a disconnected IDG, nor an overload with the line contactor open', () => {
    const fwc = startCruiseFwc(simvars).fwc;
    simvars.set('L:A32NX_ELEC_ENG_GEN_1_IDG_IS_CONNECTED', 0);
    simvars.set('L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_LOW_PRESSURE', 1);
    simvars.set('L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE', IDG_OIL_OVERHEAT_CELSIUS + 10);
    simvars.set('L:A32NX_ELEC_CONTACTOR_9XU2_IS_CLOSED', 0);
    simvars.set('L:A32NX_ELEC_ENG_GEN_2_LOAD_NORMAL', 0);
    runFwc(fwc, 2);
    for (const key of ['2400205', '2400207', '2400210']) {
      expect(isAlertTriggered(fwc, key), key).toBe(false);
    }
  });

  it('shows the procedure lines of the IDG and APU GEN alerts, and the GALY & CAB line while the pb-sw is AUTO', () => {
    expect(plain(formatEwdMessages(['240020502'])[0])).toContain('-IDG 1..............OFF');
    expect(plain(formatEwdMessages(['240020802'])[0])).toContain('-IDG 2..............OFF');
    expect(plain(formatEwdMessages(['240021102'])[0])).toContain('-GALY/CAB...........OFF');

    const fwc = startCruiseFwc(simvars).fwc;
    const overload = fwc.ewdMessageFailures['2400209'];
    simvars.set('L:A32NX_OVHD_ELEC_GALY_AND_CAB_PB_IS_AUTO', 1);
    runFwc(fwc, 1);
    expect(overload.whichCodeToReturn()).toEqual(genOverloadLines(false));
    simvars.set('L:A32NX_OVHD_ELEC_GALY_AND_CAB_PB_IS_AUTO', 0);
    runFwc(fwc, 1);
    expect(overload.whichCodeToReturn()).toEqual(genOverloadLines(true));
  });

  it('has the STATUS texts', () => {
    expect(formatStatusPage(['240200201'], []).left).toContain('APU BAT START NOT AVAIL');
    expect(formatStatusPage([], ['240300205']).right).toContain('GALY/CAB');
  });
});
