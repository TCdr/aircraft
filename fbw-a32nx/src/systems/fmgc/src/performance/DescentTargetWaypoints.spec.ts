// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AltitudeDescriptor } from '@flybywiresim/fbw-sdk';
import {
  DescentTargetLeg,
  DescentTargetPlan,
  descentTargetConstraint,
  descentTargetWaypoints,
} from './DescentTargetWaypoints';

const leg = (
  ident: string,
  toEnd: number | undefined,
  constraint?: { altitudeDescriptor: AltitudeDescriptor; altitude1: number; altitude2?: number },
  fix = true,
): DescentTargetLeg => ({
  isDiscontinuity: false,
  ident,
  altitudeConstraint: constraint,
  calculated: toEnd !== undefined ? { cumulativeDistanceToEndWithTransitions: toEnd } : undefined,
  terminationWaypoint: () => (fix ? {} : null),
});

const plan = (
  activeLegIndex: number,
  missedApproach: number,
  legs: DescentTargetPlan['maybeElementAt'],
): DescentTargetPlan => ({
  activeLegIndex,
  firstMissedApproachLegIndex: missedApproach,
  maybeElementAt: legs,
});

describe('descent target waypoints', () => {
  const legs = [
    leg('ORIG', 300),
    leg('ALPHA', 200),
    { isDiscontinuity: true as const },
    leg('BRAVO', 120, { altitudeDescriptor: AltitudeDescriptor.AtOrBelowAlt1, altitude1: 24000 }),
    leg('VECTOR', 100, undefined, false),
    leg('CHARLIE', 40, { altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2, altitude1: 11000, altitude2: 9000 }),
    leg('FAF', 5, { altitudeDescriptor: AltitudeDescriptor.AtAlt1GsMslAlt2, altitude1: 3000, altitude2: 3000 }),
    leg('RW27', 0),
    leg('MISSED', undefined),
  ];
  const elementAt = (i: number) => legs[i];

  it('lists the waypoints from the active leg up to the missed approach, with their distances from the aircraft', () => {
    const list = descentTargetWaypoints(plan(1, 8, elementAt), 230);
    expect(list.map((w) => w.ident)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'FAF', 'RW27']);
    expect(list.map((w) => w.distance)).toEqual([30, 110, 190, 225, 230]);
  });

  it('has no distances without the distance to the destination', () => {
    expect(descentTargetWaypoints(plan(1, 8, elementAt), null).every((w) => w.distance === null)).toBe(true);
  });

  it('reads the altitude constraints as descent targets', () => {
    const list = descentTargetWaypoints(plan(1, 8, elementAt), 230);
    expect(list[1].constraint).toEqual({ type: 'atOrBelow', altitude1: 24000 });
    expect(list[2].constraint).toEqual({ type: 'between', altitude1: 11000, altitude2: 9000 });
    expect(list[3].constraint).toEqual({ type: 'at', altitude1: 3000 });
    expect(list[0].constraint).toBeNull();
  });

  it('ignores the climb constraints of the SIDs', () => {
    expect(
      descentTargetConstraint({ altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt2, altitude1: 0, altitude2: 3000 }),
    ).toBeNull();
  });
});
