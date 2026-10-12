// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FmcInterface } from '../../FMC/FmcInterface';
import { CpnyWindButtonStateTracker } from './CpnyWindButtonUtils';

/** An FMC with the company wind state of each flight plan */
function fakeFmc() {
  const availableForPlan = new Map<number, Subject<boolean>>([
    [FlightPlanIndex.Active, Subject.create(false)],
    [FlightPlanIndex.FirstSecondary, Subject.create(false)],
  ]);
  const availableForAnyPlan = Subject.create(false);
  const uplinkInProgress = Subject.create(false);
  const cpnyWindUplinkInProgress = Subject.create(false);
  const cpnyWindRequestedForPlan = Subject.create<number | null>(null);
  const fmc = {
    fmgc: { data: { flightPhase: Subject.create(FmgcFlightPhase.Preflight) } },
    getUplinkInProgress: () => uplinkInProgress,
    getCpnyWindUplinkInProgress: () => cpnyWindUplinkInProgress,
    getCpnyWindRequestedForPlan: () => cpnyWindRequestedForPlan,
    getWindUplinkAvailableForPlan: (index?: number) =>
      index === undefined ? availableForAnyPlan : availableForPlan.get(index)!,
  } as unknown as FmcInterface;
  return { fmc, availableForPlan, uplinkInProgress, cpnyWindUplinkInProgress, cpnyWindRequestedForPlan };
}

describe('CPNY WIND REQUEST button state', () => {
  it('follows the plan of the page when its index changes, and no longer the previous plan', () => {
    const { fmc, availableForPlan } = fakeFmc();
    const index = Subject.create<number>(FlightPlanIndex.Active);
    const tracker = new CpnyWindButtonStateTracker(fmc, index, Subject.create(false), Subject.create(true));

    availableForPlan.get(FlightPlanIndex.Active)!.set(true);
    expect(tracker.state.get().availableForPlan).toBe(true);

    index.set(FlightPlanIndex.FirstSecondary);
    expect(tracker.state.get().availableForPlan).toBe(false);

    // The active plan's winds must not reach the SEC page any more
    availableForPlan.get(FlightPlanIndex.Active)!.set(false);
    availableForPlan.get(FlightPlanIndex.Active)!.set(true);
    expect(tracker.state.get().availableForPlan).toBe(false);

    tracker.destroy();
  });

  it('disallows a request for the active plan after the cruise phase', () => {
    const { fmc } = fakeFmc();
    const tracker = new CpnyWindButtonStateTracker(
      fmc,
      Subject.create<number>(FlightPlanIndex.Active),
      Subject.create(false),
      Subject.create(true),
    );
    (fmc.fmgc.data.flightPhase as Subject<FmgcFlightPhase>).set(FmgcFlightPhase.Descent);
    expect(tracker.state.get().flightPhaseDisallows).toBe(true);
    tracker.destroy();
  });

  it('shows a pending wind request only on the page of its flight plan', () => {
    const { fmc, uplinkInProgress, cpnyWindUplinkInProgress, cpnyWindRequestedForPlan } = fakeFmc();
    const active = new CpnyWindButtonStateTracker(
      fmc,
      Subject.create<number>(FlightPlanIndex.Active),
      Subject.create(false),
      Subject.create(true),
    );
    const sec = new CpnyWindButtonStateTracker(
      fmc,
      Subject.create<number>(FlightPlanIndex.FirstSecondary),
      Subject.create(false),
      Subject.create(false),
    );

    // A company wind request of the active plan
    cpnyWindRequestedForPlan.set(FlightPlanIndex.Active);
    uplinkInProgress.set(true);
    cpnyWindUplinkInProgress.set(true);

    expect(active.state.get().cpnyWindUplinkInProgress).toBe(true);
    expect(sec.state.get().cpnyWindUplinkInProgress).toBe(false);

    active.destroy();
    sec.destroy();
  });
});
