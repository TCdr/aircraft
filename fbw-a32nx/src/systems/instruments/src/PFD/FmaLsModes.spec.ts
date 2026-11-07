// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlsCapability, GlsCapability } from '@flybywiresim/pfd';
import { approachCapabilityLines, ApproachCapabilityInputs, flsCapabilityLines, lsModeText } from './FmaLsModes';

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

const noCapability: ApproachCapabilityInputs = {
  flsCapability: FlsCapability.None,
  glsCapability: GlsCapability.None,
  land2Capacity: false,
  land3FailPassiveCapacity: false,
  land3FailOperationalCapacity: false,
  landModeArmedOrActive: false,
};

describe('FMA column 4', () => {
  it('shows nothing without a capability', () => {
    expect(approachCapabilityLines(noCapability)).toEqual(['', '']);
  });

  it('shows the CAT words of the flight guidance on an ILS', () => {
    expect(approachCapabilityLines({ ...noCapability, landModeArmedOrActive: true })).toEqual(['CAT1', '']);
    expect(approachCapabilityLines({ ...noCapability, land2Capacity: true })).toEqual(['CAT2', '']);
    expect(approachCapabilityLines({ ...noCapability, land3FailPassiveCapacity: true })).toEqual(['CAT3', 'SINGLE']);
    expect(approachCapabilityLines({ ...noCapability, land3FailOperationalCapacity: true })).toEqual(['CAT3', 'DUAL']);
  });

  it('shows the FLS words on an FLS approach', () => {
    expect(approachCapabilityLines({ ...noCapability, flsCapability: FlsCapability.FApp })).toEqual(['F-APP', '']);
  });

  it('shows the one word AUTOLAND on a GLS with the capability of an autoland', () => {
    expect(approachCapabilityLines({ ...noCapability, glsCapability: GlsCapability.AutoLand })).toEqual([
      'AUTOLAND',
      '',
    ]);
  });

  it('shows CAT1 on a GLS without it', () => {
    expect(approachCapabilityLines({ ...noCapability, glsCapability: GlsCapability.Cat1 })).toEqual(['CAT1', '']);
  });

  it('never shows CAT2 or CAT3 on a GLS, whatever the flight guidance reports', () => {
    const allCapacities = {
      ...noCapability,
      land2Capacity: true,
      land3FailPassiveCapacity: true,
      land3FailOperationalCapacity: true,
      landModeArmedOrActive: true,
    };

    expect(approachCapabilityLines({ ...allCapacities, glsCapability: GlsCapability.AutoLand })).toEqual([
      'AUTOLAND',
      '',
    ]);
    expect(approachCapabilityLines({ ...allCapacities, glsCapability: GlsCapability.Cat1 })).toEqual(['CAT1', '']);
  });

  it('shows nothing on a GLS before an approach mode is armed, not even the CAT words', () => {
    expect(
      approachCapabilityLines({ ...noCapability, land2Capacity: true, glsCapability: GlsCapability.NotArmed }),
    ).toEqual(['', '']);
  });
});
