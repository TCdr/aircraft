// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  APU_FAULT_PHASE_INHIBITION,
  APU_MACH_LIMIT_PHASE_INHIBITION,
  APU_OIL_FILTER_CLOGGED_PHASE_INHIBITION,
  apuFaultItemsChecked,
  apuFaultItemsToShow,
  ApuFaultInputs,
  apuMachLimitItemsChecked,
  isApuFault,
  isApuMachLimitExceeded,
  isApuOilFilterClogged,
} from './ApuFaultAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata49 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata46-49-52-56.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
const failures = readFileSync(resolve(__dirname, '../../../failures/src/a380.ts'), 'utf-8');

const none: ApuFaultInputs = { emergencyShutdown: false, autoShutdown: false, apuFireWarning: false };

describe('APU FAULT (A380 FCOM PRO-ABN-ECAM-10-49, l.170067-170193)', () => {
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

  it('is inhibited in flight phases 3-7, 9 and 10 (PDF p.5729)', () => {
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

/** The source of one ata46-49-52-56.ts procedure */
function ata49Procedure(id: string): string {
  const start = ata49.indexOf(`  ${id}: {`);
  expect(start, id).toBeGreaterThan(0);
  return ata49.slice(start, ata49.indexOf('\n  },', start));
}

describe('APU MACH LIMIT EXCEEDED (A380 FCOM PRO-ABN-ECAM-10-49, l.170204-170230)', () => {
  it('triggers with the APU running above M 0.5 (l.170210)', () => {
    expect(isApuMachLimitExceeded(true, 0.5)).toBe(false);
    expect(isApuMachLimitExceeded(true, 0.51)).toBe(true);
    expect(isApuMachLimitExceeded(false, 0.85)).toBe(false);
  });

  it('APU MASTER SW ... OFF is done with the MASTER SW off', () => {
    expect(apuMachLimitItemsChecked(true)).toEqual([false, false]);
    expect(apuMachLimitItemsChecked(false)).toEqual([false, true]);
  });

  it('is inhibited in every flight phase but 8 (PDF p.5731)', () => {
    expect(APU_MACH_LIMIT_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  });

  it('has its message and is wired with SC, master caution, APU page and INOP SYS APU', () => {
    const procedure = ata49Procedure('490800002');
    expect(procedure).toContain("title: '\\x1b<4m\\x1b4mAPU\\x1bm MACH LIMIT EXCEEDED',");
    expect(procedure.match(/\{ name: '/g)).toHaveLength(apuMachLimitItemsChecked(true).length);
    const entry = abnormalSensed.slice(abnormalSensed.indexOf('    490800002: {'));
    expect(abnormalSensed.indexOf('    490800002: {')).toBeGreaterThan(0);
    expect(entry).toMatch(
      /simVarIsActive: this\.fws\.apuMachLimitExceeded,[\s\S]*?inopSysAllPhases: \(\) => APU_FAULT_INOP_SYS,\s*failure: 2,\s*sysPage: SdPages\.Apu,/,
    );
    expect(fwsCore).toContain(
      'this.apuMachLimitExceeded.set(isApuMachLimitExceeded(this.apuAvail.get(), this.machSelectedFromAdr.get()));',
    );
  });
});

describe('APU OIL FILTER CLOGGED (A380 FCOM PRO-ABN-ECAM-10-49, l.170240-170258)', () => {
  it('shows the clogging failure while the APU runs', () => {
    expect(isApuOilFilterClogged(true, true)).toBe(true);
    expect(isApuOilFilterClogged(true, false)).toBe(false);
    expect(isApuOilFilterClogged(false, true)).toBe(false);
  });

  it('is inhibited in flight phases 2 to 11 (PDF p.5732)', () => {
    expect(APU_OIL_FILTER_CLOGGED_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('has its message, is a no-audio crew awareness alert fed by the flyPad failure 49004', () => {
    expect(ata49Procedure('490800003')).toContain("title: '\\x1b<4m\\x1b4mAPU\\x1bm OIL FILTER CLOGGED',");
    const entry = abnormalSensed.slice(abnormalSensed.indexOf('    490800003: {'));
    expect(abnormalSensed.indexOf('    490800003: {')).toBeGreaterThan(0);
    expect(entry).toMatch(/simVarIsActive: this\.fws\.apuOilFilterClogged,[\s\S]*?failure: 1,/);
    expect(fwsCore).toContain('A380Failure.ApuOilFilterClogging');
    expect(failures).toContain('  ApuOilFilterClogging: 49004,');
    expect(failures).toContain("  [49, A380Failure.ApuOilFilterClogging, '");
  });
});
