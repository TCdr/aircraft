// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { alternateCruiseLevel, uplinkedAlternateWindLevelDiffers } from './AlternateCruiseLevel';

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

describe('CHECK ALTN WIND (uplinked alternate wind level vs the default alternate cruise level)', () => {
  // A380 FCOM l.21975-21990 / A320 FCOM l.22527-22528: the uplinked alternate cruise FL differs from the default one.
  // The uplinked wind altitude is in feet, the default alternate cruise level is a flight level.
  it('is not raised when the uplinked FL 310 wind matches the default FL 310', () => {
    expect(uplinkedAlternateWindLevelDiffers(31_000, 310)).toBe(false);
  });

  it('is raised when the uplinked level differs', () => {
    expect(uplinkedAlternateWindLevelDiffers(22_000, 310)).toBe(true);
  });

  it('is not raised without an uplinked alternate wind or without a default level', () => {
    expect(uplinkedAlternateWindLevelDiffers(undefined, 310)).toBe(false);
    expect(uplinkedAlternateWindLevelDiffers(31_000, undefined)).toBe(false);
  });
});
