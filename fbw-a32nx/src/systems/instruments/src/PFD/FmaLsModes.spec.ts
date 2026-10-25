// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlsCapability } from '@flybywiresim/pfd';
import { flsCapabilityLines, lsModeText } from './FmaLsModes';

/* The FMA texts of an FLS approach */

describe('FMA LOC and G/S modes on an FLS approach', () => {
  it('keeps the ILS texts without an FLS axis', () => {
    expect(['LOC *', 'LOC', 'G/S*', 'G/S'].map((t) => lsModeText(t, false))).toEqual(['LOC *', 'LOC', 'G/S*', 'G/S']);
  });

  it('shows F-LOC * / F-LOC / F-G/S* / F-G/S when the axis flies the FLS beam', () => {
    expect(['LOC *', 'LOC', 'G/S*', 'G/S'].map((t) => lsModeText(t, true))).toEqual([
      'F-LOC *',
      'F-LOC',
      'F-G/S*',
      'F-G/S',
    ]);
  });

  it('LOC approach: LOC stays, the vertical mode is F-G/S', () => {
    const flsLateralActive = false;
    const flsVerticalActive = true;
    expect(lsModeText('LOC', flsLateralActive)).toBe('LOC');
    expect(lsModeText('G/S', flsVerticalActive)).toBe('F-G/S');
  });
});

describe('FMA column 4 on an FLS approach', () => {
  it('shows F-APP, F-APP + RAW or RAW ONLY', () => {
    expect(flsCapabilityLines(FlsCapability.FApp)).toEqual(['F-APP', '']);
    expect(flsCapabilityLines(FlsCapability.FAppRaw)).toEqual(['F-APP', '+ RAW']);
    expect(flsCapabilityLines(FlsCapability.RawOnly)).toEqual(['RAW', 'ONLY']);
    expect(flsCapabilityLines(FlsCapability.None)).toEqual(['', '']);
  });
});
