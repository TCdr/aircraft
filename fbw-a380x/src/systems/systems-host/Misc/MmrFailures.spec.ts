// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it } from 'vitest';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { isFlsFailed, isGlsFailed, isIlsFailed, MmrFailures } from './MmrFailures';

const failures =
  (...active: number[]) =>
  (failure: number) =>
    active.includes(failure);

describe('the ILS of an MMR', () => {
  it('is failed with its ILS receiver or the whole MMR failed', () => {
    expect(isIlsFailed(failures(A380Failure.Ils1Receiver), 1)).toBe(true);
    expect(isIlsFailed(failures(A380Failure.Mmr1), 1)).toBe(true);
    expect(isIlsFailed(failures(A380Failure.Ils2Receiver), 2)).toBe(true);
    expect(isIlsFailed(failures(A380Failure.Mmr2), 2)).toBe(true);
  });

  it('is not failed by the failure of the other MMR or the GLS function', () => {
    expect(isIlsFailed(failures(A380Failure.Mmr2, A380Failure.Ils2Receiver), 1)).toBe(false);
    expect(isIlsFailed(failures(A380Failure.Mmr1GlsFunction), 1)).toBe(false);
    expect(isIlsFailed(failures(), 2)).toBe(false);
  });
});

describe('the GLS of an MMR', () => {
  it('is failed with its GLS function or the whole MMR failed', () => {
    expect(isGlsFailed(failures(A380Failure.Mmr1GlsFunction), 1)).toBe(true);
    expect(isGlsFailed(failures(A380Failure.Mmr1), 1)).toBe(true);
    expect(isGlsFailed(failures(A380Failure.Mmr2GlsFunction), 2)).toBe(true);
    expect(isGlsFailed(failures(A380Failure.Mmr2), 2)).toBe(true);
  });

  it('is not failed by the failure of the other MMR, its ILS receiver or its FLS function', () => {
    expect(isGlsFailed(failures(A380Failure.Mmr2, A380Failure.Mmr2GlsFunction), 1)).toBe(false);
    expect(isGlsFailed(failures(A380Failure.Ils1Receiver, A380Failure.Mmr1FlsFunction), 1)).toBe(false);
    expect(isGlsFailed(failures(), 2)).toBe(false);
  });
});

describe('the FLS of an MMR', () => {
  it('is failed with the whole MMR failed', () => {
    expect(isFlsFailed(failures(A380Failure.Mmr1), 1)).toBe(true);
    expect(isFlsFailed(failures(A380Failure.Mmr2), 2)).toBe(true);
  });

  it('is not failed by the failure of the other MMR, its ILS receiver or its GLS function', () => {
    expect(isFlsFailed(failures(A380Failure.Mmr2), 1)).toBe(false);
    expect(isFlsFailed(failures(A380Failure.Mmr1), 2)).toBe(false);
    expect(isFlsFailed(failures(A380Failure.Ils1Receiver, A380Failure.Mmr1GlsFunction), 1)).toBe(false);
    expect(isFlsFailed(failures(), 2)).toBe(false);
  });

  it('keeps its beam with only the FLS function failure, which is an alert alone', () => {
    expect(isFlsFailed(failures(A380Failure.Mmr1FlsFunction), 1)).toBe(false);
    expect(isFlsFailed(failures(A380Failure.Mmr2FlsFunction), 2)).toBe(false);
  });
});

describe('MmrFailures publishing the failures', () => {
  const { GetSimVarValue, SetSimVarValue } = SimVar;

  afterEach(() => {
    SimVar.GetSimVarValue = GetSimVarValue;
    SimVar.SetSimVarValue = SetSimVarValue;
  });

  it('writes the failure of each MMR GLS and of the ground station for the FBW module', () => {
    const written = new Map<string, boolean>();
    SimVar.GetSimVarValue = () => 1;
    SimVar.SetSimVarValue = (name: string, _unit: string, value: any) => {
      written.set(name, value);
      return Promise.resolve();
    };
    const active = new Set<number>([
      A380Failure.Mmr1GlsFunction,
      A380Failure.GbasGroundStation,
      A380Failure.Ils2Receiver,
    ]);
    const system = new MmrFailures({ isActive: (failure: number) => active.has(failure) } as FailuresConsumer);
    system.onUpdate();
    expect(written.get('L:A32NX_GLS_1_FAILED')).toBe(true);
    expect(written.get('L:A32NX_GLS_2_FAILED')).toBe(false);
    expect(written.get('L:A32NX_GBAS_STATION_FAILED')).toBe(true);
    // The FBW module builds the ILS buses of both sides from NAV 3, so it is never switched off
    expect(written.get('L:A32NX_ILS_1_FAILED')).toBe(false);
    expect(written.get('L:A32NX_ILS_2_FAILED')).toBe(true);
    expect(written.has('K:ELECTRICAL_CIRCUIT_TOGGLE')).toBe(false);

    active.clear();
    system.onUpdate();
    expect(written.get('L:A32NX_GLS_1_FAILED')).toBe(false);
    expect(written.get('L:A32NX_GBAS_STATION_FAILED')).toBe(false);
  });

  it('writes the failure of the FLS of each MMR for the FBW module', () => {
    const written = new Map<string, boolean>();
    SimVar.GetSimVarValue = () => 1;
    SimVar.SetSimVarValue = (name: string, _unit: string, value: any) => {
      written.set(name, value);
      return Promise.resolve();
    };
    const active = new Set<number>([A380Failure.Mmr1, A380Failure.Mmr2FlsFunction, A380Failure.Ils2Receiver]);
    const system = new MmrFailures({ isActive: (failure: number) => active.has(failure) } as FailuresConsumer);
    system.onUpdate();
    expect(written.get('L:A32NX_FLS_1_FAILED')).toBe(true);
    expect(written.get('L:A32NX_FLS_2_FAILED')).toBe(false);
    expect(written.get('L:A32NX_ILS_1_FAILED')).toBe(true);
    expect(written.get('L:A32NX_GLS_1_FAILED')).toBe(true);

    active.clear();
    active.add(A380Failure.Mmr2);
    system.onUpdate();
    expect(written.get('L:A32NX_FLS_1_FAILED')).toBe(false);
    expect(written.get('L:A32NX_FLS_2_FAILED')).toBe(true);
  });
});
