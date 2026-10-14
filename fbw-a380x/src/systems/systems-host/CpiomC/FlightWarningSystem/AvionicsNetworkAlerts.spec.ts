// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AFDX_SWITCHES_NETWORK_A,
  AFDX_SWITCHES_NETWORK_B,
  afdxSwitchFlyPadFailure,
  ALL_SWITCHES_FAULT_LIMITATIONS_ALL_PHASES,
  ALL_SWITCHES_FAULT_LIMITATIONS_APPR_LDG,
  ALL_SWITCHES_FAULT_PHASE_INHIBITION,
  AVIONICS_NETWORK_ALERT_IDS,
  avionicsNetworkAlerts,
  AvionicsNetworkAlerts,
  DOUBLE_FAULT_PHASE_INHIBITION,
  iomFlyPadFailure,
  isAfdxSwitchFailed,
  isIomFailed,
  MULTIPLE_FAULT_PHASE_INHIBITION,
} from './AvionicsNetworkAlerts';

/* The wiring is read from the source text, as CommunicationAlerts.spec.ts does (EcamMessages import cycle). */
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata42 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata35-36-42.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
const failures = readFileSync(resolve(__dirname, '../../../failures/src/a380.ts'), 'utf-8');

const NO_ALERT: AvionicsNetworkAlerts = {
  allSwitchesFault: false,
  doubleSwitchFault: false,
  multipleSwitchFaultNetworkDegraded: false,
  multipleSwitchFaultRedundancyDegraded: false,
  doubleIomFault: false,
  multipleIomFaultNetworkDegraded: false,
  multipleIomFaultRedundancyDegraded: false,
};

/** The alerts with these switches and IOMs failed */
function alerts(failedSwitches: number[], failedIoms: string[] = []): AvionicsNetworkAlerts {
  return avionicsNetworkAlerts({
    switchFailed: (id) => failedSwitches.includes(id),
    iomFailed: (name) => failedIoms.includes(name),
  });
}

/** The alerts all off except these */
function only(active: Partial<AvionicsNetworkAlerts>): AvionicsNetworkAlerts {
  return { ...NO_ALERT, ...active };
}

describe('AVIONICS NETWORK switch alerts (FCOM DSC-42-20, PRO-ABN-ECAM-10-42)', () => {
  it('no failure, or a single switch failure (maintenance message only, l.94972): no alert', () => {
    expect(alerts([])).toEqual(NO_ALERT);
    expect(alerts([3])).toEqual(NO_ALERT);
    expect(alerts([19])).toEqual(NO_ALERT);
  });

  it('two switches on the same network: DOUBLE SWITCH FAULT (l.169461)', () => {
    expect(alerts([1, 2])).toEqual(only({ doubleSwitchFault: true }));
    expect(alerts([13, 19])).toEqual(only({ doubleSwitchFault: true }));
  });

  it('three or more switches on the same network: MULTIPLE SWITCH FAULT (REDUNDANCY DEGRADED) (l.169791)', () => {
    expect(alerts([1, 2, 9])).toEqual(only({ multipleSwitchFaultRedundancyDegraded: true }));
    expect(alerts([...AFDX_SWITCHES_NETWORK_B])).toEqual(only({ multipleSwitchFaultRedundancyDegraded: true }));
  });

  it('switches failed on both networks: MULTIPLE SWITCH FAULT (NETWORK DEGRADED) (l.169708)', () => {
    expect(alerts([1, 11])).toEqual(only({ multipleSwitchFaultNetworkDegraded: true }));
    expect(alerts([4, 5, 6, 17])).toEqual(only({ multipleSwitchFaultNetworkDegraded: true }));
  });

  it('all 16 switches failed: ALL SWITCHES FAULT only (l.169111)', () => {
    expect(alerts([...AFDX_SWITCHES_NETWORK_A, ...AFDX_SWITCHES_NETWORK_B])).toEqual(only({ allSwitchesFault: true }));
    // one switch left: the networks are degraded, not all lost
    expect(alerts([...AFDX_SWITCHES_NETWORK_A, 11, 12, 13, 14, 15, 16, 17])).toEqual(
      only({ multipleSwitchFaultNetworkDegraded: true }),
    );
  });
});

describe('AVIONICS NETWORK IOM alerts (FCOM DSC-42-20, PRO-ABN-ECAM-10-42)', () => {
  it('a single IOM failure (maintenance message only, l.95026): no alert', () => {
    expect(alerts([], ['A1'])).toEqual(NO_ALERT);
  });

  it('two IOMs of different pairs: DOUBLE IOM FAULT (l.169429)', () => {
    expect(alerts([], ['A1', 'A3'])).toEqual(only({ doubleIomFault: true }));
  });

  it('three or more IOMs, one per pair: MULTIPLE IOM FAULT (REDUNDANCY DEGRADED) (l.169670)', () => {
    expect(alerts([], ['A1', 'A4', 'A6'])).toEqual(only({ multipleIomFaultRedundancyDegraded: true }));
    expect(alerts([], ['A2', 'A3', 'A6', 'A7'])).toEqual(only({ multipleIomFaultRedundancyDegraded: true }));
  });

  it('a pair of IOMs failed: MULTIPLE IOM FAULT (NETWORK DEGRADED) only (l.169521)', () => {
    expect(alerts([], ['A1', 'A2'])).toEqual(only({ multipleIomFaultNetworkDegraded: true }));
    expect(alerts([], ['A7', 'A8', 'A1', 'A3'])).toEqual(only({ multipleIomFaultNetworkDegraded: true }));
  });

  it('switch and IOM alerts are independent', () => {
    expect(alerts([2, 12], ['A5', 'A6'])).toEqual(
      only({ multipleSwitchFaultNetworkDegraded: true, multipleIomFaultNetworkDegraded: true }),
    );
  });
});

describe('AVIONICS NETWORK failure inputs', () => {
  it('a switch or an IOM is failed by its flyPad failure or its _FAILURE L:var, not by a power loss', () => {
    const lvars = new Set(['L:A32NX_AFDX_SWITCH_5_FAILURE', 'L:A32NX_IOM_A4_FAILURE']);
    const read = (name: string) => lvars.has(name);
    expect(isAfdxSwitchFailed(5, false, read)).toBe(true);
    expect(isAfdxSwitchFailed(6, true, read)).toBe(true);
    expect(isAfdxSwitchFailed(6, false, read)).toBe(false);
    expect(isIomFailed('A4', false, read)).toBe(true);
    expect(isIomFailed('A3', true, read)).toBe(true);
    expect(isIomFailed('A3', false, read)).toBe(false);
  });

  it('maps the switches and IOMs on the flyPad failure ids of a380.ts', () => {
    for (const id of [...AFDX_SWITCHES_NETWORK_A, ...AFDX_SWITCHES_NETWORK_B]) {
      expect(failures).toContain(`  AfdxSwitch${id}: ${afdxSwitchFlyPadFailure(id)},`);
    }
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(failures).toContain(`  IomA${n}: ${iomFlyPadFailure(`A${n}`)},`);
    }
  });
});

describe('AVIONICS NETWORK alert wiring and FCOM flight phase inhibitions', () => {
  it('uses the inhibitions of the FCOM figures (PDF p.5701, 5708, 5709, 5711, 5715, 5716, 5718)', () => {
    expect(ALL_SWITCHES_FAULT_PHASE_INHIBITION).toEqual([4, 5, 6, 7, 9, 10]);
    expect(DOUBLE_FAULT_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(MULTIPLE_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('defines every alert in ata35-36-42.ts and wires it in FwsAbnormalSensed', () => {
    for (const id of Object.values(AVIONICS_NETWORK_ALERT_IDS)) {
      expect(ata42.indexOf(`  ${id}: {`), id).toBeGreaterThan(0);
    }
    expect(ata42).toContain("title: '\\x1b<4m\\x1b4mAVIONICS NETWORK\\x1bm ALL SWITCHES FAULT',");
    expect(abnormalSensed).toContain('...this.avionicsNetworkAlerts(),');
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.avncsNetworkAllSwitchesFault,');
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.avncsNetworkMultipleIomFaultRedundancyDegraded,');
    expect(fwsCore).toContain('avionicsNetworkAlerts({');
  });

  it('lists the limitations of ALL SWITCHES FAULT (l.169311-169320) in index.ts', () => {
    for (const id of [...ALL_SWITCHES_FAULT_LIMITATIONS_ALL_PHASES, ...ALL_SWITCHES_FAULT_LIMITATIONS_APPR_LDG]) {
      expect(messageIndex.indexOf(`  ${id}: '\\x1b<`), id).toBeGreaterThan(0);
    }
    expect(messageIndex).toContain("420400005: '\\x1b<5mA-SKID NOT USABLE ON ALL L/Gs',");
    expect(messageIndex).toContain("460400001: '\\x1b<5mATC COM VOICE ONLY',");
  });
});
