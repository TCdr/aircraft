// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  ENGINE_MONITORING_ALERTS,
  ENGINE_MONITORING_ALERT_LEVEL,
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
});
