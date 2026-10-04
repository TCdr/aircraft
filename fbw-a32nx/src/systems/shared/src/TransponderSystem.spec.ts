// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320Failure, A320FailureDefinitions } from '@failures';
import {
  isTcasStandbyWithoutXpdr,
  isTransponderOperative,
  isXpdrPowered,
  isXpdrStandbyDiscrete,
  isXpdrSwitchLineShown,
  selectedXpdrSystem,
  splitXpdrFaults,
  transponderFailureKey,
  xpdrFaultCondition,
} from './TransponderSystem';
import { formatStatusPage } from './StatusMessages';
import { formatEwdMessages } from './EwdMessages';

const failures =
  (...active: number[]) =>
  (failure: number) =>
    active.includes(failure);

describe('A320 XPDR selection and failures', () => {
  it('maps L:A32NX_TRANSPONDER_SYSTEM 0 to XPDR 1 and 1 to XPDR 2, XPDR 1 for anything else', () => {
    expect(selectedXpdrSystem(0)).toBe(1);
    expect(selectedXpdrSystem(1)).toBe(2);
    expect(selectedXpdrSystem(2)).toBe(1);
  });

  it('uses failure ATC/XPDR 1 (34050) and ATC/XPDR 2 (34051), listed in ATA 34', () => {
    expect(transponderFailureKey(1)).toBe(34050);
    expect(transponderFailureKey(2)).toBe(34051);
    expect(A320FailureDefinitions).toContainEqual([34, A320Failure.Transponder1, 'ATC/XPDR 1']);
    expect(A320FailureDefinitions).toContainEqual([34, A320Failure.Transponder2, 'ATC/XPDR 2']);
  });

  it('keeps the failure ids unique', () => {
    const ids = A320FailureDefinitions.map(([, id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('A320 XPDR power (FCOM ELEC AC ESS BUS SHED / AC BUS 2 FAULT)', () => {
  it('powers XPDR 1 from AC ESS SHED and XPDR 2 from AC 2', () => {
    expect(isXpdrPowered(1, true, false)).toBe(true);
    expect(isXpdrPowered(1, false, true)).toBe(false);
    expect(isXpdrPowered(2, false, true)).toBe(true);
    expect(isXpdrPowered(2, true, false)).toBe(false);
  });

  it('makes a transponder inoperative when failed or unpowered, the other one unaffected', () => {
    expect(isTransponderOperative(1, true, true, failures())).toBe(true);
    expect(isTransponderOperative(1, true, true, failures(A320Failure.Transponder1))).toBe(false);
    expect(isTransponderOperative(2, true, true, failures(A320Failure.Transponder1))).toBe(true);
    expect(isTransponderOperative(2, true, true, failures(A320Failure.Transponder2))).toBe(false);
    expect(isTransponderOperative(1, false, true, failures())).toBe(false);
    expect(isTransponderOperative(2, true, false, failures())).toBe(false);
  });
});

describe('A320 NAV ATC/XPDR STBY discretes', () => {
  // The alert is the AND of both discretes
  const stbyAlertCondition = (selected: 1 | 2, selectorStby: boolean) =>
    isXpdrStandbyDiscrete(1, selected, selectorStby) && isXpdrStandbyDiscrete(2, selected, selectorStby);

  it('triggers when the crew selects STBY, whichever XPDR is selected', () => {
    expect(stbyAlertCondition(1, true)).toBe(true);
    expect(stbyAlertCondition(2, true)).toBe(true);
  });

  it('does not trigger in AUTO/ON: the selected XPDR operates, the other one is in standby', () => {
    expect(stbyAlertCondition(1, false)).toBe(false);
    expect(stbyAlertCondition(2, false)).toBe(false);
    expect(isXpdrStandbyDiscrete(2, 1, false)).toBe(true);
    expect(isXpdrStandbyDiscrete(1, 2, false)).toBe(true);
  });
});

describe('A320 NAV ATC/XPDR FAULT alerts (FCOM PRO-ABN-NAV)', () => {
  it('needs the transponder failed with its bus powered (a bus loss is an ELEC alert)', () => {
    expect(xpdrFaultCondition(1, true, true, true)).toBe(true);
    expect(xpdrFaultCondition(1, true, false, true)).toBe(false);
    expect(xpdrFaultCondition(2, true, true, false)).toBe(false);
    expect(xpdrFaultCondition(2, false, true, true)).toBe(false);
  });

  it('shows the 1, 2 and 1+2 FAULT alerts one at a time', () => {
    expect(splitXpdrFaults(true, false)).toEqual({ xpdr1: true, xpdr2: false, xpdr1And2: false });
    expect(splitXpdrFaults(false, true)).toEqual({ xpdr1: false, xpdr2: true, xpdr1And2: false });
    expect(splitXpdrFaults(true, true)).toEqual({ xpdr1: false, xpdr2: false, xpdr1And2: true });
    expect(splitXpdrFaults(false, false)).toEqual({ xpdr1: false, xpdr2: false, xpdr1And2: false });
  });

  it('asks for ATC/XPDR SYS 2(1) while the failed XPDR is selected and the other one works', () => {
    expect(isXpdrSwitchLineShown(1, 1, true)).toBe(true);
    expect(isXpdrSwitchLineShown(1, 2, true)).toBe(false);
    expect(isXpdrSwitchLineShown(1, 1, false)).toBe(false);
    expect(isXpdrSwitchLineShown(2, 2, true)).toBe(true);
  });

  it('lists the FCOM INOP SYS of NAV ATC/XPDR 1+2 FAULT in the FCOM order', () => {
    const page = formatStatusPage([], ['340300008', '340300007', '340300006', '340300005', '340300004']);
    expect(page.right).toBe(
      [
        '\x1b<7m\x1b4mINOP SYS\x1bm',
        '\x1b<4mTCAS',
        '\x1b<4mATC/XPDR 1',
        '\x1b<4mATC/XPDR 2',
        '\x1b<4mADS-B RPTG 1',
        '\x1b<4mADS-B RPTG 2',
      ].join('\r'),
    );
  });
});

describe('A320 NAV ATC/XPDR FAULT E/WD texts', () => {
  // eslint-disable-next-line no-control-regex
  const visible = (text: string) => text.replace(/\x1b[^m]*m/g, '');

  it('shows the titles in the NAV group and the actions 24 characters wide', () => {
    // each alert on its own: a following alert of the same group shows no group title
    const [xpdr1, xpdr1Action] = formatEwdMessages(['340086001', '340086002']).map(visible);
    const [xpdr2, xpdr2Action] = formatEwdMessages(['340087001', '340087002']).map(visible);
    const [both] = formatEwdMessages(['340089001']).map(visible);
    expect(xpdr1).toBe('NAV ATC/XPDR 1 FAULT');
    expect(xpdr1Action).toBe(' -ATC/XPDR.........SYS 2');
    expect(xpdr2).toBe('NAV ATC/XPDR 2 FAULT');
    expect(xpdr2Action).toBe(' -ATC/XPDR.........SYS 1');
    expect(both).toBe('NAV ATC/XPDR 1+2 FAULT');
    expect(xpdr1Action.length).toBe(24);
  });
});

describe('A320 TCAS without transponder', () => {
  it('goes to standby only when both transponders are lost (FCOM TCAS STBY memo: both ATCs failed)', () => {
    expect(isTcasStandbyWithoutXpdr(true, true)).toBe(true);
    expect(isTcasStandbyWithoutXpdr(true, false)).toBe(false);
    expect(isTcasStandbyWithoutXpdr(false, true)).toBe(false);
    expect(isTcasStandbyWithoutXpdr(false, false)).toBe(false);
  });
});
