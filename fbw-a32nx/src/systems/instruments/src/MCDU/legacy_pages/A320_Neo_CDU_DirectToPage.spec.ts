// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CDUFlightPlanPage } from './A320_Neo_CDU_FlightPlanPage';
import { CDUDirectToPage } from './A320_Neo_CDU_DirectToPage';
import { Fix } from '@flybywiresim/fbw-sdk';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';

const DUPLICATED_FIX = { ident: 'IAF', location: { lat: 10, long: 10 } };

/** A flight plan leg ending at a fix */
function leg(ident: string, location: { lat: number; long: number }) {
  const fix = ident === DUPLICATED_FIX.ident ? DUPLICATED_FIX : { ident, location };
  return {
    isDiscontinuity: false,
    ident,
    isXF: () => true,
    isHX: () => false,
    terminationWaypoint: () => fix,
    terminatesWithWaypoint: (w: { ident: string }) => w.ident === ident,
  };
}

// The IAF is flown twice (a hold at the IAF): the pilot selects the second occurrence
const LEGS = [leg('START', { lat: 0, long: 0 }), leg('IAF', DUPLICATED_FIX.location), leg('MID', { lat: 5, long: 5 })];
LEGS.push(leg('IAF', DUPLICATED_FIX.location));
const SECOND_OCCURRENCE = 3;

function createFakeMcdu() {
  const plan = {
    flightNumber: { get: () => 'TEST' },
    activeLegIndex: 0,
    firstMissedApproachLegIndex: 99,
    allLegs: LEGS,
  };
  return {
    flightPlanService: { active: plan },
    page: { Current: 0, DirectToPage: 1 },
    PageTimeout: { Medium: 1000 },
    getDelayBasic: 0,
    leftInputDelay: [] as unknown[],
    rightInputDelay: [] as unknown[],
    onLeftInput: [] as ((value: string, scratchpadCallback: () => void) => void)[],
    onRightInput: [] as ((value: string, scratchpadCallback: () => void) => void)[],
    clearDisplay: vi.fn(),
    setTemplate: vi.fn(),
    setArrows: vi.fn(),
    setScratchpadMessage: vi.fn(),
    showFmsErrorMessage: vi.fn(),
    logTroubleshootingError: vi.fn(),
    eraseTemporaryFlightPlan: vi.fn((callback: () => void) => callback()),
    directToLeg: vi.fn(() => Promise.resolve()),
    directToWaypoint: vi.fn(() => Promise.resolve()),
  };
}

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('MCDU DIR TO page functions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(CDUFlightPlanPage, 'createWaypointsAndMarkers').mockReturnValue([] as any);
    vi.spyOn(CDUFlightPlanPage, 'createScrollWindow').mockReturnValue(
      LEGS.map((l, fpIndex) => ({ type: 'leg', fpIndex, leg: l })) as any,
    );
    vi.spyOn(CDUFlightPlanPage, 'createScrollText').mockReturnValue([] as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a radial on a DIR TO made from the flight plan keeps the selected leg', async () => {
    const mcdu = createFakeMcdu();
    const fms = mcdu as unknown as LegacyFmsPageInterface;

    CDUDirectToPage.ShowPage(fms);
    // the list rows start at row 1 while no DIR TO exists
    mcdu.onLeftInput[1 + SECOND_OCCURRENCE]('', vi.fn());
    await flushPromises();
    expect(mcdu.directToLeg).toHaveBeenLastCalledWith(SECOND_OCCURRENCE);

    mcdu.directToLeg.mockClear();
    mcdu.onRightInput[0]('090', vi.fn());
    await flushPromises();

    expect(mcdu.directToLeg).toHaveBeenCalledWith(SECOND_OCCURRENCE, false, {
      course: 90,
      isTrue: false,
      inbound: true,
    });
    expect(mcdu.directToWaypoint).not.toHaveBeenCalled();
  });

  it('a radial on a DIR TO to an entered waypoint rebuilds it from the waypoint', async () => {
    const mcdu = createFakeMcdu();
    const fms = mcdu as unknown as LegacyFmsPageInterface;

    CDUDirectToPage.ShowPage(fms, DUPLICATED_FIX as unknown as Fix);
    mcdu.onRightInput[0]('090', vi.fn());
    await flushPromises();

    expect(mcdu.directToWaypoint).toHaveBeenCalledWith(DUPLICATED_FIX, false, {
      course: 90,
      isTrue: false,
      inbound: true,
    });
    expect(mcdu.directToLeg).not.toHaveBeenCalled();
  });
});
