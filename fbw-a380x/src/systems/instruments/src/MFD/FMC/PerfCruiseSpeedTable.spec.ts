// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  cruiseSpeedRestriction,
  CruiseSpeedRestrictionInputs,
  cruiseSpeedRestrictionLabelTitle,
  isEconLineShown,
  ManagedCruiseSpeedInfo,
  managedCruiseSecondsToReference,
  managedTargetCells,
} from './PerfCruiseSpeedTable';

describe('PERF CRZ table, MANAGED line with the selected speed control', () => {
  it('time to the reference point at the managed true airspeed, with the present wind component', () => {
    // 50 kt headwind: 490 kt TAS gives 440 kt; the managed 500 kt TAS gives 450 kt over 450 NM: 1 h
    expect(managedCruiseSecondsToReference(450, 500, 440, 490)).toBeCloseTo(3600, 6);
    // tailwind
    expect(managedCruiseSecondsToReference(550, 500, 540, 490)).toBeCloseTo(3600, 6);
  });

  it('no time once the reference point is behind, or without a ground speed', () => {
    expect(managedCruiseSecondsToReference(-1, 500, 440, 490)).toBeNull();
    expect(managedCruiseSecondsToReference(100, 0, 0, 490)).toBeNull();
    expect(managedCruiseSecondsToReference(NaN, 500, 440, 490)).toBeNull();
  });
});

describe('PERF CRZ table, speed restriction of the MANAGED line', () => {
  const none: CruiseSpeedRestrictionInputs = {
    speedLimitApplied: false,
    constantMachApplied: false,
    hold: null,
    rtaApplied: false,
  };
  const pilotHold = { isProcedureIcaoLimit: false };
  const procedureHoldAtIcaoLimit = { isProcedureIcaoLimit: true };

  it('no restriction: the managed speed is the ECON speed', () => {
    expect(cruiseSpeedRestriction(none)).toBeNull();
  });

  it('each restriction alone', () => {
    expect(cruiseSpeedRestriction({ ...none, speedLimitApplied: true })).toBe('SPD LIM');
    expect(cruiseSpeedRestriction({ ...none, constantMachApplied: true })).toBe('CMS');
    expect(cruiseSpeedRestriction({ ...none, hold: pilotHold })).toBe('HOLD SPD');
    expect(cruiseSpeedRestriction({ ...none, hold: procedureHoldAtIcaoLimit })).toBe('PROC SP');
    expect(cruiseSpeedRestriction({ ...none, rtaApplied: true })).toBe('RTA');
  });

  it('decreasing priority: SPD LIM, CMS, HOLD SPD / PROC SP, RTA', () => {
    const all = { speedLimitApplied: true, constantMachApplied: true, hold: pilotHold, rtaApplied: true };
    expect(cruiseSpeedRestriction(all)).toBe('SPD LIM');
    expect(cruiseSpeedRestriction({ ...all, speedLimitApplied: false })).toBe('CMS');
    expect(cruiseSpeedRestriction({ ...all, speedLimitApplied: false, constantMachApplied: false })).toBe('HOLD SPD');
    // a CMS has priority over a time constraint
    expect(cruiseSpeedRestriction({ ...none, constantMachApplied: true, rtaApplied: true })).toBe('CMS');
    expect(cruiseSpeedRestriction({ ...none, hold: procedureHoldAtIcaoLimit, rtaApplied: true })).toBe('PROC SP');
  });

  it('the label below the table exists for the speed limit and the holds only', () => {
    expect(cruiseSpeedRestrictionLabelTitle('SPD LIM')).toBe('CLB SPD LIM');
    expect(cruiseSpeedRestrictionLabelTitle('HOLD SPD')).toBe('HOLD SPD');
    expect(cruiseSpeedRestrictionLabelTitle('PROC SP')).toBe('PROC SPD');
    expect(cruiseSpeedRestrictionLabelTitle('CMS')).toBeNull();
    expect(cruiseSpeedRestrictionLabelTitle('RTA')).toBeNull();
    expect(cruiseSpeedRestrictionLabelTitle(null)).toBeNull();
  });
});

describe('PERF CRZ table, managed target and ECON line', () => {
  const econAtCruiseLevel: ManagedCruiseSpeedInfo = {
    targetCas: 268.4,
    targetMach: 0.85,
    restriction: null,
    speedLimit: null,
    holdWaypoint: null,
    econSpeed: 310,
    econMach: 0.85,
    econCas: 268.4,
  };

  it('a Mach target shows the cruise Mach, not a speed', () => {
    expect(managedTargetCells(econAtCruiseLevel)).toEqual({ speed: '---', mach: '.85' });
  });

  it('a speed target shows the managed cruise speed (here the climb speed limit), not the Mach', () => {
    const belowSpeedLimit: ManagedCruiseSpeedInfo = {
      ...econAtCruiseLevel,
      targetCas: 250,
      targetMach: null,
      restriction: 'SPD LIM',
    };
    expect(managedTargetCells(belowSpeedLimit)).toEqual({ speed: '250', mach: '.--' });
  });

  it('the hold speed has no Mach', () => {
    const hold = { ...econAtCruiseLevel, targetCas: 265, targetMach: null };
    expect(managedTargetCells(hold)).toEqual({ speed: '265', mach: '.--' });
  });

  it('ECON line only when the managed target differs from the ECON target', () => {
    expect(isEconLineShown(econAtCruiseLevel)).toBe(false);
    // CMS at M.86 with ECON at M.85
    expect(isEconLineShown({ ...econAtCruiseLevel, targetMach: 0.86, targetCas: 272.1, restriction: 'CMS' })).toBe(
      true,
    );
    // CMS at the ECON Mach: same target
    expect(isEconLineShown({ ...econAtCruiseLevel, targetCas: 268.3, restriction: 'CMS' })).toBe(false);
    // hold speed, speed limit, RTA speed
    expect(isEconLineShown({ ...econAtCruiseLevel, targetCas: 265, targetMach: null })).toBe(true);
    expect(isEconLineShown({ ...econAtCruiseLevel, targetCas: 250, targetMach: null })).toBe(true);
    expect(isEconLineShown({ ...econAtCruiseLevel, targetMach: 0.84, targetCas: 264.9, restriction: 'RTA' })).toBe(
      true,
    );
  });
});
