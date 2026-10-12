// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { APU_SHUTDOWN_INOP_SYS, apuShutdownAlerts, apuShutdownLines } from './ApuShutdownAlerts';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

const text = (prefix: string, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`),
  ).join(' | ');

/* A320 FCOM PRO-ABN-APU APU AUTO (EMER) SHUT DOWN, a320_fcom.txt l.71082-71114 */
describe('APU AUTO (EMER) SHUT DOWN', () => {
  it('AUTO SHUT DOWN for an automatic shutdown other than a fire (l.71092-71093)', () => {
    expect(apuShutdownAlerts({ autoShutdown: true, emergencyShutdown: false, apuFireWarning: false })).toEqual({
      autoShutdown: true,
      emergencyShutdown: false,
    });
  });

  it('EMER SHUT DOWN with the APU FIRE pb pushed or an APU fire on ground (l.71094-71100)', () => {
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

  it('MASTER SW OFF until done (l.71106)', () => {
    expect(text('4900101', apuShutdownLines(true))).toBe(
      '\x1b<4m\x1b4mAPU\x1bm AUTO SHUT DOWN | \x1b<5m -MASTER SW..........OFF',
    );
    expect(text('4900102', apuShutdownLines(false))).toBe('\x1b<4m\x1b4mAPU\x1bm EMER SHUT DOWN');
  });

  it('STATUS INOP SYS APU (l.71110-71114)', () => {
    expect(formatStatusPage([], APU_SHUTDOWN_INOP_SYS).right).toBe('\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mAPU');
  });

  it('reads the variables that the APU ECB writes and wires both alerts', () => {
    const ecb = readFileSync(
      resolve(__dirname, '../../../../../../../fbw-common/src/wasm/systems/systems/src/apu/electronic_control_box.rs'),
      'utf8',
    );
    expect(ecb).toContain('get_identifier("APU_IS_AUTO_SHUTDOWN".to_owned())');
    expect(ecb).toContain('.get_identifier("APU_IS_EMERGENCY_SHUTDOWN".to_owned())');
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf8');
    expect(fwc).toContain("'L:A32NX_APU_IS_AUTO_SHUTDOWN'");
    expect(fwc).toContain("'L:A32NX_APU_IS_EMERGENCY_SHUTDOWN'");
    for (const [id, subject] of [
      ['4900101', 'apuAutoShutDown'],
      ['4900102', 'apuEmerShutDown'],
    ]) {
      const start = fwc.indexOf(`    ${id}: {`);
      expect(start).toBeGreaterThan(0);
      const block = fwc.slice(start, fwc.indexOf('\n    },', start));
      expect(block).toContain(`simVarIsActive: this.${subject},`);
      expect(block).toContain('inopSys: () => APU_SHUTDOWN_INOP_SYS');
    }
  });
});
