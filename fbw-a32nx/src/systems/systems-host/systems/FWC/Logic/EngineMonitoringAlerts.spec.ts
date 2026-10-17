// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  FADEC_ALTERNATOR,
  HP_FUEL_VALVE_PHASE_INHIBITION,
  HpFuelValveFault,
  ONE_TLA_FAULT,
  OVSPD_PROT_FAULT,
  PROBES_FAULT,
  REV_SWITCH_FAULT,
  SENSOR_FAULT,
  SENSOR_FAULT_STATUS,
  hpFuelValveLines,
  isFadecAlternatorAlertActive,
  isHpFuelValveAlertActive,
  probesFaultInhibitedInPhase9,
  sensorFaultLines,
} from './EngineMonitoringAlerts';

const notOpenOnGround = {
  fault: HpFuelValveFault.NotOpen,
  engineAtOrAboveIdle: false,
  onGround: true,
  manualStartPbOn: false,
};

/* ENG 1(2) HP FUEL VALVE */
describe('ENG 1(2) HP FUEL VALVE', () => {
  it('is active while the FADEC reports an abnormal valve position', () => {
    expect(isHpFuelValveAlertActive(HpFuelValveFault.None)).toBe(false);
    expect(isHpFuelValveAlertActive(HpFuelValveFault.NotOpen)).toBe(true);
    expect(isHpFuelValveAlertActive(HpFuelValveFault.NotClosed)).toBe(true);
  });

  it('failed closed below idle on the ground: HP FUEL VALVE NOT OPEN then ENG MASTER OFF', () => {
    expect(hpFuelValveLines(notOpenOnGround)).toEqual([0, 1, 3]);
  });

  it('asks for MAN START OFF only after a manual start', () => {
    expect(hpFuelValveLines({ ...notOpenOnGround, manualStartPbOn: true })).toEqual([0, 1, 2, 3]);
  });

  it('has no action line in flight', () => {
    expect(hpFuelValveLines({ ...notOpenOnGround, onGround: false })).toEqual([0, 1]);
  });

  it('failed open below idle, or failed closed at or above idle: HP FUEL POS SWT FAULT', () => {
    expect(hpFuelValveLines({ ...notOpenOnGround, fault: HpFuelValveFault.NotClosed })).toEqual([0, 4]);
    expect(hpFuelValveLines({ ...notOpenOnGround, engineAtOrAboveIdle: true })).toEqual([0, 4]);
  });

  it('is inhibited in the aircraft flight phases', () => {
    expect(HP_FUEL_VALVE_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });
});

describe('FADEC fault crew awareness alerts', () => {
  it('have the aircraft flight phase inhibitions', () => {
    expect(FADEC_ALTERNATOR.flightPhaseInhibition).toEqual([3, 4, 5, 7, 8]);
    expect(OVSPD_PROT_FAULT.flightPhaseInhibition).toEqual([3, 4, 5, 7, 8]);
    expect(PROBES_FAULT.flightPhaseInhibition).toEqual([3, 4, 5, 7, 8]);
    expect(SENSOR_FAULT.flightPhaseInhibition).toEqual([4, 5, 7, 8]);
    expect(ONE_TLA_FAULT.flightPhaseInhibition).toEqual([3, 4, 5, 6, 7, 8]);
    expect(REV_SWITCH_FAULT.flightPhaseInhibition).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('PROBES FAULT is inhibited during the first 60 s of the flight phase 9', () => {
    expect(probesFaultInhibitedInPhase9(9, 59)).toBe(true);
    expect(probesFaultInhibitedInPhase9(9, 61)).toBe(false);
    expect(probesFaultInhibitedInPhase9(10, 0)).toBe(false);
  });

  it('FADEC ALTERNATOR needs a running engine', () => {
    expect(isFadecAlternatorAlertActive(true, true)).toBe(true);
    expect(isFadecAlternatorAlertActive(true, false)).toBe(false);
    expect(isFadecAlternatorAlertActive(false, true)).toBe(false);
  });

  it('SENSOR FAULT: THR LEVER IDLE and ENG MASTER OFF on the ground, AVOID RAPID THR CHANGES in flight', () => {
    expect(sensorFaultLines(true)).toEqual([0, 1, 2]);
    expect(sensorFaultLines(false)).toEqual([0, 3]);
    expect(SENSOR_FAULT_STATUS).toEqual(['700400063']);
  });
});

describe('PseudoFWC FADEC fault alerts', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
  const messages = readFileSync(resolve(__dirname, '../../../../shared/src/EwdMessages.ts'), 'utf-8');
  const status = readFileSync(resolve(__dirname, '../../../../shared/src/StatusMessages.ts'), 'utf-8');

  it.each([
    ['7707311', 'this.engineHpFuelValveAlertItem(1)'],
    ['7707312', 'this.engineHpFuelValveAlertItem(2)'],
    ['7707321', "this.engineMonitoringAlertItem('7707321', FADEC_ALTERNATOR, this.engineFadecAlternator[0])"],
    ['7707322', "this.engineMonitoringAlertItem('7707322', FADEC_ALTERNATOR, this.engineFadecAlternator[1])"],
    ['7707331', "this.engineMonitoringAlertItem('7707331', OVSPD_PROT_FAULT, this.engineOvspdProtFault[0])"],
    ['7707332', "this.engineMonitoringAlertItem('7707332', OVSPD_PROT_FAULT, this.engineOvspdProtFault[1])"],
    ['7707341', "this.engineMonitoringAlertItem('7707341', PROBES_FAULT, this.engineProbesFault[0])"],
    ['7707342', "this.engineMonitoringAlertItem('7707342', PROBES_FAULT, this.engineProbesFault[1])"],
    ['7707351', 'this.engineSensorFaultAlertItem(1)'],
    ['7707352', 'this.engineSensorFaultAlertItem(2)'],
    ['7707361', "this.engineMonitoringAlertItem('7707361', ONE_TLA_FAULT, this.engineOneTlaFault[0])"],
    ['7707362', "this.engineMonitoringAlertItem('7707362', ONE_TLA_FAULT, this.engineOneTlaFault[1])"],
    ['7707811', "this.engineMonitoringAlertItem('7707811', REV_SWITCH_FAULT, this.engineRevSwitchFault[0])"],
    ['7707812', "this.engineMonitoringAlertItem('7707812', REV_SWITCH_FAULT, this.engineRevSwitchFault[1])"],
  ])('alert %s is %s', (key, item) => {
    expect(fwc).toContain(`    ${key}: ${item},`);
  });

  it.each([
    ['770731101', ' 1 HP FUEL VALVE'],
    ['770731201', ' 2 HP FUEL VALVE'],
    ['770732101', ' 1 FADEC ALTERNATOR'],
    ['770733201', ' 2 OVSPD PROT FAULT'],
    ['770734101', ' 1 PROBES FAULT'],
    ['770735201', ' 2 SENSOR FAULT'],
    ['770736101', ' 1 ONE TLA FAULT'],
    ['770781201', ' 2 REV SWITCH FAULT'],
  ])('title %s is the amber ENG title%s', (code, text) => {
    expect(messages).toContain(`['${code}', { group: 'ENG$5', text: '${text}' }],`);
  });

  it('has the lines of HP FUEL VALVE and SENSOR FAULT', () => {
    expect(messages).toContain("['770731102', { text: '\\x1b<4m HP FUEL VALVE NOT OPEN' }],");
    expect(messages).toContain("['770731103', { text: '\\x1b<5m -MAN START 1........OFF' }],");
    expect(messages).toContain("['770731204', { text: '\\x1b<5m -ENG MASTER 2.......OFF' }],");
    expect(messages).toContain("['770731105', { text: '\\x1b<4m HP FUEL POS SWT FAULT' }],");
    expect(messages).toContain("['770735102', { text: '\\x1b<5m -THR LEVER 1.......IDLE' }],");
    expect(messages).toContain("['770735104', { text: '\\x1b<5m AVOID RAPID THR CHANGES' }],");
    expect(status).toContain("['700400063', { part: StatusPart.Limitation, text: 'AVOID RAPID THR CHANGES' }],");
  });

  it('reads the HP fuel valve fault and the FADEC faults of each engine', () => {
    expect(fwc).toContain('`L:A32NX_ENGINE_${engine}_HP_FUEL_VALVE_FAULT`');
    expect(fwc).toContain("SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engine}_${variable}`, 'bool') > 0");
    expect(FADEC_ALTERNATOR.variable).toBe('FADEC_ALTERNATOR_FAULT');
    expect(OVSPD_PROT_FAULT.variable).toBe('OVERSPEED_PROTECTION_FAULT');
    expect(PROBES_FAULT.variable).toBe('PROBES_FAULT');
    expect(SENSOR_FAULT.variable).toBe('SENSOR_FAULT');
    expect(ONE_TLA_FAULT.variable).toBe('ONE_TLA_FAULT');
    expect(REV_SWITCH_FAULT.variable).toBe('REVERSER_SWITCH_FAULT');
  });
});
