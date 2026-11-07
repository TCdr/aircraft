// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { glsApproachText, glsSelectedNavaidRow, ilsApproachText, isPrecisionApproach } from './LandingSystemRows';

describe('precision approaches', () => {
  it('are the ILS and the GLS', () => {
    expect([ApproachType.Ils, ApproachType.Gls].map(isPrecisionApproach)).toEqual([true, true]);
  });

  it('are not the other approaches or none', () => {
    expect([ApproachType.Rnav, ApproachType.Loc, ApproachType.Vor, undefined].map(isPrecisionApproach)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('ARRIVAL page landing system text', () => {
  it('shows the ident and frequency of an ILS, right aligned in 6 characters', () => {
    expect(ilsApproachText('IFRA', 110.3)).toBe('  IFRA/110.30');
  });

  it('shows the reference path identifier and channel of a GLS', () => {
    expect(glsApproachText('G25P', 31434)).toBe('  G25P/31434');
  });
});

describe('SELECTED NAVAIDS page GLS row', () => {
  const gls = { channel: 31434, rpi: 'G25P', course: 249, slope: -3, definition: null };

  it('shows the class, the mode, the identifier and the channel', () => {
    expect(glsSelectedNavaidRow(gls, 'AUTO')).toEqual({
      label: '\xa0GLS\xa0\xa0\xa0\xa0\xa0\xa0AUTO',
      line: '{cyan}\xa0G25P\xa0\xa0{end}{small}{green}31434{end}{end}',
    });
  });

  it('shows no identifier for a channel no airport has', () => {
    expect(glsSelectedNavaidRow({ ...gls, rpi: null }, 'MAN')?.line).toBe(
      '{cyan}\xa0\xa0\xa0\xa0\xa0\xa0\xa0{end}{small}{green}31434{end}{end}',
    );
  });

  it('shows nothing without a GLS', () => {
    expect(glsSelectedNavaidRow(undefined, 'AUTO')).toBeNull();
  });
});
