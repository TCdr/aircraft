// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { LateralMode } from '@shared/autopilot';
import { shouldAutoEngageApproachPhase } from './ApproachPhaseAutoEngage';

const a320Rule = A320AircraftConfig.vnavConfig.APPROACH_PHASE_AUTO_ENGAGE;
const a380Rule = A380AircraftConfig.vnavConfig.APPROACH_PHASE_AUTO_ENGAGE;

describe('approach phase engagement at the DECEL point', () => {
  it('A320: engages with NAV or LOC below 9500 ft above the destination', () => {
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.NAV, 9000, 0)).toBe(true);
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.LOC_CPT, 9000, 0)).toBe(true);
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.LOC_TRACK, 9000, 0)).toBe(true);
  });

  it('A320: does not engage at or above 9500 ft above the destination', () => {
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.NAV, 9500, 0)).toBe(false);
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.NAV, 12000, 0)).toBe(false);
  });

  it('measures the height above the destination elevation', () => {
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.NAV, 14000, 5400)).toBe(true);
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.NAV, 15000, 5400)).toBe(false);
  });

  it('does not engage in a selected lateral mode', () => {
    expect(shouldAutoEngageApproachPhase(a320Rule, LateralMode.HDG, 3000, 0)).toBe(false);
    expect(shouldAutoEngageApproachPhase(a380Rule, LateralMode.TRACK, 3000, 0)).toBe(false);
  });

  it('A380: engages with NAV below 7200 ft above the destination only', () => {
    expect(shouldAutoEngageApproachPhase(a380Rule, LateralMode.NAV, 7000, 0)).toBe(true);
    expect(shouldAutoEngageApproachPhase(a380Rule, LateralMode.NAV, 8000, 0)).toBe(false);
    expect(shouldAutoEngageApproachPhase(a380Rule, LateralMode.LOC_TRACK, 3000, 0)).toBe(false);
  });
});
