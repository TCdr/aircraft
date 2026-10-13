// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Coordinates } from 'msfs-geo';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { defaultRadialInTrueCourse, parseDirectToRadial } from './DirectToRadial';

function errorOf(entry: string): FmsErrorType | undefined {
  try {
    parseDirectToRadial(entry);
  } catch (e) {
    return e instanceof FmsError ? e.type : undefined;
  }
  return undefined;
}

/** A flight plan leg ending at a fix (the only parts of a leg the default radial uses) */
function leg(ident: string, location: Coordinates): ReadonlyFlightPlanElement {
  return {
    isDiscontinuity: false,
    ident,
    isXF: () => true,
    terminationWaypoint: () => ({ ident, location }),
  } as unknown as ReadonlyFlightPlanElement;
}

/** WEST (0/-1) -> TGT (0/0) -> NORTH (1/0): the leg to TGT is eastbound, the leg after it northbound */
function testPlan(withDiscontinuityBeforeTarget: boolean) {
  const allLegs: ReadonlyFlightPlanElement[] = [
    leg('WEST', { lat: 0, long: -1 }),
    ...(withDiscontinuityBeforeTarget ? [{ isDiscontinuity: true } as ReadonlyFlightPlanElement] : []),
    leg('TGT', { lat: 0, long: 0 }),
    leg('NORTH', { lat: 1, long: 0 }),
  ];
  return { fp: { allLegs }, targetIndex: withDiscontinuityBeforeTarget ? 2 : 1 };
}

describe('MCDU DIR TO RADIAL IN / RADIAL OUT (A320 FCOM l.18352-18360, l.23686-23688, l.14600-14605)', () => {
  it('accepts 1 to 3 digits from 000 to 360, magnetic unless T is entered', () => {
    expect(parseDirectToRadial('116')).toEqual({ course: 116, isTrue: false });
    expect(parseDirectToRadial('90')).toEqual({ course: 90, isTrue: false });
    expect(parseDirectToRadial('228T')).toEqual({ course: 228, isTrue: true });
    expect(parseDirectToRadial('228M')).toEqual({ course: 228, isTrue: false });
    expect(parseDirectToRadial('360')).toEqual({ course: 0, isTrue: false });
    expect(errorOf('361')).toBe(FmsErrorType.EntryOutOfRange);
    expect(errorOf('1160')).toBe(FmsErrorType.FormatError);
    expect(errorOf('ABC')).toBe(FmsErrorType.FormatError);
    expect(errorOf('/116')).toBe(FmsErrorType.FormatError);
  });

  it('proposes the flight plan track to the DIR TO waypoint as default radial in', () => {
    const { fp, targetIndex } = testPlan(false);
    expect(defaultRadialInTrueCourse(fp.allLegs, targetIndex)).toBeCloseTo(90, 3);
  });

  it('proposes the flight plan track from the DIR TO waypoint when a discontinuity precedes it', () => {
    const { fp, targetIndex } = testPlan(true);
    const course = defaultRadialInTrueCourse(fp.allLegs, targetIndex);
    expect(course === null ? null : (course + 360) % 360).toBeCloseTo(0, 3);
  });

  it('has no default radial without a flight plan track (WEST is followed by a discontinuity)', () => {
    const { fp } = testPlan(true);
    expect(defaultRadialInTrueCourse(fp.allLegs, 0)).toBeNull();
  });
});
