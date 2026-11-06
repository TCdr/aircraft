// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isStructurallyEqual } from './structuralEquality';

describe('isStructurallyEqual', () => {
  it('compares primitives by value', () => {
    expect(isStructurallyEqual(3, 3)).toBe(true);
    expect(isStructurallyEqual(3, 4)).toBe(false);
    expect(isStructurallyEqual(NaN, NaN)).toBe(true);
    expect(isStructurallyEqual('a', 'a')).toBe(true);
    expect(isStructurallyEqual(0, '0')).toBe(false);
    expect(isStructurallyEqual(null, undefined)).toBe(false);
  });

  it('compares objects field by field, including nested arrays', () => {
    const reading = () => ({ power: { online: 1, apu: false }, doors: [{ name: '1L', openFraction: 0 }] });

    expect(isStructurallyEqual(reading(), reading())).toBe(true);

    const changedNested = reading();
    changedNested.doors[0].openFraction = 0.5;
    expect(isStructurallyEqual(reading(), changedNested)).toBe(false);
  });

  it('tells different lengths and key sets apart', () => {
    expect(isStructurallyEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(isStructurallyEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isStructurallyEqual({ a: undefined }, { b: undefined })).toBe(false);
  });

  it('does not take an array for an object', () => {
    expect(isStructurallyEqual([], {})).toBe(false);
  });
});
