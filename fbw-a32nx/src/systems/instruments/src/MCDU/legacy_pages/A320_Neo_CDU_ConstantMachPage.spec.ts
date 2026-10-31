// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { CDUConstantMachPage } from './A320_Neo_CDU_ConstantMachPage';

const PAGE_IDS = { ConstantMachPage: 5 };

/** A screen of the shared FMS: its own display state and page callbacks */
function createScreen(plan: unknown) {
  return {
    page: { Current: 0, ...PAGE_IDS },
    onLeftInput: [] as any[],
    onRightInput: [] as any[],
    leftInputDelay: [] as any[],
    rightInputDelay: [] as any[],
    clearDisplay: vi.fn(),
    setTemplate: vi.fn(),
    setArrows: vi.fn(),
    setScratchpadMessage: vi.fn(),
    getFlightPlan: () => plan,
    flightPlanService: { hasTemporary: false },
    guidanceController: undefined,
    flightPhaseManager: { phase: 0 },
  } as any;
}

describe('CONSTANT MACH RETURN on two screens', () => {
  it('the RETURN key of a screen runs the callback that screen was opened with', () => {
    const plan = {
      allLegs: [],
      maybeElementAt: () => undefined,
      performanceData: new Proxy({}, { get: () => ({ get: () => null }) }),
    };
    const cpt = createScreen(plan);
    const fo = createScreen(plan);
    const returnCpt = vi.fn();
    const returnFo = vi.fn();
    CDUConstantMachPage.ShowPage(cpt, 0, FlightPlanIndex.Active, returnCpt);
    CDUConstantMachPage.ShowPage(fo, 0, FlightPlanIndex.Active, returnFo);

    cpt.onLeftInput[5]('');

    expect(returnCpt).toHaveBeenCalledTimes(1);
    expect(returnFo).not.toHaveBeenCalled();
  });
});
