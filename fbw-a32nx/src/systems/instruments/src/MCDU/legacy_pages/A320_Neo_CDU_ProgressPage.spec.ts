// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { FmgcFlightPhase } from '@shared/flightphase';
import { CDUProgressPage } from './A320_Neo_CDU_ProgressPage';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';

const PROGRESS_PAGE = 5;
const POSITION_UPDATE_LSK = 2;

/** One MCDU screen: the per-screen fields of the real MCDU with their initial values, spies for the display. */
function createScreen() {
  const screen: any = {
    page: { Current: 0, ProgressPage: PROGRESS_PAGE },
    onLeftInput: [] as any[],
    onRightInput: [] as any[],
    leftInputDelay: [],
    rightInputDelay: [],
    returnPageCallback: null,
    SelfPtr: false,
    PageTimeout: { Default: 2000 },
    pendingPositionUpdate: null,
    activeSystem: 'FMGC',
    optimumFlightLevel: null,
    progWaypointIdent: undefined,
    flightPhaseManager: { phase: FmgcFlightPhase.Cruise },
    navigation: {
      getGpsPrimary: () => false,
      requiredPerformance: { manualRnp: false, activeRnp: undefined },
      currentPerformance: undefined,
      accuracyHigh: { get: () => true },
      updatePositionAt: vi.fn(() => true),
    },
    clearDisplay: vi.fn(),
    setTemplate: vi.fn(),
    setScratchpadMessage: vi.fn(),
    getMaxFlCorrected: () => null,
    getFlightPlan: () => ({
      flightNumber: { get: () => 'TEST' },
      performanceData: { cruiseFlightLevel: { get: () => 350 } },
    }),
  };
  return screen;
}

const positionUpdateLabel = (screen: any): string =>
  screen.setTemplate.mock.calls[screen.setTemplate.mock.calls.length - 1][0][5][0];

const flushPromises = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe('the PROG page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(WaypointEntryUtils, 'getOrCreateWaypoint').mockResolvedValue({
      ident: 'NOSLO',
      location: { lat: 59, long: 10 },
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a POSITION UPDATE AT entry is pending on the MCDU that made it only', async () => {
    const cpt = createScreen();
    const fo = createScreen();
    CDUProgressPage.ShowPage(cpt);
    CDUProgressPage.ShowPage(fo);

    cpt.onLeftInput[POSITION_UPDATE_LSK]('NOSLO', vi.fn());
    await flushPromises();
    expect(positionUpdateLabel(cpt)).toContain('CONFIRM UPDATE AT');

    CDUProgressPage.ShowPage(fo);
    expect(positionUpdateLabel(fo)).not.toContain('CONFIRM UPDATE AT');

    // CLR on the F/O does not cancel the CPT entry
    fo.onLeftInput[POSITION_UPDATE_LSK](Keypad.clrValue, vi.fn());
    CDUProgressPage.ShowPage(cpt);
    expect(positionUpdateLabel(cpt)).toContain('CONFIRM UPDATE AT');

    // and the F/O cannot confirm it
    fo.onRightInput[POSITION_UPDATE_LSK](undefined, vi.fn());
    expect(fo.navigation.updatePositionAt).not.toHaveBeenCalled();
  });
});
