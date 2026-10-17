// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { TakeoffDerated, TakeoffPowerSetting } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import {
  TAKEOFF_DERATE_LEVELS,
  takeoffDeratedOfThrustReduction,
  takeoffDerateThrustReduction,
  takeoffThrustOptionsDisabled,
} from './TakeoffDerate';

describe('MFD PERF T.O derated takeoff', () => {
  // FCOM DSC-70-20-40 l.111564-111565: "6 derated takeoff levels are defined: DO4 , DO8 , D12 , D16 , D20 , D24 . Each
  // level reduces the maximum thrust from 4 % up to 24 %."
  it('lists the six levels of the FCOM, D04 to D24', () => {
    expect(TAKEOFF_DERATE_LEVELS).toEqual(['D04', 'D08', 'D12', 'D16', 'D20', 'D24']);
    expect(TakeoffDerated.D04).toBe(0);
    expect(TakeoffDerated.D24).toBe(5);
  });

  it('gives the FADECs the thrust reduction of the selected level', () => {
    expect(takeoffDerateThrustReduction(TakeoffPowerSetting.DERATED, TakeoffDerated.D04)).toBe(4);
    expect(takeoffDerateThrustReduction(TakeoffPowerSetting.DERATED, TakeoffDerated.D12)).toBe(12);
    expect(takeoffDerateThrustReduction(TakeoffPowerSetting.DERATED, TakeoffDerated.D24)).toBe(24);
    TAKEOFF_DERATE_LEVELS.forEach((label, level) =>
      expect(takeoffDerateThrustReduction(TakeoffPowerSetting.DERATED, level)).toBe(Number(label.slice(1))),
    );
  });

  it('gives the level of a thrust reduction, and none for a reduction that is not a level', () => {
    TAKEOFF_DERATE_LEVELS.forEach((label, level) =>
      expect(takeoffDeratedOfThrustReduction(Number(label.slice(1)))).toBe(level),
    );
    for (const reduction of [0, 2, 6, 28, null, undefined]) {
      expect(takeoffDeratedOfThrustReduction(reduction)).toBeNull();
    }
  });

  it('gives no derate for TOGA, FLEX or no level', () => {
    expect(takeoffDerateThrustReduction(TakeoffPowerSetting.TOGA, TakeoffDerated.D12)).toBe(0);
    expect(takeoffDerateThrustReduction(TakeoffPowerSetting.FLEX, TakeoffDerated.D12)).toBe(0);
    expect(takeoffDerateThrustReduction(TakeoffPowerSetting.DERATED, null)).toBe(0);
    expect(takeoffDerateThrustReduction(null, TakeoffDerated.D12)).toBe(0);
  });
});

describe('MFD PERF T.O thrust options', () => {
  it('offers TOGA, FLEX and DERATED before takeoff', () => {
    expect(takeoffThrustOptionsDisabled(false)).toEqual([false, false, false]);
  });

  it('closes all three once the T.O panel is inactive (takeoff phase or later)', () => {
    expect(takeoffThrustOptionsDisabled(true)).toEqual([true, true, true]);
  });
});
