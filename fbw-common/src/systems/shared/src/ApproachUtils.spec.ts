// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Approach, ApproachType } from '@flybywiresim/fbw-sdk';
import { ApproachUtils } from './ApproachUtils';

describe('ApproachUtils GLS', () => {
  it('names the type', () => {
    expect(ApproachUtils.approachTypeString(ApproachType.Gls)).toBe('GLS');
  });

  it('parses a GLS approach name', () => {
    expect(ApproachUtils.parseApproachName('GLS25C')).toEqual({ type: 'GLS', runway: '25C', designator: '' });
    expect(ApproachUtils.parseApproachName('GLS 07L-Y')).toEqual({ type: 'GLS', runway: '07L', designator: 'Y' });
  });

  it('formats the short and long name of a GLS approach with its suffix', () => {
    const gls = { type: ApproachType.Gls, runwayIdent: 'EDDF25C', multipleIndicator: 'Z' } as unknown as Approach;

    expect(ApproachUtils.shortApproachName(gls)).toBe('GLS25C-Z');
    expect(ApproachUtils.longApproachName(gls)).toBe('GLS25C-Z');
  });
});
