// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { eiuFaultStatus, isEiuFaultAlertActive } from './EngineInterfaceUnitAlerts';

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

  it('is wired in the FWC for both engines', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('    7707731: this.engineEiuFaultAlertItem(1),');
    expect(fwc).toContain('    7707732: this.engineEiuFaultAlertItem(2),');
    expect(fwc).toContain('`L:A32NX_ENGINE_${engine}_EIU_FAULT`');
    expect(fwc).toContain('flightPhaseInhib: EIU_FAULT_FLIGHT_PHASE_INHIBITION,');
  });
});
