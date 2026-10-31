// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APU_SHUTDOWN_INOP_SYS, apuShutdownAlerts, apuShutdownLines } from './ApuShutdownAlerts';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

const text = (prefix: string, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`),
  ).join(' | ');

describe('APU AUTO (EMER) SHUT DOWN', () => {
  it('AUTO SHUT DOWN for an automatic shutdown other than a fire', () => {
    expect(apuShutdownAlerts({ autoShutdown: true, emergencyShutdown: false, apuFireWarning: false })).toEqual({
      autoShutdown: true,
      emergencyShutdown: false,
    });
  });

  it('EMER SHUT DOWN with the APU FIRE pb pushed or an APU fire on ground', () => {
    expect(apuShutdownAlerts({ autoShutdown: false, emergencyShutdown: true, apuFireWarning: false })).toEqual({
      autoShutdown: false,
      emergencyShutdown: true,
    });
  });

  it('no EMER SHUT DOWN while the APU FIRE warning is shown (design choice)', () => {
    expect(apuShutdownAlerts({ autoShutdown: false, emergencyShutdown: true, apuFireWarning: true })).toEqual({
      autoShutdown: false,
      emergencyShutdown: false,
    });
  });

  it('MASTER SW OFF until done', () => {
    expect(text('4900101', apuShutdownLines(true))).toBe(
      '\x1b<4m\x1b4mAPU\x1bm AUTO SHUT DOWN | \x1b<5m -MASTER SW..........OFF',
    );
    expect(text('4900102', apuShutdownLines(false))).toBe('\x1b<4m\x1b4mAPU\x1bm EMER SHUT DOWN');
  });

  it('STATUS INOP SYS APU', () => {
    expect(formatStatusPage([], APU_SHUTDOWN_INOP_SYS).right).toBe('\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mAPU');
  });

  // The variable names are the contract with the Rust APU ECB, which vitest cannot run: its source is read
  it('the APU ECB writes the variables that the FWC reads', () => {
    const ecb = readFileSync(
      resolve(__dirname, '../../../../../../../fbw-common/src/wasm/systems/systems/src/apu/electronic_control_box.rs'),
      'utf8',
    );
    expect(ecb).toContain('get_identifier("APU_IS_AUTO_SHUTDOWN".to_owned())');
    expect(ecb).toContain('.get_identifier("APU_IS_EMERGENCY_SHUTDOWN".to_owned())');
  });

  it.each([
    ['4900101', 'L:A32NX_APU_IS_AUTO_SHUTDOWN', 'L:A32NX_APU_IS_EMERGENCY_SHUTDOWN'],
    ['4900102', 'L:A32NX_APU_IS_EMERGENCY_SHUTDOWN', 'L:A32NX_APU_IS_AUTO_SHUTDOWN'],
  ])('the FWC alert %s follows %s only and gives the APU INOP SYS', (key, ownVariable, otherVariable) => {
    const { fwc } = startCruiseFwc(simvars);
    expect(isAlertTriggered(fwc, key)).toBe(false);

    simvars.set(otherVariable, 0);
    simvars.set(ownVariable, 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(true);
    expect(failureItem(fwc, key).inopSys?.()).toEqual(APU_SHUTDOWN_INOP_SYS);

    simvars.set(ownVariable, 0);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(false);
  });
});
