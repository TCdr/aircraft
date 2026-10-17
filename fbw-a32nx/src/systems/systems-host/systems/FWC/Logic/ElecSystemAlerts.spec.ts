// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  BAT_FAULT_PHASE_INHIBITION,
  BCL_FAULT_PHASE_INHIBITION,
  ElecSystemAlertMonitor,
  ElecSystemInputs,
  GEN_OVERLOAD_PHASE_INHIBITION,
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
import { orderStatusCodes } from '../../../../shared/src/StatusMessages';

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

describe('PseudoFWC ELEC system alerts', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
  const messages = readFileSync(resolve(__dirname, '../../../../shared/src/EwdMessages.ts'), 'utf-8');
  const statusMessages = readFileSync(resolve(__dirname, '../../../../shared/src/StatusMessages.ts'), 'utf-8');

  function alert(code: string): string {
    const start = fwc.indexOf(`    ${code}: {`);
    expect(start, `alert ${code}`).toBeGreaterThan(0);
    return fwc.substring(start, fwc.indexOf('\n    },', start));
  }

  it.each([
    ['2400201', 'batFault[0]', 'BAT_FAULT_PHASE_INHIBITION', "['240020101']", ' BAT 1 FAULT'],
    ['2400202', 'batFault[1]', 'BAT_FAULT_PHASE_INHIBITION', "['240020201']", ' BAT 2 FAULT'],
    ['2400203', 'bclFault[0]', 'BCL_FAULT_PHASE_INHIBITION', "['240020301']", ' BCL 1 FAULT'],
    ['2400204', 'bclFault[1]', 'BCL_FAULT_PHASE_INHIBITION', "['240020401']", ' BCL 2 FAULT'],
    ['2400205', 'idgOilLowPressure[0]', 'IDG_OIL_PHASE_INHIBITION', "['240020501', '240020502']", ' IDG 1 OIL LO PR'],
    ['2400206', 'idgOilLowPressure[1]', 'IDG_OIL_PHASE_INHIBITION', "['240020601', '240020602']", ' IDG 2 OIL LO PR'],
    ['2400207', 'idgOilOverheat[0]', 'IDG_OIL_PHASE_INHIBITION', "['240020701', '240020702']", ' IDG 1 OIL OVHT'],
    ['2400208', 'idgOilOverheat[1]', 'IDG_OIL_PHASE_INHIBITION', "['240020801', '240020802']", ' IDG 2 OIL OVHT'],
    ['2400209', 'genOverload[0]', 'GEN_OVERLOAD_PHASE_INHIBITION', "['240020901', '240020902']", ' GEN 1 OVERLOAD'],
    ['2400210', 'genOverload[1]', 'GEN_OVERLOAD_PHASE_INHIBITION', "['240021001', '240021002']", ' GEN 2 OVERLOAD'],
    ['2400211', 'apuGenOverload', 'GEN_OVERLOAD_PHASE_INHIBITION', "['240021101', '240021102']", ' APU GEN OVERLOAD'],
    ['2400212', 'staticInverterFault', 'STATIC_INV_FAULT_PHASE_INHIBITION', "['240021201']", ' STATIC INV FAULT'],
  ])('%s is an amber ELEC caution on %s', (code, subject, inhibition, codes, title) => {
    const item = alert(code);
    expect(item).toContain(`simVarIsActive: this.elecSystemAlerts.${subject},`);
    expect(item).toContain(`flightPhaseInhib: ${inhibition},`);
    expect(item).toContain('failure: 2,');
    expect(item).toContain('sysPage: EcamSysPage.ELEC,');
    expect(item).toContain(`codesToReturn: ${codes},`);
    const titleCode = codes.substring(2, 11);
    expect(messages).toContain(`['${titleCode}', { group: 'ELEC$3', text: '${title}' }],`);
  });

  it('has the procedure lines', () => {
    expect(messages).toContain("['240020502', { text: '\\x1b<5m -IDG 1..............OFF' }],");
    expect(messages).toContain("['240020802', { text: '\\x1b<5m -IDG 2..............OFF' }],");
    expect(messages).toContain("['240021102', { text: '\\x1b<5m -GALY/CAB...........OFF' }],");
  });

  it('has the STATUS texts', () => {
    expect(statusMessages).toContain(
      "['240200201', { part: StatusPart.Information, text: 'APU BAT START NOT AVAIL' }],",
    );
    expect(statusMessages).toContain("['240300205', { part: StatusPart.InopSys, text: 'GALY/CAB' }],");
  });

  it('reads the GALY & CAB push button and updates the monitor each cycle', () => {
    expect(fwc).toContain("RegisteredSimVar.createBoolean('L:A32NX_OVHD_ELEC_GALY_AND_CAB_PB_IS_AUTO')");
    expect(fwc).toContain('this.elecSystemAlerts.update(this.elecSystem.read());');
  });
});

describe('ELEC system acquisition', () => {
  const acquisition = readFileSync(resolve(__dirname, '../Acquisition/ElecSystemAcquisition.ts'), 'utf-8');

  it.each([
    'ELEC_BCL_${n}_BAT_FAULT',
    'ELEC_BCL_${n}_FAULT',
    'ELEC_ENG_GEN_${n}_IDG_IS_CONNECTED',
    'ELEC_ENG_GEN_${n}_IDG_OIL_LOW_PRESSURE',
    'L:A32NX_ELEC_ENG_GEN_${n}_IDG_OIL_OUTLET_TEMPERATURE',
    'ELEC_ENG_GEN_${n}_LOAD_NORMAL',
    'ELEC_CONTACTOR_9XU${n}_IS_CLOSED',
    "'ELEC_APU_GEN_1_LOAD_NORMAL'",
    "'ELEC_CONTACTOR_3XS_IS_CLOSED'",
    "'ELEC_STAT_INV_FAULT'",
  ])('reads %s from the Rust electrical system', (name) => {
    expect(acquisition).toContain(name);
  });
});
