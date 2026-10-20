// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { NavGeometryProfile, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { AircraftToDescentProfileRelation } from './AircraftToProfileRelation';

const TOTAL_DISTANCE = 300;

/** A descent profile: T/D at 190 NM, repressurization segment down to 200 NM, idle path, geometric path from 280 NM */
function relationAt(distanceFromStart: number, withRepressurizationSegment = true): AircraftToDescentProfileRelation {
  const checkpoints: Partial<Record<VerticalCheckpointReason, { distanceFromStart: number }>> = {
    [VerticalCheckpointReason.TopOfDescent]: { distanceFromStart: 190 },
    [VerticalCheckpointReason.GeometricPathStart]: { distanceFromStart: 280 },
  };
  if (withRepressurizationSegment) {
    checkpoints[VerticalCheckpointReason.RepressurizationSegmentEnd] = { distanceFromStart: 200 };
  }
  const profile = {
    findVerticalCheckpoint: (reason: VerticalCheckpointReason) => checkpoints[reason],
    totalFlightPlanDistance: TOTAL_DISTANCE,
    distanceToPresentPosition: distanceFromStart,
  } as unknown as NavGeometryProfile;

  const relation = new AircraftToDescentProfileRelation({} as VerticalProfileComputationParametersObserver);
  relation.updateProfile(profile);
  return relation;
}

describe('aircraft position on the descent profile', () => {
  it('flies the repressurization segment like a geometric path, not at idle', () => {
    expect(relationAt(195).isOnGeometricPath()).toBe(true);
  });

  it('is on the idle path between the repressurization segment and the geometric path', () => {
    expect(relationAt(250).isOnGeometricPath()).toBe(false);
    expect(relationAt(195, false).isOnGeometricPath()).toBe(false);
  });

  it('is on the geometric path after its start, and not before the T/D', () => {
    expect(relationAt(285).isOnGeometricPath()).toBe(true);
    expect(relationAt(150).isOnGeometricPath()).toBe(false);
  });
});
