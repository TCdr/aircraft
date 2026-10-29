// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  DisplayUnitState,
  getOitDisplayVisibility,
  oitDisplayVisibilityChanged,
  roundBrightnessPercent,
} from './OitDisplayVisibility';

describe('getOitDisplayVisibility', () => {
  it('shows the self-test screen during boot-up and self-test', () => {
    for (const state of [DisplayUnitState.Bootup, DisplayUnitState.Selftest]) {
      expect(getOitDisplayVisibility(state)).toEqual({ selfTestVisible: true, contentVisible: false });
    }
  });

  it('shows the OIT pages only when on', () => {
    expect(getOitDisplayVisibility(DisplayUnitState.On)).toEqual({ selfTestVisible: false, contentVisible: true });
  });

  it('shows nothing when off, in standby or failed', () => {
    for (const state of [DisplayUnitState.Off, DisplayUnitState.Standby, DisplayUnitState.Failed]) {
      expect(getOitDisplayVisibility(state)).toEqual({ selfTestVisible: false, contentVisible: false });
    }
  });
});

describe('oitDisplayVisibilityChanged', () => {
  const dark = { selfTestVisible: false, contentVisible: false };

  it('applies the first state, even a dark one', () => {
    expect(oitDisplayVisibilityChanged(null, dark)).toBe(true);
  });

  it('does not rewrite an unchanged state', () => {
    expect(oitDisplayVisibilityChanged(dark, { selfTestVisible: false, contentVisible: false })).toBe(false);
  });

  it('applies a change of either div', () => {
    expect(oitDisplayVisibilityChanged(dark, { selfTestVisible: true, contentVisible: false })).toBe(true);
    expect(oitDisplayVisibilityChanged(dark, { selfTestVisible: false, contentVisible: true })).toBe(true);
  });
});

describe('roundBrightnessPercent', () => {
  it('rounds float noise to the same whole percent', () => {
    expect(roundBrightnessPercent(74.9999)).toBe(75);
    expect(roundBrightnessPercent(75.0001)).toBe(75);
  });

  it('keeps a knob at OFF at 0', () => {
    expect(roundBrightnessPercent(0)).toBe(0);
  });

  it('never rounds a knob that is not at OFF down to 0', () => {
    expect(roundBrightnessPercent(0.2)).toBe(1);
  });
});
