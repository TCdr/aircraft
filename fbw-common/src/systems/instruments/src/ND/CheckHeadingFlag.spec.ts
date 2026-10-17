// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EfisNdMode } from '../NavigationDisplay';
import { isNdCheckHeadingShown } from './CheckHeadingFlag';

// CHECK HDG: the side 1 / side 2 heading discrepancy message of the ND
describe('ND CHECK HDG message', () => {
  it('is shown with a heading discrepancy in every mode but PLAN', () => {
    for (const mode of [EfisNdMode.ROSE_ILS, EfisNdMode.ROSE_VOR, EfisNdMode.ROSE_NAV, EfisNdMode.ARC]) {
      expect(isNdCheckHeadingShown(true, mode)).toBe(true);
    }
  });

  it('is not shown in PLAN mode', () => {
    expect(isNdCheckHeadingShown(true, EfisNdMode.PLAN)).toBe(false);
  });

  it('is not shown without a heading discrepancy', () => {
    expect(isNdCheckHeadingShown(false, EfisNdMode.ARC)).toBe(false);
  });
});
