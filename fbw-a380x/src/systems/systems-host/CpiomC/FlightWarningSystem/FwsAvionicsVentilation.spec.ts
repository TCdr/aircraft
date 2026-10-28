// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { AVIONICS_VENTILATION_PHASE_INHIBITION, AVS_BITS } from './FwsAirCondAlerts';

// The EcamMessages modules cannot be imported in a test (circular imports with their enums): read the sources instead
const sourceOf = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');
const cpiomB = sourceOf('../../../../wasm/systems/a380_systems/src/air_conditioning/cpiom_b.rs');
const abnormalSensed = sourceOf('./FwsAbnormalSensed.ts');
const ecamMessageIndex = sourceOf('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts');
const ata21Messages = sourceOf(
  '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23.ts',
);

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
];

/** The source text of the FwsAbnormalSensed entry of an alert */
function entryOf(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = abnormalSensed.slice(start);
  return rest.slice(0, /\r?\n {4}\},/.exec(rest)?.index ?? rest.length);
}

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
    expect(methodByBit.size).toBe(Object.values(AVS_BITS).length);
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
    const entry = entryOf(id);
    expect(entry).toContain('flightPhaseInhib: AVIONICS_VENTILATION_PHASE_INHIBITION');
    expect(ata21Messages).toContain(`  ${id}: {`);
  });

  it('shows one ECAM line per FWS item entry of the alerts that have procedure lines', () => {
    const itemCountOfMessage = (id: string) => {
      const start = ata21Messages.indexOf(`  ${id}: {`);
      const rest = ata21Messages.slice(start);
      const block = rest.slice(0, /\r?\n {2}\},/.exec(rest)?.index ?? rest.length);
      return [...block.matchAll(/^ {8}name: /gm)].length;
    };

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
  });

  it('only names INOP SYS and LIMITATION lines that exist', () => {
    const referenced = AVIONICS_VENTILATION_ALERTS.flatMap((id) => [
      ...entryOf(id).matchAll(/'(21(?:23|04)000\d\d)'/g),
    ]).map((match) => match[1]);

    expect(referenced.length).toBeGreaterThanOrEqual(10);
    for (const code of referenced) {
      expect(ecamMessageIndex).toContain(`  ${code}: `);
    }
  });

  it('raises the 5 minute limitation of the BLOWING FAULT only once the alert persists', () => {
    expect(entryOf('212800014')).toContain(
      "limitationsAllPhases: () => (this.fws.avncsBlowingFaultPersists.get() ? ['210400006'] : [])",
    );
  });
});
