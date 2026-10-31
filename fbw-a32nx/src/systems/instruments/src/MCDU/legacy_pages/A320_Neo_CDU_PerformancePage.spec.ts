// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { CDUPerformancePage } from './A320_Neo_CDU_PerformancePage';

const PAGE_IDS = { PerformancePageTakeoff: 1, PerformancePageClb: 2, PerformancePageCrz: 3 };

/** A plan field: `.get()` is null, anything else a no-op */
const nullField = () => new Proxy({}, { get: (_t, name) => (name === 'get' ? () => null : vi.fn()) });

beforeAll(() => {
  vi.stubGlobal('Simplane', { getAutoPilotAirspeedSelected: () => false });
  vi.stubGlobal('SimVar', { GetSimVarValue: () => 0, SetSimVarValue: vi.fn() });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function createFms() {
  const accessedStubs = new Set<string>();
  const shared = {
    phase: FmgcFlightPhase.Takeoff,
    plan: {
      isActiveOrCopiedFromActive: () => true,
      flags: 0,
      originAirport: undefined,
      destinationAirport: undefined,
      originRunway: undefined,
      performanceData: new Proxy({}, { get: () => nullField() }),
    },
  };
  /** One screen: its own display state and page, the FMS data shared */
  const createScreen = () => {
    const known: Record<string, unknown> = {
      page: { Current: 0, ...PAGE_IDS },
      onLeftInput: [],
      onRightInput: [],
      leftInputDelay: [],
      rightInputDelay: [],
      pageUpdate: () => {},
      clearDisplay: vi.fn(),
      setTemplate: vi.fn(),
      getFlightPlan: () => shared.plan,
      efisInterfaces: undefined,
      guidanceController: undefined,
      perfClbPredToAltitudePilot: undefined,
      climbSpeedLimit: undefined,
      getNavModeSpeedConstraint: () => 250,
      getOriginTransitionAltitude: () => 5000,
      shouldShowConfirmTakeoffData: () => false,
      isEngineOutCondition: { get: () => false },
      managedSpeedClimb: 250,
      managedSpeedClimbMach: 0.78,
      managedSpeedCruise: 280,
      managedSpeedCruiseMach: 0.78,
      managedSpeedDescend: 280,
      managedSpeedDescendMach: 0.78,
      unconfirmedV1Speed: undefined,
      unconfirmedVRSpeed: undefined,
      unconfirmedV2Speed: undefined,
    };
    return new Proxy(known, {
      get: (target, name: string) => {
        if (name === 'flightPhaseManager') {
          return { phase: shared.phase };
        }
        if (!(name in target)) {
          accessedStubs.add(name);
          target[name] = vi.fn();
        }
        return target[name];
      },
    }) as any;
  };
  return { shared, createScreen, accessedStubs };
}

describe('PERF pages on two screens', () => {
  it('both screens on the PERF page refresh every 50 updates', () => {
    const fms = createFms();
    const cpt = fms.createScreen();
    const fo = fms.createScreen();
    CDUPerformancePage.ShowTAKEOFFPage(cpt, FlightPlanIndex.Active);
    CDUPerformancePage.ShowTAKEOFFPage(fo, FlightPlanIndex.Active);
    cpt.clearDisplay.mockClear();
    fo.clearDisplay.mockClear();

    for (let i = 0; i < 50; i++) {
      cpt.pageUpdate();
      fo.pageUpdate();
    }

    expect(cpt.clearDisplay).toHaveBeenCalled();
    expect(fo.clearDisplay).toHaveBeenCalled();
  });

  it('a phase change switches both screens to the new PERF page', () => {
    const fms = createFms();
    const cpt = fms.createScreen();
    const fo = fms.createScreen();
    CDUPerformancePage.ShowTAKEOFFPage(cpt, FlightPlanIndex.Active);
    CDUPerformancePage.ShowTAKEOFFPage(fo, FlightPlanIndex.Active);

    fms.shared.phase = FmgcFlightPhase.Climb;
    for (let i = 0; i < 50; i++) {
      cpt.pageUpdate();
      fo.pageUpdate();
    }

    expect(cpt.page.Current).toBe(PAGE_IDS.PerformancePageClb);
    expect(fo.page.Current).toBe(PAGE_IDS.PerformancePageClb);
  });
});
