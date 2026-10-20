// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { getSupplier } from './AdirsValueProvider';
import {
  EfisSideAttitudeHeading,
  efisSideAdiru,
  headingDifferenceDegrees,
  isCheckAttitudeShown,
  isCheckHeadingShown,
} from './EfisSideDiscrepancy';

const side = (pitch: number | null, roll: number | null, heading: number | null): EfisSideAttitudeHeading => ({
  pitchDegrees: pitch,
  rollDegrees: roll,
  headingDegrees: heading,
});

describe('A32NX EFIS side 1 / side 2 discrepancy messages', () => {
  it('shows no message when both sides agree', () => {
    expect(isCheckAttitudeShown(side(2.5, -10, 90), side(2.5, -10, 90))).toBe(false);
    expect(isCheckHeadingShown(side(2.5, -10, 90), side(2.5, -10, 90))).toBe(false);
  });

  it('shows CHECK ATT for a pitch discrepancy of at least 5 degrees', () => {
    expect(isCheckAttitudeShown(side(2, 0, 90), side(6.9, 0, 90))).toBe(false);
    expect(isCheckAttitudeShown(side(2, 0, 90), side(7, 0, 90))).toBe(true);
  });

  it('shows CHECK ATT for a roll discrepancy of at least 5 degrees', () => {
    expect(isCheckAttitudeShown(side(0, -3, 90), side(0, 2, 90))).toBe(true);
  });

  it('does not compare an attitude that is not valid on one side (its ATT flag is shown)', () => {
    expect(isCheckAttitudeShown(side(null, null, 90), side(20, 30, 90))).toBe(false);
  });

  it('shows CHECK HDG for a heading discrepancy of at least 5 degrees', () => {
    expect(isCheckHeadingShown(side(0, 0, 100), side(0, 0, 104))).toBe(false);
    expect(isCheckHeadingShown(side(0, 0, 100), side(0, 0, 105))).toBe(true);
  });

  it('compares the headings across north', () => {
    expect(headingDifferenceDegrees(358, 2)).toBe(4);
    expect(isCheckHeadingShown(side(0, 0, 358), side(0, 0, 2))).toBe(false);
    expect(isCheckHeadingShown(side(0, 0, 357), side(0, 0, 3))).toBe(true);
  });

  it('does not compare a heading that is not valid on one side (its HDG flag is shown)', () => {
    expect(isCheckHeadingShown(side(0, 0, null), side(0, 0, 200))).toBe(false);
  });

  it('keeps attitude and heading apart', () => {
    expect(isCheckAttitudeShown(side(0, 0, 0), side(0, 0, 90))).toBe(false);
    expect(isCheckHeadingShown(side(0, 0, 90), side(20, 0, 90))).toBe(false);
  });

  it('takes the ADIRU of each side from the switching selector, as the displays do', () => {
    // 0 CAPT 3, 1 NORM, 2 F/O 3
    expect([0, 1, 2].map((selector) => efisSideAdiru('L', selector))).toEqual([3, 1, 1]);
    expect([0, 1, 2].map((selector) => efisSideAdiru('R', selector))).toEqual([2, 2, 3]);
    for (const selector of [0, 1, 2]) {
      expect(efisSideAdiru('L', selector)).toBe(getSupplier('L', selector));
      expect(efisSideAdiru('R', selector)).toBe(getSupplier('R', selector));
    }
  });
});
