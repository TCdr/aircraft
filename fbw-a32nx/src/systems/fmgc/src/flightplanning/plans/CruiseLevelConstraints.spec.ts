// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AltitudeConstraint, AltitudeDescriptor, WaypointConstraintType } from '@flybywiresim/fbw-sdk';
import { ConstraintLegLike } from '@fmgc/components/fms-messages/FmsMessageConditions';
import { CruiseLevelConstraintPlan, deleteConstraintsAboveCruiseLevel } from './CruiseLevelConstraints';

/** A flight plan that records the constraint changes */
function fakePlan(legs: ConstraintLegLike[], activeLegIndex: number, firstMissedApproachLegIndex = legs.length) {
  const calls: { index: number; isDescent: boolean; constraint?: AltitudeConstraint }[] = [];
  const plan: CruiseLevelConstraintPlan = {
    allLegs: legs,
    activeLegIndex,
    firstMissedApproachLegIndex,
    setPilotEnteredAltitudeConstraintAt(index, isDescent, constraint) {
      calls.push({ index, isDescent, constraint });
    },
  };
  return { plan, calls };
}

const leg = (constraint: AltitudeConstraint, type: WaypointConstraintType): ConstraintLegLike => ({
  isDiscontinuity: false,
  altitudeConstraint: constraint,
  constraintType: type,
});

describe('CSTR DEL ABOVE CRZ FL / CONSTRAINTS ABOVE CRZ FL: DELETED (A320 FCOM l.15144-15162, A380 FCOM l.27100-27104)', () => {
  it('deletes the climb and descent constraints at or above the new CRZ FL on the legs not flown yet', () => {
    const { plan, calls } = fakePlan(
      [
        leg({ altitudeDescriptor: AltitudeDescriptor.AtAlt1, altitude1: 30_000 }, WaypointConstraintType.CLB),
        leg({ altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt1, altitude1: 25_000 }, WaypointConstraintType.CLB),
        leg({ altitudeDescriptor: AltitudeDescriptor.AtOrBelowAlt1, altitude1: 26_000 }, WaypointConstraintType.DES),
        leg({ altitudeDescriptor: AltitudeDescriptor.AtAlt1, altitude1: 4_000 }, WaypointConstraintType.DES),
      ],
      1,
    );
    expect(deleteConstraintsAboveCruiseLevel(plan, 240)).toBe(2);
    expect(calls).toEqual([
      { index: 1, isDescent: false, constraint: undefined },
      { index: 2, isDescent: true, constraint: undefined },
    ]);
  });

  it('keeps the lower limit of a window across the CRZ FL as an AT OR ABOVE constraint', () => {
    const { plan, calls } = fakePlan(
      [
        leg(
          { altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2, altitude1: 26_000, altitude2: 20_000 },
          WaypointConstraintType.CLB,
        ),
      ],
      0,
    );
    expect(deleteConstraintsAboveCruiseLevel(plan, 240)).toBe(1);
    expect(calls).toEqual([
      {
        index: 0,
        isDescent: false,
        constraint: { altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt1, altitude1: 20_000 },
      },
    ]);
  });

  it('changes nothing when every constraint is below the CRZ FL, nor in the missed approach', () => {
    const { plan, calls } = fakePlan(
      [
        leg({ altitudeDescriptor: AltitudeDescriptor.AtAlt1, altitude1: 10_000 }, WaypointConstraintType.CLB),
        leg({ altitudeDescriptor: AltitudeDescriptor.AtAlt1, altitude1: 30_000 }, WaypointConstraintType.CLB),
      ],
      0,
      1,
    );
    expect(deleteConstraintsAboveCruiseLevel(plan, 240)).toBe(0);
    expect(calls).toEqual([]);
  });
});
