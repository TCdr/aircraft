// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  computeFwcAvailability,
  FWC_1_AND_2_FAULT_EWD,
  FWC_AVAILABILITY_UNPOWERED,
  FWC_FAULT_EWD_CODES,
  FwcInputs,
  fwcFaultStatus,
  isSameFwcAvailability,
} from './FwcAvailability';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

const normal: FwcInputs = { fwc1Failed: false, fwc2Failed: false, fwc1Powered: true, fwc2Powered: true };

// eslint-disable-next-line no-control-regex
const visibleText = (lines: string[]) => lines.map((line) => line.replace(/\x1b[^m]*m/g, '').trim());

describe('A320 FWC 1 / FWC 2 availability (FCOM DSC-31-05-30, PRO-ABN-FWS)', () => {
  it('has both FWCs working and no alert in normal operation', () => {
    expect(computeFwcAvailability(normal)).toEqual({
      fwc1Operative: true,
      fwc2Operative: true,
      anyFwcOperative: true,
      fwc1FaultAlert: false,
      fwc2FaultAlert: false,
      fwc1And2FaultAlert: false,
    });
  });

  it('shows FWS FWC 1 FAULT when FWC 1 fails, FWC 2 doing the work alone', () => {
    const fwcs = computeFwcAvailability({ ...normal, fwc1Failed: true });
    expect(fwcs.fwc1Operative).toBe(false);
    expect(fwcs.anyFwcOperative).toBe(true);
    expect(fwcs.fwc1FaultAlert).toBe(true);
    expect(fwcs.fwc2FaultAlert).toBe(false);
    expect(fwcs.fwc1And2FaultAlert).toBe(false);
  });

  it('shows FWS FWC 2 FAULT when FWC 2 fails', () => {
    const fwcs = computeFwcAvailability({ ...normal, fwc2Failed: true });
    expect(fwcs.fwc2Operative).toBe(false);
    expect(fwcs.anyFwcOperative).toBe(true);
    expect(fwcs.fwc1FaultAlert).toBe(false);
    expect(fwcs.fwc2FaultAlert).toBe(true);
    expect(fwcs.fwc1And2FaultAlert).toBe(false);
  });

  it('loses FWC 1 with the AC ESS bus and FWC 2 with the AC BUS 2, without an FWC fault alert', () => {
    const noAcEss = computeFwcAvailability({ ...normal, fwc1Powered: false });
    expect(noAcEss.fwc1Operative).toBe(false);
    expect(noAcEss.anyFwcOperative).toBe(true);
    expect(noAcEss.fwc1FaultAlert).toBe(false);

    const noAc2 = computeFwcAvailability({ ...normal, fwc2Powered: false });
    expect(noAc2.fwc2Operative).toBe(false);
    expect(noAc2.anyFwcOperative).toBe(true);
    expect(noAc2.fwc2FaultAlert).toBe(false);
  });

  it('shows FWS FWC 1+2 FAULT, and no single FWC fault, when both FWCs fail', () => {
    const fwcs = computeFwcAvailability({ ...normal, fwc1Failed: true, fwc2Failed: true });
    expect(fwcs.anyFwcOperative).toBe(false);
    expect(fwcs.fwc1FaultAlert).toBe(false);
    expect(fwcs.fwc2FaultAlert).toBe(false);
    expect(fwcs.fwc1And2FaultAlert).toBe(true);
  });

  it('shows FWS FWC 1+2 FAULT when one FWC fails and the other one is unpowered', () => {
    expect(computeFwcAvailability({ ...normal, fwc1Failed: true, fwc2Powered: false }).fwc1And2FaultAlert).toBe(true);
    expect(computeFwcAvailability({ ...normal, fwc2Failed: true, fwc1Powered: false }).fwc1And2FaultAlert).toBe(true);
  });

  it('shows nothing when both FWCs are only unpowered (cold and dark)', () => {
    expect(FWC_AVAILABILITY_UNPOWERED.anyFwcOperative).toBe(false);
    expect(FWC_AVAILABILITY_UNPOWERED.fwc1And2FaultAlert).toBe(false);
    expect(FWC_AVAILABILITY_UNPOWERED.fwc1FaultAlert).toBe(false);
    expect(FWC_AVAILABILITY_UNPOWERED.fwc2FaultAlert).toBe(false);
  });

  it('compares two availabilities field by field', () => {
    const a = computeFwcAvailability(normal);
    expect(isSameFwcAvailability(a, computeFwcAvailability(normal))).toBe(true);
    expect(isSameFwcAvailability(a, computeFwcAvailability({ ...normal, fwc1Failed: true }))).toBe(false);
  });
});

describe('FWS FWC 1(2) FAULT STATUS page (FCOM PRO-ABN-FWS)', () => {
  it('lists CAT 3 SINGLE ONLY, and CAT 3 DUAL and the failed FWC in the INOP SYS', () => {
    const fwc1 = fwcFaultStatus(1);
    const page1 = formatStatusPage(fwc1.info, fwc1.inopSys);
    expect(visibleText(page1.left.split('\r'))).toEqual(['CAT 3 SINGLE ONLY']);
    expect(visibleText(page1.right.split('\r'))).toEqual(['INOP SYS', 'CAT 3 DUAL', 'FWC 1']);

    const fwc2 = fwcFaultStatus(2);
    const page2 = formatStatusPage(fwc2.info, fwc2.inopSys);
    expect(visibleText(page2.right.split('\r'))).toEqual(['INOP SYS', 'CAT 3 DUAL', 'FWC 2']);
  });
});

describe('FWC alert codes', () => {
  // The message tables are Maps: a code used twice silently replaces the first message (here, a C/B TRIPPED alert)
  it.each(['fbw-a32nx/src/systems/shared/src/EwdMessages.ts', 'fbw-a32nx/src/systems/shared/src/StatusMessages.ts'])(
    'are each defined once in %s',
    (file) => {
      const source = readFileSync(resolve(file), 'utf-8');
      const fwcCodes = [
        FWC_FAULT_EWD_CODES.fwc1,
        FWC_FAULT_EWD_CODES.fwc2,
        ...FWC_1_AND_2_FAULT_EWD.left,
        ...FWC_1_AND_2_FAULT_EWD.right,
        ...fwcFaultStatus(1).info,
        ...fwcFaultStatus(1).inopSys,
        ...fwcFaultStatus(2).inopSys,
      ];
      for (const code of fwcCodes) {
        expect(source.split(`['${code}'`).length - 1).toBeLessThanOrEqual(1);
      }
    },
  );
});

describe('FWS FWC 1+2 FAULT E/WD (FCOM PRO-ABN-FWS)', () => {
  it('shows FWC 1 FAULT and FWC 2 FAULT under the FWS title', () => {
    expect(visibleText(formatEwdMessages([FWC_FAULT_EWD_CODES.fwc1]))).toEqual(['FWS FWC 1 FAULT']);
    expect(visibleText(formatEwdMessages([FWC_FAULT_EWD_CODES.fwc2]))).toEqual(['FWS FWC 2 FAULT']);
  });

  it('shows the alert and its procedure on the left', () => {
    expect(visibleText(formatEwdMessages([...FWC_1_AND_2_FAULT_EWD.left]))).toEqual([
      'FWS FWC 1+2 FAULT',
      '-MONITOR SYS',
      '-MONITOR OVERHEAD PANEL',
    ]);
  });

  it('shows what is not available on the right', () => {
    expect(visibleText(formatEwdMessages([...FWC_1_AND_2_FAULT_EWD.right]))).toEqual([
      'NOT AVAIL',
      'ECAM WARN',
      'ALTI ALERT',
      'STATUS',
      'A/CALL OUT',
      'MEMO',
    ]);
  });
});
