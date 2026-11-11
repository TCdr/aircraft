// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { compareApproachListEntries } from './ApproachListOrder';

const approach = (runwayIdent: string, type: ApproachType, multipleIndicator = '') => ({
  runwayIdent,
  type,
  multipleIndicator,
});

const GLS_25C_Y = approach('EDDF25C', ApproachType.Gls, 'Y');
const GLS_25C_Z = approach('EDDF25C', ApproachType.Gls, 'Z');
const ILS_25C = approach('EDDF25C', ApproachType.Ils, 'Z');
const RNAV_07C = approach('EDDF07C', ApproachType.Rnav);

describe('the order of the APPR list of the ARRIVAL page', () => {
  it('groups the approaches by runway, and puts the ILS before the GLS and the RNAV within a runway', () => {
    const sorted = [approach('EDDF25C', ApproachType.Rnav), GLS_25C_Y, RNAV_07C, ILS_25C].sort(
      compareApproachListEntries,
    );

    expect(sorted.map((entry) => `${entry.runwayIdent} ${ApproachType[entry.type]}`)).toEqual([
      'EDDF07C Rnav',
      'EDDF25C Ils',
      'EDDF25C Gls',
      'EDDF25C Rnav',
    ]);
  });

  it('lists two approaches of one type to one runway by their suffix, whatever order they come in', () => {
    expect([GLS_25C_Z, GLS_25C_Y].sort(compareApproachListEntries)).toEqual([GLS_25C_Y, GLS_25C_Z]);
    expect([GLS_25C_Y, GLS_25C_Z].sort(compareApproachListEntries)).toEqual([GLS_25C_Y, GLS_25C_Z]);
  });

  it('keeps an approach without a suffix before the ones with a suffix', () => {
    const plain = approach('EDDF25C', ApproachType.Gls);

    expect([GLS_25C_Y, plain].sort(compareApproachListEntries)).toEqual([plain, GLS_25C_Y]);
  });
});
