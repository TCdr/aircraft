// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { alternateCruiseLevel } from './AlternateCruiseLevel';

describe('alternate cruise flight level', () => {
  // A380 FCOM DSC-22-FMS-20-30 (a380_fcom.txt l.42387): < 200 NM FL 220, 200 NM or more FL 310
  it('A380: FL 220 below 200 NM, also below 100 NM', () => {
    expect(alternateCruiseLevel(50, 'A380')).toBe(220);
    expect(alternateCruiseLevel(199.9, 'A380')).toBe(220);
  });

  it('A380: FL 310 from 200 NM', () => {
    expect(alternateCruiseLevel(200, 'A380')).toBe(310);
  });

  // A320 FCOM (a320_fcom.txt l.14309-14311): FL 100 below 100 NM, FL 220 from 100 to 200 NM, else FL 310
  it('A320: keeps FBW master values', () => {
    expect(alternateCruiseLevel(50, 'A320')).toBe(100);
    expect(alternateCruiseLevel(150, 'A320')).toBe(220);
    expect(alternateCruiseLevel(250, 'A320')).toBe(310);
  });

  it('A320: keeps FBW master values at the 100 NM and 200 NM boundaries', () => {
    expect(alternateCruiseLevel(100, 'A320')).toBe(100);
    expect(alternateCruiseLevel(200, 'A320')).toBe(220);
  });
});
