// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  APU_FAULT_PHASE_INHIBITION,
  apuFaultItemsChecked,
  apuFaultItemsToShow,
  ApuFaultInputs,
  isApuFault,
} from './ApuFaultAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata49 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata46-49-52-56.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');

const none: ApuFaultInputs = { emergencyShutdown: false, autoShutdown: false, apuFireWarning: false };

describe('APU FAULT', () => {
  it('triggers on an emergency or an automatic shutdown, not while the APU FIRE warning is shown', () => {
    expect(isApuFault(none)).toBe(false);
    expect(isApuFault({ ...none, emergencyShutdown: true })).toBe(true);
    expect(isApuFault({ ...none, autoShutdown: true })).toBe(true);
    expect(isApuFault({ ...none, emergencyShutdown: true, apuFireWarning: true })).toBe(false);
  });

  it('shows the EMER SHUTDOWN or the AUTO SHUTDOWN lines', () => {
    expect(apuFaultItemsToShow({ ...none, emergencyShutdown: true, autoShutdown: true })).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(apuFaultItemsToShow({ ...none, autoShutdown: true })).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('APU MASTER SW ... OFF is done with the MASTER SW off', () => {
    expect(apuFaultItemsChecked(false)).toEqual([false, true, false, true, false, false, false, true]);
    expect(apuFaultItemsChecked(true).some((checked) => checked)).toBe(false);
  });

  it('is inhibited in flight phases 3-7, 9 and 10', () => {
    expect(APU_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('has a message with 8 lines, an INOP SYS APU and is wired', () => {
    const start = ata49.indexOf('  490800001: {');
    expect(start).toBeGreaterThan(0);
    const procedure = ata49.slice(start, ata49.indexOf('\n  },', start));
    expect(procedure).toContain("title: '\\x1b<4m\\x1b4mAPU\\x1bm FAULT',");
    expect(procedure.match(/\{ name: '/g)).toHaveLength(apuFaultItemsChecked(true).length);
    expect(messageIndex).toContain("490300001: '\\x1b<4mAPU',");
    const entry = abnormalSensed.slice(abnormalSensed.indexOf('    490800001: {'));
    expect(entry).toContain('simVarIsActive: this.fws.apuFault,');
    expect(entry).toContain('inopSysAllPhases: () => APU_FAULT_INOP_SYS,');
  });
});
