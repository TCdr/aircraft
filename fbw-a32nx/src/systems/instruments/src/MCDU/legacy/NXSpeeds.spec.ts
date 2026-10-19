// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { NXSpeedsApp, vappTowerHeadwind } from './NXSpeeds';

const towerHeadwindWord = (headwind: number | null) => {
  const word = Arinc429Register.empty();
  word.setValue(headwind ?? 0);
  word.setSsm(headwind === null ? Arinc429SignStatusMatrix.NoComputedData : Arinc429SignStatusMatrix.NormalOperation);
  return word;
};

describe('VAPP with the tower headwind of the PERF APPR page', () => {
  it('adds a third of the tower headwind to the VLS', () => {
    const speeds = new NXSpeedsApp(60, false, vappTowerHeadwind(towerHeadwindWord(30)));
    expect(speeds.vapp - speeds.vls).toBe(10);
  });

  it('adds 5 kt minimum (no wind, tailwind) and 15 kt maximum', () => {
    for (const [headwind, correction] of [
      [null, 5],
      [-20, 5],
      [9, 5],
      [60, 15],
    ] as const) {
      const speeds = new NXSpeedsApp(60, false, vappTowerHeadwind(towerHeadwindWord(headwind)));
      expect(speeds.vapp - speeds.vls).toBe(correction);
    }
  });
});
