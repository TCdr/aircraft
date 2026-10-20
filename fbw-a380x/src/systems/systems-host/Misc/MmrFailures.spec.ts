// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import { isNav3ReceiverOn } from './MmrFailures';

const failures =
  (...active: number[]) =>
  (failure: number) =>
    active.includes(failure);

describe('the sim NAV 3 radio of MMR 1', () => {
  it('is off with MMR 1 or its ILS receiver failed', () => {
    expect(isNav3ReceiverOn(failures(A380Failure.Mmr1))).toBe(false);
    expect(isNav3ReceiverOn(failures(A380Failure.Ils1Receiver))).toBe(false);
  });

  it('stays on with only MMR 2 failed', () => {
    expect(isNav3ReceiverOn(failures(A380Failure.Mmr2, A380Failure.Ils2Receiver))).toBe(true);
    expect(isNav3ReceiverOn(failures())).toBe(true);
  });
});
