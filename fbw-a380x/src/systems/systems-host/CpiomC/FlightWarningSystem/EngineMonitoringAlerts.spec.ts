// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SdPages } from '@shared/EcamSystemPages';
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
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle, procedureItemNames } from './FwsSpecFixture';

const messageTitle = (id: number) => EcamAbnormalProcedures[id].title;
const { core, simVars } = createFws();
const sensed = (id: number) => core.abnormalSensed.ewdAbnormalSensed[id];

const notOpenOnGround = {
  fault: HpFuelValveFault.NotOpen,
  onGround: true,
  masterOn: true,
  manualStartPbOn: false,
  firePbReleased: false,
};

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

  it('is an amber caution with single chime and MASTER CAUT, inhibited as on the aircraft', () => {
    expect(HP_FUEL_VLV_FAULT_LEVEL).toBe(2);
    expect(HP_FUEL_VLV_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('has its items in ata70', () => {
    for (const engine of [1, 2, 3, 4]) {
      expect(procedureItemNames(701800052 + engine)).toEqual([
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

  it('have the ata70 keys and flight phase inhibitions of the aircraft', () => {
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
        expect(messageTitle(alert.engine1Key + engine - 1)).toContain(`mENG\x1bm ${engine} ${title}`);
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

describe('OIL FILTER MONITORING FAULT, LP SHAFT PROT LOST and ENG FUEL LEAK', () => {
  const byVariable = (variable: string) => ENGINE_MONITORING_ALERTS.find((alert) => alert.variable === variable);

  it('are crew awareness alerts of the four engines with their own ata70 keys', () => {
    expect(byVariable('OIL_FILTER_MONITORING_FAULT')).toEqual({
      variable: 'OIL_FILTER_MONITORING_FAULT',
      engine1Key: 701800170,
      flightPhaseInhibition: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(byVariable('LP_SHAFT_PROTECTION_LOST')).toEqual({
      variable: 'LP_SHAFT_PROTECTION_LOST',
      engine1Key: 701800174,
      flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    for (const [variable, title] of [
      ['OIL_FILTER_MONITORING_FAULT', 'OIL FILTER MONITORING FAULT'],
      ['LP_SHAFT_PROTECTION_LOST', 'LP SHAFT PROT LOST'],
    ]) {
      const alert = byVariable(variable);
      for (const engine of [1, 2, 3, 4]) {
        expect(messageTitle((alert?.engine1Key ?? 0) + engine - 1)).toContain(`mENG\x1bm ${engine} ${title}`);
      }
    }
  });

  it('gives ENG n FUEL LEAK its procedure: ENG FUEL PARAMETERS CHECK, then thrust lever idle and master off if leaking', () => {
    for (const engine of [1, 2, 3, 4]) {
      const id = 701800040 + engine;
      const items = EcamAbnormalProcedures[id].items as unknown as Record<string, unknown>[];
      expect(messageTitle(id)).toContain(`mENG\x1bm ${engine} FUEL LEAK`);
      expect(items).toContainEqual(expect.objectContaining({ name: 'ENG FUEL PARAMETERS' }));
      expect(items).toContainEqual(expect.objectContaining({ name: 'FUEL LEAK', sensed: false, condition: true }));
      expect(items).toContainEqual(
        expect.objectContaining({ name: `THR LEVER ${engine}`, sensed: true, labelNotCompleted: 'IDLE' }),
      );
      expect(items).toContainEqual(
        expect.objectContaining({ name: `ENG ${engine} MASTER`, sensed: true, labelNotCompleted: 'OFF' }),
      );
    }
  });

  it('lists the ENG FUEL LEAK alert as a caution with the ENGINE SD page', () => {
    for (const engine of [1, 2, 3, 4]) {
      const entry = sensed(701800040 + engine);
      expect(entry.simVarIsActive).toBe(core.engineFuelLeak[engine - 1]);
      expect(entry.failure).toBe(2);
      expect(entry.sysPage).toBe(SdPages.Eng);
      expect(entry.whichItemsToShow()).toEqual([true, true, true, true]);
    }
  });
});

describe('CTL VLV FAULT, FADEC IDENT FAULT, FUEL SYS and OIL SYS CONTAMINATION', () => {
  const byVariable = (variable: string) => ENGINE_MONITORING_ALERTS.find((alert) => alert.variable === variable);

  it('are crew awareness alerts (CTL VLV, FADEC IDENT) and cautions (CONTAMINATION) as on the aircraft', () => {
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
      ['OIL_FILTER_MONITORING_FAULT', 1],
      ['LP_SHAFT_PROTECTION_LOST', 1],
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
        expect(messageTitle((byVariable(variable)?.engine1Key ?? 0) + engine - 1)).toContain(
          `mENG\x1bm ${engine} ${title}`,
        );
      }
    }
  });
});

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

  it('is a caution with single chime and MASTER CAUT, phases 5 and 6 inhibited', () => {
    expect(CTL_SYS_FAULT_LEVEL).toBe(2);
    expect(CTL_SYS_FAULT_PHASE_INHIBITION).toEqual([5, 6]);
  });

  it('has the THR LEVER and ENG MASTER items in ata70', () => {
    for (const engine of [1, 2, 3, 4]) {
      expect(procedureItemNames(701800000 + engine)).toEqual([`THR LEVER ${engine}`, `ENG ${engine} MASTER`]);
    }
  });
});

describe('ENG TYPE DISAGREE', () => {
  it('triggers when the thrust rating of any engine differs', () => {
    expect(isEngineTypeDisagree([false, false, false, false])).toBe(false);
    expect(isEngineTypeDisagree([false, false, true, false])).toBe(true);
  });

  it('is the ata70 alert 701800161, a caution with phases 3 to 12 inhibited', () => {
    expect(ENG_TYPE_DISAGREE_KEY).toBe(701800161);
    expect(messageTitle(ENG_TYPE_DISAGREE_KEY)).toContain('mENG\x1bm TYPE DISAGREE');
    expect(ENG_TYPE_DISAGREE_LEVEL).toBe(2);
    expect(ENG_TYPE_DISAGREE_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('FWS wiring of the FADEC fault alerts', () => {
  const activeFlags = (flags: { get(): boolean }[]) => flags.map((flag) => flag.get());

  it('adds an abnormal sensed procedure for each engine of every FADEC fault alert', () => {
    ENGINE_MONITORING_ALERTS.forEach((alert, alertIndex) => {
      for (const engineIndex of [0, 1, 2, 3]) {
        const entry = sensed(alert.engine1Key + engineIndex);
        expect(entry.simVarIsActive).toBe(core.engineMonitoringAlertActive[alertIndex][engineIndex]);
        expect(entry.flightPhaseInhib).toEqual(alert.flightPhaseInhibition);
      }
    });
    for (const engineIndex of [0, 1, 2, 3]) {
      expect(sensed(701800053 + engineIndex).simVarIsActive).toBe(core.engineHpFuelVlvFaultActive[engineIndex]);
    }
  });

  it('gives the cautions their level and the ENGINE SD page', () => {
    ENGINE_MONITORING_ALERTS.forEach((alert) => {
      const entry = sensed(alert.engine1Key);
      expect(entry.failure).toBe(engineMonitoringAlertLevel(alert));
      expect(entry.sysPage).toBe(alert.caution ? SdPages.Eng : SdPages.None);
    });
  });

  it('reads the HP fuel valve fault and the FADEC faults of each engine from their simvars', () => {
    simVars.set('L:A32NX_ENGINE_2_HP_FUEL_VALVE_FAULT', HpFuelValveFault.NotOpen);
    simVars.set('L:A32NX_ENGINE_3_FUEL_STRAINER_CLOGGED', 1);
    simVars.set('L:A32NX_ENGINE_4_FUEL_LEAK', 1);
    runFwsCycle(core);
    expect(activeFlags(core.engineHpFuelVlvFaultActive)).toEqual([false, true, false, false]);
    const strainerIndex = ENGINE_MONITORING_ALERTS.findIndex((alert) => alert.variable === 'FUEL_STRAINER_CLOGGED');
    expect(activeFlags(core.engineMonitoringAlertActive[strainerIndex])).toEqual([false, false, true, false]);
    expect(activeFlags(core.engineFuelLeak)).toEqual([false, false, false, true]);
  });

  it('wires CTL SYS FAULT and TYPE DISAGREE', () => {
    for (const engineIndex of [0, 1, 2, 3]) {
      const entry = sensed(701800001 + engineIndex);
      expect(entry.simVarIsActive).toBe(core.engineCtlSysFault[engineIndex]);
      expect(entry.flightPhaseInhib).toEqual(CTL_SYS_FAULT_PHASE_INHIBITION);
      expect(entry.failure).toBe(CTL_SYS_FAULT_LEVEL);
    }
    const typeDisagree = sensed(ENG_TYPE_DISAGREE_KEY);
    expect(typeDisagree.simVarIsActive).toBe(core.engineTypeDisagree);
    expect(typeDisagree.flightPhaseInhib).toEqual(ENG_TYPE_DISAGREE_PHASE_INHIBITION);
    expect(typeDisagree.failure).toBe(ENG_TYPE_DISAGREE_LEVEL);

    simVars.set('L:A32NX_ENGINE_1_CTL_SYS_FAULT', 1);
    simVars.set('L:A32NX_ENGINE_2_FADEC_SHUTDOWN', FadecShutdownReason.ThrustControlLost);
    simVars.set('L:A32NX_ENGINE_3_OVERTHRUST_CUTBACK', 1);
    simVars.set('L:A32NX_ENGINE_4_TYPE_DISAGREE', 1);
    runFwsCycle(core);
    expect(activeFlags(core.engineCtlSysFault)).toEqual([true, true, true, false]);
    expect(core.engineTypeDisagree.get()).toBe(true);
  });
});
