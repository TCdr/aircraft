// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { RtaDeletionReason } from './RtaAutoDeletion';
import { A320_RTA_RULES, A380_RTA_RULES, RtaCycleInput, RtaManager } from './RtaManager';
import { TimeConstraint, TimeConstraintType } from './TimeConstraint';

const NOW = 10 * 3600;

const rtaAt = (utcSeconds: number, type = TimeConstraintType.At): TimeConstraint => ({
  ident: 'KONAN',
  databaseId: 'WEUR    KONAN',
  type,
  utcSeconds,
});

function cycle(overrides: Partial<RtaCycleInput> & { secondsToWaypoint?: number; version?: number }): RtaCycleInput {
  const { secondsToWaypoint = 3600, version = 1, ...rest } = overrides;
  return {
    rta: rtaAt(NOW + 3600),
    flightPhase: FmgcFlightPhase.Cruise,
    engineOut: false,
    clockValid: true,
    inHold: false,
    waypointInPlan: true,
    waypointAhead: true,
    prediction: { version, secondsToWaypoint, distanceToWaypointNm: 450 },
    nowUtcSeconds: NOW,
    crewEttUtcSeconds: null,
    distanceToTopOfDescentNm: 300,
    lateralManaged: true,
    managedSpeedActive: true,
    speedSpanUp: 0.03,
    speedSpanDown: 0.15,
    ...rest,
  };
}

describe('RtaManager', () => {
  it('does nothing without an RTA', () => {
    const manager = new RtaManager(A320_RTA_RULES);
    const result = manager.update(cycle({ rta: null }));
    expect(result.timeError).toBeNull();
    expect(manager.speedBias).toBe(0);
  });

  it('computes the time error from the clock and the predicted flight time', () => {
    const manager = new RtaManager(A320_RTA_RULES);
    const result = manager.update(cycle({ secondsToWaypoint: 3640 }));
    expect(result.timeError).toBe(40);
    expect(result.etaUtcSeconds).toBe(NOW + 3640);
    expect(result.missed).toBe(true);
  });

  it('changes the speed once per new prediction made with the last speed (second VNAV profile after it)', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    const first = manager.update(cycle({ secondsToWaypoint: 3700, version: 1 }));
    expect(first.speedAdjustmentStarted).toBe(true);
    expect(first.adjustingSpeed).toBe(true);
    const bias = manager.speedBias;
    expect(bias).toBeGreaterThan(0);

    // same prediction, then the profile that may still use the old speeds: no new step
    expect(manager.update(cycle({ secondsToWaypoint: 3700, version: 1 })).speedAdjustmentStarted).toBe(false);
    manager.update(cycle({ secondsToWaypoint: 3700, version: 2 }));
    expect(manager.speedBias).toBe(bias);

    // the profile made with the new speed: still late, so a further step, but not a new "started" event
    const third = manager.update(cycle({ secondsToWaypoint: 3650, version: 3 }));
    expect(manager.speedBias).toBeGreaterThan(bias);
    expect(third.speedAdjustmentStarted).toBe(false);
    expect(third.adjustingSpeed).toBe(true);

    // on time: the adjustment ends
    const done = manager.update(cycle({ secondsToWaypoint: 3602, version: 5 }));
    expect(done.adjustingSpeed).toBe(false);
  });

  it('deletes the RTA and goes back to ECON speed on an automatic deletion', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    manager.update(cycle({ secondsToWaypoint: 3700 }));
    expect(manager.speedBias).not.toBe(0);
    const result = manager.update(cycle({ engineOut: true, version: 2 }));
    expect(result.deletion).toEqual({ reason: RtaDeletionReason.EngineOut, message: true });
    expect(manager.speedBias).toBe(0);
  });

  it('A380: from 40 NM before the T/D the RTA is not taken into account (ECON speed, no TIME ERROR)', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    manager.update(cycle({ secondsToWaypoint: 3700 }));
    expect(manager.speedBias).not.toBe(0);
    const result = manager.update(cycle({ secondsToWaypoint: 3700, version: 3, distanceToTopOfDescentNm: 39 }));
    expect(manager.speedBias).toBe(0);
    expect(result.missed).toBe(true);
    expect(result.timeErrorMessage).toBe(false);
  });

  it('A380: not taken into account in descent', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    const result = manager.update(cycle({ secondsToWaypoint: 3700, flightPhase: FmgcFlightPhase.Descent }));
    expect(manager.speedBias).toBe(0);
    expect(result.timeErrorMessage).toBe(false);
  });

  it('A320: keeps the RTA speed in descent (frozen descent speeds), TIME ERROR AT in NAV only', () => {
    const manager = new RtaManager(A320_RTA_RULES);
    manager.update(cycle({ secondsToWaypoint: 3700 }));
    const bias = manager.speedBias;
    const inNav = manager.update(cycle({ secondsToWaypoint: 3700, version: 3, flightPhase: FmgcFlightPhase.Descent }));
    expect(manager.speedBias).toBe(bias);
    expect(inNav.timeErrorMessage).toBe(true);
    const inHeading = manager.update(
      cycle({ secondsToWaypoint: 3700, version: 4, flightPhase: FmgcFlightPhase.Descent, lateralManaged: false }),
    );
    expect(inHeading.timeErrorMessage).toBe(false);
  });

  it('computes the time error across midnight', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    const result = manager.update(
      cycle({ nowUtcSeconds: 23 * 3600 + 50 * 60, rta: rtaAt(10 * 60), secondsToWaypoint: 20 * 60 }),
    );
    expect(result.timeError).toBe(0);
    expect(result.etaUtcSeconds).toBe(10 * 60);
  });

  it('keeps stepping after the VNAV profile is reset (its version starts again)', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    manager.update(cycle({ secondsToWaypoint: 3700, version: 50 }));
    const bias = manager.speedBias;
    manager.update(cycle({ secondsToWaypoint: 3690, version: 1 }));
    expect(manager.speedBias).toBeGreaterThan(bias);
  });

  it('does not change the speed while the speed is selected', () => {
    const manager = new RtaManager(A320_RTA_RULES);
    manager.update(cycle({ secondsToWaypoint: 3700, managedSpeedActive: false }));
    expect(manager.speedBias).toBe(0);
  });

  it('preflight: computes the takeoff time that meets the RTA at ECON speed', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    const result = manager.update(
      cycle({ flightPhase: FmgcFlightPhase.Preflight, rta: rtaAt(NOW + 3 * 3600), secondsToWaypoint: 2 * 3600 }),
    );
    expect(result.computedEttUtcSeconds).toBe(NOW + 3600);
    expect(result.timeError).toBe(0);
    expect(manager.speedBias).toBe(0);
  });

  it('preflight: no computed takeoff time when the flight is longer than the time left, the speed increases', () => {
    const manager = new RtaManager(A380_RTA_RULES);
    const result = manager.update(
      cycle({ flightPhase: FmgcFlightPhase.Preflight, rta: rtaAt(NOW + 3 * 3600), secondsToWaypoint: 3 * 3600 + 120 }),
    );
    expect(result.computedEttUtcSeconds).toBeNull();
    expect(result.timeError).toBe(120);
    expect(manager.speedBias).toBeGreaterThan(0);
  });

  it('preflight: a crew ETT is the time reference, no computed one', () => {
    const manager = new RtaManager(A320_RTA_RULES);
    const result = manager.update(
      cycle({
        flightPhase: FmgcFlightPhase.Preflight,
        rta: rtaAt(NOW + 3 * 3600),
        crewEttUtcSeconds: NOW + 1800,
        secondsToWaypoint: 2 * 3600,
      }),
    );
    expect(result.computedEttUtcSeconds).toBeNull();
    expect(result.timeError).toBe(-1800);
    expect(manager.speedBias).toBeLessThan(0);
  });
});
