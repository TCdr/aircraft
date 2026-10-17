// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { NavRadioUtils } from './NavRadioUtils';

// The MCDU RADIO NAV page ADF/BFO prompt: the BFO is a mode of a tuned ADF
describe('NavRadioUtils ADF BFO', () => {
  it('names the BFO L:var of each ADF', () => {
    expect(NavRadioUtils.adfBfoVar(1)).toBe('L:A32NX_ADF_1_BFO_ON');
    expect(NavRadioUtils.adfBfoVar(2)).toBe('L:A32NX_ADF_2_BFO_ON');
  });

  it('keeps the selected BFO of a tuned ADF', () => {
    expect(NavRadioUtils.adfBfo(350, true)).toBe(true);
    expect(NavRadioUtils.adfBfo(350, false)).toBe(false);
  });

  it('has no BFO without a tuned ADF', () => {
    expect(NavRadioUtils.adfBfo(null, true)).toBe(false);
  });
});
