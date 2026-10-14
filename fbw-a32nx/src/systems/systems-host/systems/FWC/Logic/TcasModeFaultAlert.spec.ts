// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import { A320Failure } from '@failures';
import {
  TCAS_MODE_FAULT_KEY,
  TcasModeFailuresSource,
  TcasModeFaultAlert,
  tcasModeFaultAlert,
} from './TcasModeFaultAlert';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements TcasModeFailuresSource {
  public readonly registered: number[] = [];

  public readonly active = new Set<number>();

  register(identifier: number): void {
    this.registered.push(identifier);
  }

  update(): void {}

  isActive(identifier: number): boolean {
    return this.active.has(identifier);
  }
}

// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\x1b(<\d+m|4m|m)/g, '');

/* A320 FCOM PRO-ABN-AUTO_FLT AUTO FLT TCAS MODE FAULT (a320_fcom.txt l.71942-71968), DSC-22_30-70-85 l.30499-30503 */
describe('AUTO FLT TCAS MODE FAULT (FCOM gap batch T2-42)', () => {
  it('"the TCAS flight guidance mode is inoperative" (l.71952), reported by an FMGC', () => {
    expect(tcasModeFaultAlert(false, true)).toBe(false);
    expect(tcasModeFaultAlert(true, true)).toBe(true);
    expect(tcasModeFaultAlert(true, false)).toBe(false);
  });

  it('follows the flyPad failure 22012', () => {
    const failures = new TestFailures();
    const alert = new TcasModeFaultAlert(failures);
    alert.init();
    expect(failures.registered).toEqual([A320Failure.TcasModeFailure]);
    expect(A320Failure.TcasModeFailure).toBe(22012);
    const active = alert.ewdFailures[TCAS_MODE_FAULT_KEY].simVarIsActive;
    alert.update(true);
    expect(active.get()).toBe(false);
    failures.active.add(A320Failure.TcasModeFailure);
    alert.update(true);
    expect(active.get()).toBe(true);
    alert.update(false);
    expect(active.get()).toBe(false);
  });

  it('level 2, FOR TCAS ALERT: AP+FD OFF, FLY MANUALLY TCAS ORDER, INOP SYS AP/FD TCAS (FCOM PDF p.4431-4432)', () => {
    const item = new TcasModeFaultAlert(new TestFailures()).ewdFailures[TCAS_MODE_FAULT_KEY];
    expect(item.failure).toBe(2);
    expect(item.sysPage).toBe(-1); // SdPages.NONE
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    const codes = item.whichCodeToReturn().map((line) => item.codesToReturn[line!]);
    expect(formatEwdMessages(codes).map((line) => visible(line).trim())).toEqual([
      'AUTO FLT TCAS MODE FAULT',
      '.FOR TCAS ALERT:',
      '-AP+FD..............OFF',
      'FLY MANUALLY TCAS ORDER',
    ]);
    const right = visible(formatStatusPage(item.statusInfo(), item.inopSys()).right).split('\r');
    expect(right).toEqual(['INOP SYS', 'AP/FD TCAS']);
  });

  it('the PseudoFWC registers, updates and shows the alert with the FMGC discrete words', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('this.tcasModeFaultAlert.init();');
    expect(fwc).toContain('this.tcasModeFaultAlert.update(');
    expect(fwc).toContain('...this.tcasModeFaultAlert.ewdFailures,');
  });
});
