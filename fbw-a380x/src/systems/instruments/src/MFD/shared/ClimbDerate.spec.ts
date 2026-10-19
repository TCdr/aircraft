// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClimbDerated } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { CLIMB_DERATE_LEVELS, CLIMB_DERATE_LVAR, ClimbDerateOutput, climbDerateLevel } from './ClimbDerate';

describe('MFD PERF CLB derated climb', () => {
  // The engine defines three derated climb levels, DCL1 to DCL3
  it('lists NONE and the three levels of the engine', () => {
    expect(CLIMB_DERATE_LEVELS).toEqual(['NONE', '01', '02', '03']);
    expect(ClimbDerated.NONE).toBe(0);
    expect(ClimbDerated.D03).toBe(3);
    expect(Object.values(ClimbDerated).filter((v) => typeof v === 'number')).toHaveLength(CLIMB_DERATE_LEVELS.length);
  });

  it('gives the FADECs the selected level, 0 for NONE or no entry', () => {
    expect(climbDerateLevel(ClimbDerated.D01)).toBe(1);
    expect(climbDerateLevel(ClimbDerated.D02)).toBe(2);
    expect(climbDerateLevel(ClimbDerated.D03)).toBe(3);
    expect(climbDerateLevel(ClimbDerated.NONE)).toBe(0);
    expect(climbDerateLevel(null)).toBe(0);
    expect(climbDerateLevel(undefined)).toBe(0);
    expect(climbDerateLevel(5 as ClimbDerated)).toBe(0);
  });
});

describe('MFD PERF CLB derated climb output', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the level of the active flight plan when it changes', () => {
    const setSimVarValue = vi.fn();
    vi.stubGlobal('SimVar', { SetSimVarValue: setSimVarValue });
    const output = new ClimbDerateOutput();

    output.write(ClimbDerated.D02);
    output.write(ClimbDerated.D02);
    output.write(null);

    expect(setSimVarValue.mock.calls).toEqual([
      [CLIMB_DERATE_LVAR, 'Number', 2],
      [CLIMB_DERATE_LVAR, 'Number', 0],
    ]);
  });
});
