// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import {
  isTcasInoperative,
  isTransponderOperative,
  isXpdrTcasPowered,
  selectedSurvSystem,
  transponderFailureKey,
} from './TransponderSystem';

const failures =
  (...active: number[]) =>
  (failure: number) =>
    active.includes(failure);

describe('A380 XPDR system selection', () => {
  it('maps L:A32NX_TRANSPONDER_SYSTEM 0 to SYS 1 and 1 to SYS 2', () => {
    expect(selectedSurvSystem(0)).toBe(1);
    expect(selectedSurvSystem(1)).toBe(2);
  });

  it('falls back to SYS 1 for an unexpected value', () => {
    expect(selectedSurvSystem(2)).toBe(1);
    expect(selectedSurvSystem(-1)).toBe(1);
  });

  it('uses failure XPDR 1 (34003) for SYS 1 and XPDR 2 (34004) for SYS 2', () => {
    expect(transponderFailureKey(1)).toBe(A380Failure.Transponder1);
    expect(transponderFailureKey(2)).toBe(A380Failure.Transponder2);
    expect(A380Failure.Transponder1).toBe(34003);
    expect(A380Failure.Transponder2).toBe(34004);
  });
});

describe('A380 XPDR/TCAS power (FCOM DSC-34-20-100: SYS 1 = AC ESS, SYS 2 = AC 4)', () => {
  it('powers SYS 1 from AC ESS only', () => {
    expect(isXpdrTcasPowered(1, true, false)).toBe(true);
    expect(isXpdrTcasPowered(1, false, true)).toBe(false);
  });

  it('powers SYS 2 from AC 4 only (no longer from AC ESS or AC 2)', () => {
    expect(isXpdrTcasPowered(2, false, true)).toBe(true);
    expect(isXpdrTcasPowered(2, true, false)).toBe(false);
  });
});

describe('A380 XPDR operative state', () => {
  it('fails XPDR 1 only with failure 34003', () => {
    expect(isTransponderOperative(1, true, true, failures(A380Failure.Transponder1))).toBe(false);
    expect(isTransponderOperative(1, true, true, failures(A380Failure.Transponder2))).toBe(true);
  });

  it('fails XPDR 2 only with failure 34004', () => {
    expect(isTransponderOperative(2, true, true, failures(A380Failure.Transponder2))).toBe(false);
    expect(isTransponderOperative(2, true, true, failures(A380Failure.Transponder1))).toBe(true);
  });

  it('keeps XPDR 2 working when XPDR 1 is failed and AC ESS is lost', () => {
    expect(isTransponderOperative(2, false, true, failures(A380Failure.Transponder1))).toBe(true);
    expect(isTransponderOperative(1, false, true, failures())).toBe(false);
  });
});

describe('A380 TCAS inoperative state (FCOM SURV XPDR 1(2) FAULT STATUS: XPDR 1(2), TCAS 1(2))', () => {
  it('makes TCAS n inoperative when XPDR n is failed, selected or not', () => {
    expect(isTcasInoperative(1, 1, true, false)).toBe(true);
    expect(isTcasInoperative(1, 2, true, false)).toBe(true);
    expect(isTcasInoperative(2, 1, true, false)).toBe(true);
  });

  it('gives the sim TCAS computer fault to the selected system only', () => {
    expect(isTcasInoperative(1, 1, false, true)).toBe(true);
    expect(isTcasInoperative(2, 1, false, true)).toBe(false);
    expect(isTcasInoperative(2, 2, false, true)).toBe(true);
    expect(isTcasInoperative(1, 2, false, true)).toBe(false);
  });

  it('keeps both TCAS operative without faults', () => {
    expect(isTcasInoperative(1, 1, false, false)).toBe(false);
    expect(isTcasInoperative(2, 1, false, false)).toBe(false);
  });
});
