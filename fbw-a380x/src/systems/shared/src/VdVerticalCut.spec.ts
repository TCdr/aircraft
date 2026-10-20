// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ArmedLateralMode, LateralMode } from './autopilot';
import { isVdCutAlongTrack } from './VdVerticalCut';

describe('VD vertical cut', () => {
  it('along the track in the selected lateral modes', () => {
    expect(isVdCutAlongTrack(LateralMode.HDG, 0)).toBe(true);
    expect(isVdCutAlongTrack(LateralMode.TRACK, 0)).toBe(true);
    expect(isVdCutAlongTrack(LateralMode.NONE, 0)).toBe(true);
    expect(isVdCutAlongTrack(LateralMode.GA_TRACK, 0)).toBe(true);
  });

  it('along the flight plan in NAV, or with NAV armed', () => {
    expect(isVdCutAlongTrack(LateralMode.NAV, 0)).toBe(false);
    expect(isVdCutAlongTrack(LateralMode.HDG, 1 << ArmedLateralMode.NAV)).toBe(false);
  });
});
