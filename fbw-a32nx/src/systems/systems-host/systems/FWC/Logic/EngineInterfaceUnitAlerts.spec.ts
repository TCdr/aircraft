// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { EIU_FAULT_FLIGHT_PHASE_INHIBITION, eiuFaultStatus, isEiuFaultAlertActive } from './EngineInterfaceUnitAlerts';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

describe('ENG 1(2) EIU FAULT', () => {
  it('is detected by a powered FADEC that no longer receives its EIU data', () => {
    expect(isEiuFaultAlertActive(true, true)).toBe(true);
    expect(isEiuFaultAlertActive(true, false)).toBe(false);
    expect(isEiuFaultAlertActive(false, true)).toBe(false);
  });

  it('has the amber ENG title of its engine', () => {
    expect(formatEwdMessages(['770773101'])[0]).toContain(' 1 EIU FAULT');
    expect(formatEwdMessages(['770773201'])[0]).toContain(' 2 EIU FAULT');
  });

  it('puts APPR IDLE ONLY, CAT 2 ONLY and the lost systems of its engine on the STATUS', () => {
    const status = eiuFaultStatus(2);
    const page = formatStatusPage(status.left, status.inopSys);
    expect(page.left.split('\r')).toEqual(['\x1b<3mENG 2 APPR IDLE ONLY', '\x1b<3mCAT 2 ONLY']);
    expect(page.right.split('\r').slice(1)).toEqual([
      '\x1b<4mA/THR',
      '\x1b<4mCAT 3',
      '\x1b<4mREVERSER 2',
      '\x1b<4mENG 2 START',
    ]);
    expect(formatStatusPage(eiuFaultStatus(1).left, eiuFaultStatus(1).inopSys).right).toContain('ENG 1 START');
  });

  it.each([
    ['7707731', 1],
    ['7707732', 2],
  ])('is wired in the FWC: %s follows the EIU data loss of engine %i with a powered FADEC', (key, engine) => {
    const { fwc } = startCruiseFwc(simvars);
    const item = failureItem(fwc, key);
    expect(item.flightPhaseInhib).toEqual(EIU_FAULT_FLIGHT_PHASE_INHIBITION);
    expect(item.statusInfo?.()).toEqual(eiuFaultStatus(engine as 1 | 2).left);
    expect(item.inopSys?.()).toEqual(eiuFaultStatus(engine as 1 | 2).inopSys);

    simvars.set(`L:A32NX_ENGINE_${engine}_EIU_FAULT`, 1);
    runFwc(fwc, 1);
    // a FADEC that is not powered has no data to lose
    expect(isAlertTriggered(fwc, key)).toBe(false);

    simvars.set(`L:A32NX_FADEC_POWERED_ENG${engine}`, 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(true);
    expect(isAlertTriggered(fwc, engine === 1 ? '7707732' : '7707731')).toBe(false);
  });
});
