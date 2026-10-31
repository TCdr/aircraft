// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { describe, expect, it } from 'vitest';
import {
  EcamAbnormalProcedures,
  EcamInopSys,
  EcamLimitations,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';
import { AVIONICS_VENTILATION_PHASE_INHIBITION, AVS_BITS } from './FwsAirCondAlerts';

// The Rust CPIOM B model is not importable in vitest: this one test still reads its source
const cpiomB = readFileSync(
  resolve(__dirname, '../../../../wasm/systems/a380_systems/src/air_conditioning/cpiom_b.rs'),
  'utf-8',
);
const { core, simVars } = createFws();
const alert = (id: string) => core.abnormalSensed.ewdAbnormalSensed[Number(id)];

/** The alerts of the avionics ventilation, the supplemental cooling and the THS bay ventilation */
const AVIONICS_VENTILATION_ALERTS = [
  '212800006', // COND AVNCS VENT CTL FAULT
  '212800014', // VENT AVNCS BLOWING FAULT
  '212800015', // VENT AVNCS EXTRACT FAULT
  '212800016', // VENT AVNCS L BLOWING FAULT
  '212800017', // VENT AVNCS R BLOWING FAULT
  '212800018', // VENT AVNCS OVBD VLV FAULT
  '212800019', // VENT COOLG SYS 1 OVHT
  '212800020', // VENT COOLG SYS 2 OVHT
  '212800021', // VENT COOLG SYS PROT FAULT
  '212800028', // VENT THS BAY VENT FAULT
  '212800029', // VENT AVNCS BLOWING DEGRADED
];

describe('A380X FWS avionics ventilation word', () => {
  it('reads the bits the CPIOM B interface sets in the AVS word', () => {
    const methodByBit = new Map<number, string>();
    for (const [, bit, method] of cpiomB.matchAll(
      /discrete_word_avs\s*\.set_bit\(\s*(\d+),\s*avionics_ventilation\s*\.(\w+)\(/g,
    )) {
      methodByBit.set(Number(bit), method);
    }

    expect(methodByBit.get(AVS_BITS.leftCircuitNotVentilated)).toBe('circuit_not_ventilated');
    expect(methodByBit.get(AVS_BITS.rightCircuitNotVentilated)).toBe('circuit_not_ventilated');
    expect(methodByBit.get(AVS_BITS.extractFault)).toBe('extract_fault');
    expect(methodByBit.get(AVS_BITS.overboardValveFault)).toBe('overboard_valve_fault');
    expect(methodByBit.get(AVS_BITS.overboardValveFullyOpen)).toBe('overboard_valve_fully_open');
    expect(methodByBit.get(AVS_BITS.controllerFault)).toBe('controller_fault');
    expect(methodByBit.get(AVS_BITS.coolingSystem1Overheat)).toBe('cooling_overheat');
    expect(methodByBit.get(AVS_BITS.coolingSystem2Overheat)).toBe('cooling_overheat');
    expect(methodByBit.get(AVS_BITS.coolingProtectionFault)).toBe('cooling_protection_fault');
    expect(methodByBit.get(AVS_BITS.thsBayVentilationFault)).toBe('ths_bay_ventilation_fault');
    expect(methodByBit.get(AVS_BITS.leftCircuitOnBackup)).toBe('circuit_on_backup');
    expect(methodByBit.get(AVS_BITS.rightCircuitOnBackup)).toBe('circuit_on_backup');
    expect(methodByBit.size).toBe(Object.values(AVS_BITS).length);
  });

  it('reads the two circuit on backup bits into the subjects the BLOWING DEGRADED alert uses', () => {
    expect(AVS_BITS.leftCircuitOnBackup).toBe(23);
    expect(AVS_BITS.rightCircuitOnBackup).toBe(24);
    const avsWord = Arinc429Register.empty();
    avsWord.setSsm(Arinc429SignStatusMatrix.NormalOperation);
    avsWord.setBitValue(AVS_BITS.leftCircuitOnBackup, true);
    simVars.set('L:A32NX_COND_CPIOM_B1_AVS_DISCRETE_WORD', avsWord.rawWord);
    runFwsCycle(core);
    expect(core.avncsLeftCircuitOnBackup.get()).toBe(true);
    expect(core.avncsRightCircuitOnBackup.get()).toBe(false);
    avsWord.setBitValue(AVS_BITS.leftCircuitOnBackup, false);
    avsWord.setBitValue(AVS_BITS.rightCircuitOnBackup, true);
    simVars.set('L:A32NX_COND_CPIOM_B1_AVS_DISCRETE_WORD', avsWord.rawWord);
    runFwsCycle(core);
    expect(core.avncsLeftCircuitOnBackup.get()).toBe(false);
    expect(core.avncsRightCircuitOnBackup.get()).toBe(true);
  });

  it('uses one bit per condition', () => {
    const bits = Object.values(AVS_BITS);
    expect(new Set(bits).size).toBe(bits.length);
  });

  it('is inhibited at take-off and landing only', () => {
    expect(AVIONICS_VENTILATION_PHASE_INHIBITION).toEqual([3, 4, 5, 7]);
  });
});

describe('A380X FWS avionics ventilation alerts', () => {
  it.each(AVIONICS_VENTILATION_ALERTS)('alert %s has a FWS entry with the avionics ventilation inhibition', (id) => {
    expect(alert(id).flightPhaseInhib).toEqual(AVIONICS_VENTILATION_PHASE_INHIBITION);
    expect(EcamAbnormalProcedures[Number(id)]).toBeDefined();
  });

  it('shows one ECAM line per FWS item entry of the alerts that have procedure lines', () => {
    const itemCountOfMessage = (id: string) => EcamAbnormalProcedures[Number(id)].items.length;

    expect(itemCountOfMessage('212800014')).toBe(4);
    expect(itemCountOfMessage('212800015')).toBe(1);
    expect(itemCountOfMessage('212800016')).toBe(2);
    expect(itemCountOfMessage('212800017')).toBe(2);
    expect(itemCountOfMessage('212800018')).toBe(5);
    expect(itemCountOfMessage('212800019')).toBe(3);
    expect(itemCountOfMessage('212800020')).toBe(3);
    expect(itemCountOfMessage('212800006')).toBe(0);
    expect(itemCountOfMessage('212800021')).toBe(0);
    expect(itemCountOfMessage('212800028')).toBe(0);
    expect(itemCountOfMessage('212800029')).toBe(0);
  });

  it('only names INOP SYS and LIMITATION lines that exist', () => {
    core.avncsBlowingFaultPersists.set(true);
    const referenced: string[] = [];
    for (const id of AVIONICS_VENTILATION_ALERTS) {
      const entry = alert(id);
      for (const inopSysCode of entry.inopSysAllPhases?.([]) ?? []) {
        expect(EcamInopSys[inopSysCode as string], `${id} INOP SYS ${inopSysCode}`).toBeDefined();
        referenced.push(inopSysCode as string);
      }
      for (const limitationCode of entry.limitationsAllPhases?.([]) ?? []) {
        expect(EcamLimitations[limitationCode as string], `${id} LIMITATION ${limitationCode}`).toBeDefined();
        referenced.push(limitationCode as string);
      }
    }
    expect(referenced.length).toBeGreaterThanOrEqual(10);
  });

  it('raises the 5 minute limitation of the BLOWING FAULT only once the alert persists', () => {
    core.avncsBlowingFaultPersists.set(false);
    expect(alert('212800014').limitationsAllPhases?.([])).toEqual([]);
    core.avncsBlowingFaultPersists.set(true);
    expect(alert('212800014').limitationsAllPhases?.([])).toEqual(['210400006']);
  });

  it('raises the BLOWING DEGRADED awareness message only with both circuits on their backup valves', () => {
    const entry = alert('212800029');

    core.avncsLeftCircuitOnBackup.set(true);
    core.avncsRightCircuitOnBackup.set(false);
    expect((entry.simVarIsActive as { get(): boolean }).get()).toBe(false);
    core.avncsRightCircuitOnBackup.set(true);
    expect((entry.simVarIsActive as { get(): boolean }).get()).toBe(true);
    expect(entry.failure).toBe(1);
    expect(entry.sysPage).toBe(SdPages.None);
    expect(entry.notActiveWhenItemActive).toEqual(['212800014', '212800016', '212800017']);
    expect(EcamAbnormalProcedures[212800029].title).toContain('AVNCS BLOWING DEGRADED');
  });
});
