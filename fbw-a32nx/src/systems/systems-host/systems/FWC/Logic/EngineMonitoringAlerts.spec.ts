// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, plainText, startCruiseFwc } from '../FwcAlertProbe';
import {
  EngineMonitoringAlertDefinition,
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

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

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

describe('the real FWC: FADEC fault alerts', () => {
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  // [engine 1 key, engine 2 key, the end of the systems variable, the alert definition when it is a crew awareness title]
  const FAULTS: [string, string, string, EngineMonitoringAlertDefinition | undefined][] = [
    ['7707311', '7707312', 'HP_FUEL_VALVE_FAULT', undefined],
    ['7707321', '7707322', FADEC_ALTERNATOR.variable, FADEC_ALTERNATOR],
    ['7707331', '7707332', OVSPD_PROT_FAULT.variable, OVSPD_PROT_FAULT],
    ['7707341', '7707342', PROBES_FAULT.variable, PROBES_FAULT],
    ['7707351', '7707352', SENSOR_FAULT.variable, SENSOR_FAULT],
    ['7707361', '7707362', ONE_TLA_FAULT.variable, ONE_TLA_FAULT],
    ['7707811', '7707812', REV_SWITCH_FAULT.variable, REV_SWITCH_FAULT],
  ];

  it.each(FAULTS)('alerts %s and %s follow the %s variable of their own engine', (key1, key2, variable, definition) => {
    const { fwc } = startCruiseFwc(simvars);
    expect(isAlertTriggered(fwc, key1)).toBe(false);
    expect(isAlertTriggered(fwc, key2)).toBe(false);

    simvars.set(`L:A32NX_ENGINE_2_${variable}`, 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key2)).toBe(true);
    expect(isAlertTriggered(fwc, key1)).toBe(false);

    simvars.set(`L:A32NX_ENGINE_2_${variable}`, 0);
    simvars.set(`L:A32NX_ENGINE_1_${variable}`, 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key1)).toBe(true);
    expect(isAlertTriggered(fwc, key2)).toBe(false);

    // amber ENG cautions with the flight phase inhibition of their definition
    expect(failureItem(fwc, key1).failure).toBe(2);
    expect(failureItem(fwc, key1).sysPage).toBe(EcamSysPage.ENG);
    expect(failureItem(fwc, key1).flightPhaseInhib).toEqual(
      definition ? definition.flightPhaseInhibition : HP_FUEL_VALVE_PHASE_INHIBITION,
    );
  });

  it('the FADEC ALTERNATOR alert needs a running engine', () => {
    const { fwc } = startCruiseFwc(simvars);
    simvars.set('L:A32NX_ENGINE_STATE:1', 0);
    simvars.set('L:A32NX_ENGINE_1_FADEC_ALTERNATOR_FAULT', 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, '7707321')).toBe(false);
  });

  it.each([
    ['7707311', ' 1 HP FUEL VALVE'],
    ['7707312', ' 2 HP FUEL VALVE'],
    ['7707321', ' 1 FADEC ALTERNATOR'],
    ['7707332', ' 2 OVSPD PROT FAULT'],
    ['7707341', ' 1 PROBES FAULT'],
    ['7707352', ' 2 SENSOR FAULT'],
    ['7707361', ' 1 ONE TLA FAULT'],
    ['7707812', ' 2 REV SWITCH FAULT'],
  ])('the title of %s is the amber ENG title%s', (key, text) => {
    const { fwc } = startCruiseFwc(simvars);
    const title = formatEwdMessages([failureItem(fwc, key).codesToReturn[0]])[0];
    expect(plainText(title)).toBe(`ENG${text}`);
  });

  it('has the lines of HP FUEL VALVE and SENSOR FAULT', () => {
    const { fwc } = startCruiseFwc(simvars);
    const text = (key: string, lines: number[]) =>
      formatEwdMessages(lines.map((line) => failureItem(fwc, key).codesToReturn[line])).map(plainText);
    expect(text('7707311', [1, 2])).toEqual(['HP FUEL VALVE NOT OPEN', '-MAN START 1........OFF']);
    expect(text('7707312', [3])).toEqual(['-ENG MASTER 2.......OFF']);
    expect(text('7707311', [4])).toEqual(['HP FUEL POS SWT FAULT']);
    expect(text('7707351', [1, 3])).toEqual(['-THR LEVER 1.......IDLE', 'AVOID RAPID THR CHANGES']);
    expect(plainText(formatStatusPage(SENSOR_FAULT_STATUS, []).left)).toBe('AVOID RAPID THR CHANGES');
  });
});
