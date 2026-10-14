// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  CTL_SYS_FAULT_LEVEL,
  CTL_SYS_FAULT_PHASE_INHIBITION,
  ctlSysFaultItems,
  ENG_TYPE_DISAGREE_KEY,
  ENG_TYPE_DISAGREE_LEVEL,
  ENG_TYPE_DISAGREE_PHASE_INHIBITION,
  ENGINE_MONITORING_ALERTS,
  ENGINE_MONITORING_ALERT_LEVEL,
  engineMonitoringAlertLevel,
  FadecShutdownReason,
  isCtlSysFaultActive,
  isEngineTypeDisagree,
  HP_FUEL_VLV_FAULT_LEVEL,
  HP_FUEL_VLV_FAULT_PHASE_INHIBITION,
  HpFuelValveFault,
  hpFuelVlvFaultItems,
  isHpFuelVlvFaultActive,
} from './EngineMonitoringAlerts';

const ata70 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
  'utf-8',
);
/** One procedure of ata70.ts, from its id to the end of its object */
const block = (id: number) => {
  const start = ata70.indexOf(`  ${id}: {`);
  return ata70.slice(start, ata70.indexOf('\n  },', start));
};
/** The item names of one procedure of ata70.ts */
const itemNames = (id: number) =>
  (block(id).match(/\{ name: '[^']*'/g) ?? []).map((item) => item.substring("{ name: '".length, item.length - 1));

const notOpenOnGround = {
  fault: HpFuelValveFault.NotOpen,
  onGround: true,
  masterOn: true,
  manualStartPbOn: false,
  firePbReleased: false,
};

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) HP FUEL VLV FAULT, a380_fcom.txt l.172172-172226 */
describe('ENG n HP FUEL VLV FAULT', () => {
  it('is active while the FADEC reports an abnormal valve position', () => {
    expect(isHpFuelVlvFaultActive(HpFuelValveFault.None)).toBe(false);
    expect(isHpFuelVlvFaultActive(HpFuelValveFault.NotOpen)).toBe(true);
    expect(isHpFuelVlvFaultActive(HpFuelValveFault.NotClosed)).toBe(true);
  });

  it('during the engine start: HP FUEL VALVE NOT OPEN, ENG MASTER OFF', () => {
    const items = hpFuelVlvFaultItems(notOpenOnGround);
    expect(items.show).toEqual([true, false, true, false, false, false, false]);
    expect(items.checked[2]).toBe(false);
    expect(hpFuelVlvFaultItems({ ...notOpenOnGround, masterOn: false }).checked[2]).toBe(true);
  });

  it('asks for MAN START OFF in the case of a manual engine start', () => {
    const items = hpFuelVlvFaultItems({ ...notOpenOnGround, manualStartPbOn: true });
    expect(items.show).toEqual([true, true, true, false, false, false, false]);
    expect(items.checked[1]).toBe(false);
  });

  it('during the engine shutdown: HP FUEL VALVE NOT CLOSED, MASTER OFF, and the ENG FIRE P/B on the ground', () => {
    const shutdown = { ...notOpenOnGround, fault: HpFuelValveFault.NotClosed, masterOn: false };
    expect(hpFuelVlvFaultItems(shutdown).show).toEqual([false, false, false, true, false, true, true]);
    expect(hpFuelVlvFaultItems(shutdown).checked[5]).toBe(true);
    expect(hpFuelVlvFaultItems(shutdown).checked[6]).toBe(false);
    expect(hpFuelVlvFaultItems({ ...shutdown, firePbReleased: true }).checked[6]).toBe(true);
    expect(hpFuelVlvFaultItems({ ...shutdown, onGround: false }).show[6]).toBe(false);
  });

  it('is an amber caution with single chime and MASTER CAUT, inhibited as on the FCOM figure (PDF page 5789)', () => {
    expect(HP_FUEL_VLV_FAULT_LEVEL).toBe(2);
    expect(HP_FUEL_VLV_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('has its items in ata70', () => {
    for (const engine of [1, 2, 3, 4]) {
      expect(itemNames(701800052 + engine)).toEqual([
        'HP FUEL VALVE NOT OPEN',
        `ENG ${engine} MAN START`,
        `ENG ${engine} MASTER`,
        'HP FUEL VALVE NOT CLOSED',
        `ENG ${engine} MAN START`,
        `ENG ${engine} MASTER`,
        `ENG ${engine} FIRE P/B`,
      ]);
    }
  });
});

describe('FADEC fault crew awareness alerts', () => {
  const byVariable = (variable: string) => ENGINE_MONITORING_ALERTS.find((alert) => alert.variable === variable);

  it('have the ata70 keys and flight phase inhibitions of the FCOM figures', () => {
    expect(byVariable('FUEL_STRAINER_CLOGGED')).toEqual({
      variable: 'FUEL_STRAINER_CLOGGED',
      engine1Key: 701800045,
      flightPhaseInhibition: [3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(byVariable('FUEL_FILTER_MONITORING_FAULT')?.flightPhaseInhibition).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(byVariable('OIL_CHIP_DETECTED')?.flightPhaseInhibition).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const variable of ['MINOR_FAULT', 'OVERTHRUST_PROTECTION_LOST', 'SENSOR_FAULT']) {
      expect(byVariable(variable)?.flightPhaseInhibition).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    expect(ENGINE_MONITORING_ALERT_LEVEL).toBe(1);
  });

  it('are the ata70 alerts of their titles', () => {
    const titles: [string, string][] = [
      ['FUEL_STRAINER_CLOGGED', 'FUEL STRAINER CLOGGED'],
      ['FUEL_FILTER_MONITORING_FAULT', 'FUEL FILTER MONITORING FAULT'],
      ['OIL_CHIP_DETECTED', 'OIL CHIP DETECTED'],
      ['MINOR_FAULT', 'MINOR FAULT'],
      ['OVERTHRUST_PROTECTION_LOST', 'OVTHR PROT LOST'],
      ['SENSOR_FAULT', 'SENSOR FAULT'],
    ];
    for (const [variable, title] of titles) {
      const alert = byVariable(variable);
      if (!alert) {
        throw new Error(`no alert for ${variable}`);
      }
      for (const engine of [1, 2, 3, 4]) {
        expect(block(alert.engine1Key + engine - 1)).toContain(`mENG\\x1bm ${engine} ${title}',`);
      }
    }
  });

  it('are the variables the systems WASM writes (systems engine/engine_monitoring_fault.rs)', () => {
    const rust = readFileSync(
      resolve(__dirname, '../../../../../../fbw-common/src/wasm/systems/systems/src/engine/engine_monitoring_fault.rs'),
      'utf-8',
    );
    for (const alert of ENGINE_MONITORING_ALERTS) {
      expect(rust).toContain(`=> "${alert.variable}",`);
    }
  });
});

/* FCOM audit T2-44 (row B25): the FADEC fault alerts of the flyPad failures of T2-20 */
describe('CTL VLV FAULT, FADEC IDENT FAULT, FUEL SYS and OIL SYS CONTAMINATION', () => {
  const byVariable = (variable: string) => ENGINE_MONITORING_ALERTS.find((alert) => alert.variable === variable);

  it('are crew awareness alerts (CTL VLV, FADEC IDENT) and cautions (CONTAMINATION) as on the FCOM figures', () => {
    expect(byVariable('CTL_VLV_FAULT')).toEqual({
      variable: 'CTL_VLV_FAULT',
      engine1Key: 701800005,
      flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(byVariable('FADEC_IDENT_FAULT')).toEqual({
      variable: 'FADEC_IDENT_FAULT',
      engine1Key: 701800017,
      flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
    for (const [variable, engine1Key] of [
      ['FUEL_SYS_CONTAMINATION', 701800049],
      ['OIL_SYS_CONTAMINATION', 701800089],
    ] as [string, number][]) {
      expect(byVariable(variable)).toEqual({
        variable,
        engine1Key,
        flightPhaseInhibition: [3, 4, 5, 6, 7, 9, 10],
        caution: true,
      });
    }
  });

  it('give the cautions single chime and MASTER CAUT, the others none', () => {
    const levels = ENGINE_MONITORING_ALERTS.map((alert) => [alert.variable, engineMonitoringAlertLevel(alert)]);
    expect(levels).toEqual([
      ['FUEL_STRAINER_CLOGGED', 1],
      ['FUEL_FILTER_MONITORING_FAULT', 1],
      ['OIL_CHIP_DETECTED', 1],
      ['MINOR_FAULT', 1],
      ['OVERTHRUST_PROTECTION_LOST', 1],
      ['SENSOR_FAULT', 1],
      ['CTL_VLV_FAULT', 1],
      ['FADEC_IDENT_FAULT', 1],
      ['FUEL_SYS_CONTAMINATION', 2],
      ['OIL_SYS_CONTAMINATION', 2],
    ]);
  });

  it('are the ata70 alerts of their titles', () => {
    for (const [variable, title] of [
      ['CTL_VLV_FAULT', 'CTL VLV FAULT'],
      ['FADEC_IDENT_FAULT', 'FADEC IDENT FAULT'],
      ['FUEL_SYS_CONTAMINATION', 'FUEL SYS CONTAMINATION'],
      ['OIL_SYS_CONTAMINATION', 'OIL SYS CONTAMINATION'],
    ]) {
      for (const engine of [1, 2, 3, 4]) {
        expect(block((byVariable(variable)?.engine1Key ?? 0) + engine - 1)).toContain(
          `mENG\\x1bm ${engine} ${title}',`,
        );
      }
    }
  });
});

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) CTL SYS FAULT, a380_fcom.txt l.171310-171445 */
describe('ENG n CTL SYS FAULT', () => {
  const noTrigger = {
    controlSystemFault: false,
    fadecShutdownReason: FadecShutdownReason.None,
    overthrustCutback: false,
  };

  it('triggers with the control system failure, the overthrust fuel cutback and the overthrust shutdown', () => {
    expect(isCtlSysFaultActive(noTrigger)).toBe(false);
    expect(isCtlSysFaultActive({ ...noTrigger, controlSystemFault: true })).toBe(true);
    expect(isCtlSysFaultActive({ ...noTrigger, overthrustCutback: true })).toBe(true);
    expect(isCtlSysFaultActive({ ...noTrigger, fadecShutdownReason: FadecShutdownReason.ThrustControlLost })).toBe(
      true,
    );
    // a FADEC overheat shutdown gives ENG FAIL only
    expect(isCtlSysFaultActive({ ...noTrigger, fadecShutdownReason: FadecShutdownReason.FadecOverheat })).toBe(false);
  });

  it('asks for THR LEVER IDLE and ENG MASTER OFF on ground, and in flight after an overthrust fuel cutback', () => {
    const failure = { ...noTrigger, controlSystemFault: true };
    expect(ctlSysFaultItems(failure, true, false, true)).toEqual({ show: [true, true], checked: [false, false] });
    expect(ctlSysFaultItems(failure, false, false, true).show).toEqual([false, false]);
    const cutback = { ...noTrigger, overthrustCutback: true };
    expect(ctlSysFaultItems(cutback, false, true, false)).toEqual({ show: [true, true], checked: [true, true] });
  });

  it('is a caution with single chime and MASTER CAUT, phases 5 and 6 inhibited (PDF page 5765)', () => {
    expect(CTL_SYS_FAULT_LEVEL).toBe(2);
    expect(CTL_SYS_FAULT_PHASE_INHIBITION).toEqual([5, 6]);
  });

  it('has the THR LEVER and ENG MASTER items in ata70', () => {
    for (const engine of [1, 2, 3, 4]) {
      expect(itemNames(701800000 + engine)).toEqual([`THR LEVER ${engine}`, `ENG ${engine} MASTER`]);
    }
  });
});

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG TYPE DISAGREE, a380_fcom.txt l.175642-175655 */
describe('ENG TYPE DISAGREE', () => {
  it('triggers when the thrust rating of any engine differs', () => {
    expect(isEngineTypeDisagree([false, false, false, false])).toBe(false);
    expect(isEngineTypeDisagree([false, false, true, false])).toBe(true);
  });

  it('is the ata70 alert 701800161, a caution with phases 3 to 12 inhibited (PDF page 5873)', () => {
    expect(ENG_TYPE_DISAGREE_KEY).toBe(701800161);
    expect(block(ENG_TYPE_DISAGREE_KEY)).toContain("mENG\\x1bm TYPE DISAGREE',");
    expect(ENG_TYPE_DISAGREE_LEVEL).toBe(2);
    expect(ENG_TYPE_DISAGREE_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('FWS wiring of the FADEC fault alerts', () => {
  const abnormal = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

  it('adds the alerts to the abnormal sensed procedures', () => {
    expect(abnormal).toContain('    ...this.engineMonitoringAlerts(),');
    expect(abnormal).toContain('alerts[701800053 + index] = {');
    expect(abnormal).toContain('alerts[alert.engine1Key + index] = {');
  });

  it('reads the HP fuel valve fault and the FADEC faults of each engine', () => {
    expect(core).toContain('`L:A32NX_ENGINE_${engine}_HP_FUEL_VALVE_FAULT`');
    expect(core).toContain("SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engine}_${alert.variable}`, 'bool') > 0");
  });

  it('gives the cautions their level and the ENGINE SD page', () => {
    expect(abnormal).toContain('failure: engineMonitoringAlertLevel(alert),');
    expect(abnormal).toContain('sysPage: alert.caution ? SdPages.Eng : SdPages.None,');
  });

  it('wires CTL SYS FAULT and TYPE DISAGREE', () => {
    expect(abnormal).toContain('alerts[701800001 + index] = {');
    expect(abnormal).toContain('simVarIsActive: this.fws.engineCtlSysFault[index],');
    expect(abnormal).toContain('alerts[ENG_TYPE_DISAGREE_KEY] = {');
    expect(core).toContain('`L:A32NX_ENGINE_${engine}_CTL_SYS_FAULT`');
    expect(core).toContain('`L:A32NX_ENGINE_${engine}_FADEC_SHUTDOWN`');
    expect(core).toContain('`L:A32NX_ENGINE_${engine}_OVERTHRUST_CUTBACK`');
    expect(core).toContain('`L:A32NX_ENGINE_${engine}_TYPE_DISAGREE`');
  });
});
