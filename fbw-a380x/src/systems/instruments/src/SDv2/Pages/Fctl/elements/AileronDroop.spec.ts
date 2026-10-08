// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isAileronDroopSymbolShown } from './AileronDroop';

/* A380 FCOM DSC-27-10-20: the aileron droop (white round symbol) applies in CONF 1+F, 2, 3 and FULL. */
describe('SD F/CTL aileron droop symbol', () => {
  it.each([
    [0, 'CONF 0'],
    [1, 'CONF 1'],
  ])('is hidden in %s (%s)', (index) => {
    expect(isAileronDroopSymbolShown(index)).toBe(false);
  });

  it.each([
    [2, 'CONF 1+F'],
    [3, 'CONF 2'],
    [4, 'CONF 2S'],
    [5, 'CONF 3'],
    [6, 'CONF FULL'],
  ])('is shown in %s (%s)', (index) => {
    expect(isAileronDroopSymbolShown(index)).toBe(true);
  });

  it('the aileron element reads the flap configuration instead of an always-on symbol', () => {
    const aileron = readFileSync(resolve(__dirname, 'Aileron.tsx'), 'utf-8');
    expect(aileron).not.toContain('showAileronDroopSymbol = Subject.create(true)');
    expect(aileron).toContain(".on('flapsConfIndex')");
    expect(aileron).toContain('.map(isAileronDroopSymbolShown)');
  });
});
