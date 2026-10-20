// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import {
  geographicConstantMachSegment,
  isConstantMachRespected,
  isConstantMachSpeedChange,
  managedCruiseSpeedAndMach,
  splitCruiseAtConstantMachSegment,
} from './ConstantMachSpeedProfile';

const VMO = 350;

describe('the managed cruise target with a constant Mach segment', () => {
  const segment = { mach: 0.8, startLegIndex: 3, endLegIndex: 6 };

  it('is the ECON speed/Mach before the start waypoint is sequenced', () => {
    expect(managedCruiseSpeedAndMach(290, 0.78, segment, 3, VMO)).toEqual([290, 0.78]);
  });

  it('is the constant Mach (within VMO) from the start waypoint to the end waypoint', () => {
    expect(managedCruiseSpeedAndMach(290, 0.78, segment, 4, VMO)).toEqual([VMO, 0.8]);
    expect(managedCruiseSpeedAndMach(290, 0.78, segment, 6, VMO)).toEqual([VMO, 0.8]);
  });

  it('is the ECON speed/Mach again after the end waypoint', () => {
    expect(managedCruiseSpeedAndMach(290, 0.78, segment, 7, VMO)).toEqual([290, 0.78]);
  });

  it('is the ECON speed/Mach without a segment', () => {
    expect(managedCruiseSpeedAndMach(290, 0.78, null, 4, VMO)).toEqual([290, 0.78]);
  });

  it('keeps the constant Mach over the RTA speed/Mach of a time constraint', () => {
    // RTA speed/Mach (ECON with the RTA bias) of 310 kt / M.84
    expect(managedCruiseSpeedAndMach(310, 0.84, segment, 5, VMO)).toEqual([VMO, 0.8]);
    expect(managedCruiseSpeedAndMach(310, 0.84, segment, 7, VMO)).toEqual([310, 0.84]);
  });

  it('keeps the climb speed limit over the constant Mach and the ECON speed', () => {
    expect(managedCruiseSpeedAndMach(290, 0.78, segment, 5, VMO, 250)).toEqual([250, 0.8]);
    expect(managedCruiseSpeedAndMach(290, 0.78, segment, 7, VMO, 250)).toEqual([250, 0.78]);
    expect(managedCruiseSpeedAndMach(290, 0.78, segment, 5, VMO, null)).toEqual([VMO, 0.8]);
  });
});

describe('the cruise predictions with a constant Mach segment', () => {
  const segment = { startDistanceFromStart: 200, endDistanceFromStart: 500, mach: 0.82 };

  it('fly the constant Mach between the start and the end', () => {
    expect(splitCruiseAtConstantMachSegment(100, 900, segment)).toEqual([
      { endDistanceFromStart: 200, constantMach: null },
      { endDistanceFromStart: 500, constantMach: 0.82 },
      { endDistanceFromStart: 900, constantMach: null },
    ]);
  });

  it('fly the constant Mach from the present position inside the segment', () => {
    expect(splitCruiseAtConstantMachSegment(300, 400, segment)).toEqual([
      { endDistanceFromStart: 400, constantMach: 0.82 },
    ]);
  });

  it('fly ECON outside the segment', () => {
    expect(splitCruiseAtConstantMachSegment(500, 900, segment)).toEqual([
      { endDistanceFromStart: 900, constantMach: null },
    ]);
    expect(splitCruiseAtConstantMachSegment(0, 200, segment)).toEqual([
      { endDistanceFromStart: 200, constantMach: null },
    ]);
    expect(splitCruiseAtConstantMachSegment(0, 900, null)).toEqual([{ endDistanceFromStart: 900, constantMach: null }]);
  });

  it('fly the constant Mach to the top of descent without an end waypoint', () => {
    expect(splitCruiseAtConstantMachSegment(100, 900, { ...segment, endDistanceFromStart: Infinity })).toEqual([
      { endDistanceFromStart: 200, constantMach: null },
      { endDistanceFromStart: 900, constantMach: 0.82 },
    ]);
  });

  it('place the segment at the distances of its waypoints', () => {
    const legAt = (distance?: number) =>
      ({
        isDiscontinuity: false,
        calculated: distance !== undefined ? { cumulativeDistanceWithTransitions: distance } : undefined,
      }) as unknown as ReadonlyFlightPlanElement;
    const legs = [legAt(0), legAt(120), legAt(250), legAt(410), legAt()];

    expect(geographicConstantMachSegment(legs, { mach: 0.8, startLegIndex: 1, endLegIndex: 3 })).toEqual({
      startDistanceFromStart: 120,
      endDistanceFromStart: 410,
      mach: 0.8,
    });
    expect(geographicConstantMachSegment(legs, { mach: 0.8, startLegIndex: 2, endLegIndex: null })).toEqual({
      startDistanceFromStart: 250,
      endDistanceFromStart: Infinity,
      mach: 0.8,
    });
    expect(geographicConstantMachSegment(legs, { mach: 0.8, startLegIndex: 1, endLegIndex: 4 })).toBeNull();
  });
});

describe('the constant Mach segment indications', () => {
  it('show the segment as missed when the predicted Mach is not within 0.005 of it', () => {
    expect(isConstantMachRespected(0.8, 0.8)).toBe(true);
    expect(isConstantMachRespected(0.804, 0.8)).toBe(true);
    expect(isConstantMachRespected(0.79, 0.8)).toBe(false);
    expect(isConstantMachRespected(0.81, 0.8)).toBe(false);
  });

  it('show the segment as missed when a CAS is predicted, respected without predictions', () => {
    expect(isConstantMachRespected(280, 0.8)).toBe(false);
    expect(isConstantMachRespected(null, 0.8)).toBe(true);
    expect(isConstantMachRespected(undefined, 0.8)).toBe(true);
  });

  it('show a speed change where the managed Mach changes at the segment start or end', () => {
    const checkpoint = (reason: VerticalCheckpointReason, mach: number) => ({ reason, mach }) as VerticalCheckpoint;

    expect(
      isConstantMachSpeedChange(
        checkpoint(VerticalCheckpointReason.ConstantMachSegmentBoundary, 0.78),
        checkpoint(VerticalCheckpointReason.AtmosphericConditions, 0.82),
      ),
    ).toBe(true);
    expect(
      isConstantMachSpeedChange(
        checkpoint(VerticalCheckpointReason.ConstantMachSegmentBoundary, 0.82),
        checkpoint(VerticalCheckpointReason.AtmosphericConditions, 0.82),
      ),
    ).toBe(false);
    expect(
      isConstantMachSpeedChange(
        checkpoint(VerticalCheckpointReason.AtmosphericConditions, 0.78),
        checkpoint(VerticalCheckpointReason.AtmosphericConditions, 0.82),
      ),
    ).toBe(false);
  });
});
