// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { IsisConfiguration, isisDisplay, isisUnitOf } from './IsisConfiguration';

describe('ISIS SFD/SND reconfiguration', () => {
  it('follows the FCOM cycle of the MODE pb, with one SFD always displayed', () => {
    const displays = (configuration: IsisConfiguration) => [
      isisDisplay(1, configuration),
      isisDisplay(2, configuration),
    ];
    expect(displays(IsisConfiguration.Normal)).toEqual(['SFD', 'SND']);
    expect(displays(IsisConfiguration.Swapped)).toEqual(['SND', 'SFD']);
    expect(displays(IsisConfiguration.SndOff)).toEqual(['SFD', 'OFF']);
    for (const configuration of [0, 1, 2]) {
      expect(displays(configuration)).toContain('SFD');
    }
  });

  it('reads the ISIS of a gauge from its panel.cfg URL', () => {
    expect(isisUnitOf('A380X/SND/snd.html?Index=1', 2)).toBe(1);
    expect(isisUnitOf('A380X/ISISlegacy/isislegacy.html?Index=2', 1)).toBe(2);
    expect(isisUnitOf('A380X/SND/snd.html', 2)).toBe(2);
    expect(isisUnitOf(null, 1)).toBe(1);
  });
});
