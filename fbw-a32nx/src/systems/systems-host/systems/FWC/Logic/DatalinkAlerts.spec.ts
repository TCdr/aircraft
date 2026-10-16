// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { DatalinkStatusCode } from '@datalink/common';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import { A320Failure } from '@failures';
import {
  COMPANY_DATALINK_STBY_MEMO_CODES,
  DATALINK_ATSU_FAULT_KEY,
  DATALINK_COMPANY_FAULT_KEY,
  DATALINK_PHASE_INHIBITION,
  DatalinkAlertInputs,
  DatalinkAlerts,
  DatalinkFailuresSource,
  airGroundLinkAvailable,
  companyDatalinkStbyMemo,
  datalinkAtsuFaultAlert,
  datalinkCompanyFaultAlert,
} from './DatalinkAlerts';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements DatalinkFailuresSource {
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

const working: DatalinkAlertInputs = {
  atsuSupplied: true,
  atsuFailed: false,
  aocFailed: false,
  airGroundLinkAvailable: true,
};

const vhfData = {
  vhf: DatalinkStatusCode.DlkAvail,
  satellite: DatalinkStatusCode.NotInstalled,
  hf: DatalinkStatusCode.NotInstalled,
};
const vhfVoice = {
  vhf: DatalinkStatusCode.DlkNotAvail,
  satellite: DatalinkStatusCode.NotInstalled,
  hf: DatalinkStatusCode.NotInstalled,
};

/* A320 FCOM PRO-ABN-DATALINK (a320_fcom.txt l.74467-74531) and DSC-46-10-40-60 (l.59467-59468) */
describe('DATALINK alerts and COMPANY DATALINK STBY memo (FCOM gap batch T2-37)', () => {
  it('DATALINK ATSU FAULT triggers on the failed ATSU initialization of a supplied ATSU (l.74477-74478)', () => {
    expect(datalinkAtsuFaultAlert(working)).toBe(false);
    expect(datalinkAtsuFaultAlert({ ...working, atsuFailed: true })).toBe(true);
    expect(datalinkAtsuFaultAlert({ ...working, atsuFailed: true, atsuSupplied: false })).toBe(false);
  });

  it('DATALINK COMPANY FAULT triggers on the failed AOC function of a working ATSU (l.74517)', () => {
    expect(datalinkCompanyFaultAlert(working)).toBe(false);
    expect(datalinkCompanyFaultAlert({ ...working, aocFailed: true })).toBe(true);
    // ATSU FAULT already lists DATA COMPANY in its STATUS
    expect(datalinkCompanyFaultAlert({ ...working, aocFailed: true, atsuFailed: true })).toBe(false);
    expect(datalinkCompanyFaultAlert({ ...working, aocFailed: true, atsuSupplied: false })).toBe(false);
  });

  it('COMPANY DATALINK STBY: AOC air-ground communication temporarily unavailable, but not lost (l.59467-59468)', () => {
    expect(airGroundLinkAvailable(vhfData)).toBe(true);
    expect(airGroundLinkAvailable(vhfVoice)).toBe(false);
    expect(airGroundLinkAvailable({ ...vhfVoice, vhf: DatalinkStatusCode.Inop })).toBe(false);

    expect(companyDatalinkStbyMemo(working)).toBe(false);
    expect(companyDatalinkStbyMemo({ ...working, airGroundLinkAvailable: false })).toBe(true);
    // lost, not standby: a failure or no supply
    expect(companyDatalinkStbyMemo({ ...working, airGroundLinkAvailable: false, aocFailed: true })).toBe(false);
    expect(companyDatalinkStbyMemo({ ...working, airGroundLinkAvailable: false, atsuFailed: true })).toBe(false);
    expect(companyDatalinkStbyMemo({ ...working, airGroundLinkAvailable: false, atsuSupplied: false })).toBe(false);
    // no router status yet
    expect(companyDatalinkStbyMemo({ ...working, airGroundLinkAvailable: null })).toBe(false);
  });

  it('follows the ATSU flyPad failures and the router datalink status', () => {
    const failures = new TestFailures();
    const alerts = new DatalinkAlerts(failures);
    alerts.init();
    expect(failures.registered).toEqual([A320Failure.Atsu, A320Failure.AtsuAoc]);
    const atsuFault = alerts.ewdFailures[DATALINK_ATSU_FAULT_KEY].simVarIsActive;
    const companyFault = alerts.ewdFailures[DATALINK_COMPANY_FAULT_KEY].simVarIsActive;

    alerts.onRouterDatalinkStatus(vhfData);
    alerts.update(true);
    expect([atsuFault.get(), companyFault.get(), alerts.companyDatalinkStby.get()]).toEqual([false, false, false]);

    alerts.onRouterDatalinkStatus(vhfVoice);
    alerts.update(true);
    expect([atsuFault.get(), companyFault.get(), alerts.companyDatalinkStby.get()]).toEqual([false, false, true]);

    failures.active.add(A320Failure.AtsuAoc);
    alerts.update(true);
    expect([atsuFault.get(), companyFault.get(), alerts.companyDatalinkStby.get()]).toEqual([false, true, false]);

    failures.active.add(A320Failure.Atsu);
    alerts.update(true);
    expect([atsuFault.get(), companyFault.get(), alerts.companyDatalinkStby.get()]).toEqual([true, false, false]);

    alerts.update(false);
    expect([atsuFault.get(), companyFault.get(), alerts.companyDatalinkStby.get()]).toEqual([false, false, false]);
  });

  it('DATALINK ATSU FAULT: level 1, ATSU INIT FAULT, STATUS INOP SYS ATSU and DATA COMPANY (FCOM PDF page 2135)', () => {
    const item = new DatalinkAlerts(new TestFailures()).ewdFailures[DATALINK_ATSU_FAULT_KEY];
    expect(item.failure).toBe(1);
    expect(item.sysPage).toBe(-1); // SdPages.NONE
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(item.whichCodeToReturn()).toEqual([0, 1]);
    expect(formatEwdMessages(item.codesToReturn).map((line) => visible(line).trim())).toEqual([
      'DATALINK ATSU FAULT',
      'ATSU INIT FAULT',
    ]);
    const right = visible(formatStatusPage(item.statusInfo(), item.inopSys()).right).split('\r');
    expect(right).toEqual(['INOP SYS', 'ATSU', 'DATA COMPANY']);
  });

  it('DATALINK COMPANY FAULT: level 1, STATUS INOP SYS DATA COMPANY (FCOM PDF page 2136)', () => {
    const item = new DatalinkAlerts(new TestFailures()).ewdFailures[DATALINK_COMPANY_FAULT_KEY];
    expect(item.failure).toBe(1);
    expect(item.sysPage).toBe(-1);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(formatEwdMessages(item.codesToReturn).map((line) => visible(line).trim())).toEqual([
      'DATALINK COMPANY FAULT',
    ]);
    const right = visible(formatStatusPage(item.statusInfo(), item.inopSys()).right).split('\r');
    expect(right).toEqual(['INOP SYS', 'DATA COMPANY']);
  });

  it('the memo is green on two lines that fit the memo column, with the inhibition of the other datalink memos', () => {
    const lines = formatEwdMessages(COMPANY_DATALINK_STBY_MEMO_CODES);
    expect(lines.map(visible)).toEqual(['COMPANY', 'DATALINK STBY']);
    for (const line of lines) {
      expect(line.startsWith('\x1b<3m')).toBe(true);
      expect(visible(line).length).toBeLessThanOrEqual(15);
    }
    expect(DATALINK_PHASE_INHIBITION.companyDatalinkStbyMemo).toEqual([3, 4, 5, 7, 8]);
  });

  it('the PseudoFWC listens to the router, updates the alerts with the AC BUS 1 supply and shows them', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('this.datalinkAlerts.init(this.bus);');
    expect(fwc).toContain('this.datalinkAlerts.update(this.ac1BusPoweredVar.get());');
    expect(fwc).toContain('...this.datalinkAlerts.ewdFailures,');
    expect(fwc).toContain('simVarIsActive: this.datalinkAlerts.companyDatalinkStby,');
  });
});
