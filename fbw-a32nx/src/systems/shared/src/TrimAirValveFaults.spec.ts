// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { trimAirValveFaults } from './TrimAirValveFaults';

/** An ACSC discrete word 2 (normal operation) with the given bits set */
function word2(...bits: number[]): Arinc429Word {
  const word = Arinc429Word.empty();
  word.ssm = Arinc429SignStatusMatrix.NormalOperation;
  word.value = bits.reduce((v, bit) => v | (1 << (bit - 1)), 0);
  return word;
}

describe('trimAirValveFaults (ACSC discrete words 2, FCOM DSC-21-10-50 COND page)', () => {
  it('reports each valve from its own bit', () => {
    expect(trimAirValveFaults(word2(18), word2())).toEqual({ cockpit: true, forward: false, aft: false });
    expect(trimAirValveFaults(word2(19), word2())).toEqual({ cockpit: false, forward: true, aft: false });
    expect(trimAirValveFaults(word2(20), word2())).toEqual({ cockpit: false, forward: false, aft: true });
  });

  it('takes a valve reported failed by either controller', () => {
    expect(trimAirValveFaults(word2(), word2(19, 20))).toEqual({ cockpit: false, forward: true, aft: true });
  });

  it('reports no failed valve from failed controllers (no computed data)', () => {
    expect(trimAirValveFaults(Arinc429Word.empty(), Arinc429Word.empty())).toEqual({
      cockpit: false,
      forward: false,
      aft: false,
    });
  });
});
