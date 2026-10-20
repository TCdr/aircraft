// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EfisNdMode } from '@flybywiresim/fbw-sdk';
import { ArmedLateralMode, ArmedVerticalMode, LateralMode, VerticalMode } from '@shared/autopilot';
import { flsBeamVdLine, isApproachModeSelected, isFlsBeamShown } from './VdFlsBeam';
import { FlsBeam } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';

const beam: FlsBeam = {
  anchorDistance: 30,
  anchorAltitude: 550,
  slope: 3,
  ident: 'LFBO33L',
  anchorAtThreshold: true,
  approachQnh: 1023,
};

const shown = {
  lsPressed: true,
  approachModeSelected: false,
  alongFlightPlan: true,
  ndMode: EfisNdMode.ARC,
  ndRange: 80,
};

describe('VD FLS beam', () => {
  it('shows with an FLS beam, LS or APPR pressed, the cut along the flight plan, ARC <= 80 NM or ROSE NAV <= 160 NM', () => {
    expect(isFlsBeamShown(beam, shown)).toBe(true);
    expect(isFlsBeamShown(beam, { ...shown, lsPressed: false, approachModeSelected: true })).toBe(true);
    expect(isFlsBeamShown(beam, { ...shown, ndMode: EfisNdMode.ROSE_NAV, ndRange: 160 })).toBe(true);
  });

  it('does not show without a beam, LS and APPR, along the track, or above the ranges', () => {
    expect(isFlsBeamShown(null, shown)).toBe(false);
    expect(isFlsBeamShown(beam, { ...shown, lsPressed: false })).toBe(false);
    expect(isFlsBeamShown(beam, { ...shown, alongFlightPlan: false })).toBe(false);
    expect(isFlsBeamShown(beam, { ...shown, ndRange: 160 })).toBe(false);
    expect(isFlsBeamShown(beam, { ...shown, ndMode: EfisNdMode.ROSE_NAV, ndRange: 320 })).toBe(false);
  });

  it('counts an armed or engaged approach mode as the APPR pushbutton', () => {
    expect(isApproachModeSelected(LateralMode.NAV, 1 << ArmedLateralMode.LOC, VerticalMode.ALT, 0)).toBe(true);
    expect(isApproachModeSelected(LateralMode.NAV, 0, VerticalMode.ALT, 1 << ArmedVerticalMode.FINAL)).toBe(true);
    expect(isApproachModeSelected(LateralMode.NAV, 0, VerticalMode.FINAL, 0)).toBe(true);
    expect(isApproachModeSelected(LateralMode.NAV, 1 << ArmedLateralMode.NAV, VerticalMode.DES, 0)).toBe(false);
  });

  it('draws 80 NM of beam back from the anchor point on its slope', () => {
    const line = flsBeamVdLine(beam, false);
    expect(line.endDistance).toBe(30);
    expect(line.endAltitude).toBe(550);
    expect(line.startDistance).toBe(-50);
    expect(line.startAltitude).toBeCloseTo(550 + 80 * 6076.12 * Math.tan((3 * Math.PI) / 180), 3);
  });

  it('is drawn in STD altitudes from the approach QNH when the altimeter is on STD', () => {
    // 10 hPa above standard: the STD altimeter reads about 265 ft lower
    expect(flsBeamVdLine(beam, true).endAltitude).toBeCloseTo(550 - 265, 0);
    expect(flsBeamVdLine({ ...beam, approachQnh: null }, true).endAltitude).toBe(550);
  });
});
