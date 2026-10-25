// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { FlsCapability } from '@flybywiresim/pfd';
import {
  armedGlideSlopeText,
  B1Messages,
  C1Messages,
  computeB1Message,
  computeC1Message,
  computeD1D2Message,
  D1D2Messages,
} from './FMADefinitions';

function word(bits: number[] = []): Arinc429Register {
  const w = Arinc429Register.empty();
  w.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  bits.forEach((bit) => w.setBitValue(bit, true));
  return w;
}

describe('A380X FMA modes on an FLS approach', () => {
  const GS_CAPTURE = 21;
  const GS_TRACK = 22;
  const LOC_CAPTURE = 13;
  const LOC_TRACK = 14;
  const BACK_BEAM = 29;

  it('keeps LOC* / LOC / G/S* / G/S on an ILS approach', () => {
    expect(computeB1Message(word([GS_CAPTURE]), false)).toBe(B1Messages.GS_STAR);
    expect(computeB1Message(word([GS_TRACK]), false)).toBe(B1Messages.GS);
    expect(computeC1Message(word([LOC_CAPTURE]), false)).toBe(C1Messages.LOC_STAR);
    expect(computeC1Message(word([LOC_TRACK]), false)).toBe(C1Messages.LOC);
    expect(armedGlideSlopeText(false)).toBe('G/S');
  });

  it('shows F-LOC* / F-LOC / F-G/S* / F-G/S when both axes fly the FLS beam', () => {
    expect(computeB1Message(word([GS_CAPTURE]), true)).toBe(B1Messages.F_GS_STAR);
    expect(computeB1Message(word([GS_TRACK]), true)).toBe(B1Messages.F_GS);
    expect(computeC1Message(word([LOC_CAPTURE]), true)).toBe(C1Messages.F_LOC_STAR);
    expect(computeC1Message(word([LOC_TRACK]), true)).toBe(C1Messages.F_LOC);
    expect(armedGlideSlopeText(true)).toBe('F-G/S');
  });

  it('LOC approach: LOC with F-G/S', () => {
    expect(computeC1Message(word([LOC_TRACK]), false)).toBe(C1Messages.LOC);
    expect(computeB1Message(word([GS_TRACK]), true)).toBe(B1Messages.F_GS);
  });

  it('keeps LOC B/C on a back course', () => {
    expect(computeC1Message(word([LOC_TRACK, BACK_BEAM]), true)).toBe(C1Messages.LOC_BC);
  });

  it('shows the FLS capability instead of CAT1/2/3', () => {
    const LAND_ARMED = 28;
    const LAND2_CAPACITY = 24;
    const d1d2 = (capability: FlsCapability) =>
      computeD1D2Message(word(), word([LAND_ARMED]), word([LAND2_CAPACITY]), true, capability);
    expect(d1d2(FlsCapability.None)).toBe(D1D2Messages.LAND_2);
    expect(d1d2(FlsCapability.FApp)).toBe(D1D2Messages.F_APP);
    expect(d1d2(FlsCapability.FAppRaw)).toBe(D1D2Messages.F_APP_RAW);
    expect(d1d2(FlsCapability.RawOnly)).toBe(D1D2Messages.RAW_ONLY);
    expect(computeD1D2Message(word(), word(), word(), true, FlsCapability.None)).toBe(D1D2Messages.APPR_1);
  });
});
