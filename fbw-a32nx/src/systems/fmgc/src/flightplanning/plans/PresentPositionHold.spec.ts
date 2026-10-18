// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import { LegType, TurnDirection } from '@flybywiresim/fbw-sdk';
import { emptyFlightPlan } from '../test/FlightPlan';
import { WaypointFactory } from '@fmgc/flightplanning/waypoints/WaypointFactory';
import { FlightPlanLeg, isDiscontinuity } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { GeometryFactory } from '@fmgc/guidance/geometry/GeometryFactory';
import { HoldType } from '@fmgc/flightplanning/data/flightplan';
import { presentPositionComputedHold } from './PresentPositionHold';

/** A flight plan along the equator, the aircraft between ALPHA and BRAVO, flying east */
function testPlan() {
  const fp = emptyFlightPlan();
  const fixes = ['ALPHA', 'BRAVO', 'CHARL'].map((ident, i) => WaypointFactory.fromLocation(ident, { lat: 0, long: i }));
  fp.enrouteSegment.allLegs.push(
    ...fixes.map((fix, i) =>
      FlightPlanLeg.fromEnrouteFix(fp.enrouteSegment, fix, '', i === 0 ? LegType.IF : LegType.TF),
    ),
  );
  (fp as any).syncSegmentLegsChange(fp.enrouteSegment);
  fp.incrementVersion();
  const index = (ident: string) => fp.allLegs.findIndex((it) => !isDiscontinuity(it) && it.ident === ident);
  (fp as any).setActiveLegIndex(index('BRAVO'));
  return { fp, index };
}

const ppos = { lat: 0, long: 0.5 };
const legs = (fp: ReturnType<typeof emptyFlightPlan>) =>
  fp.allLegs.map((it) => (isDiscontinuity(it) ? 'DISCO' : `${it.ident}/${LegType[it.type]}`));

describe('HOLD at the present position', () => {
  beforeAll(() => {
    // The guidance geometry uses these sim helpers, not in the common test mock
    const utils = Avionics.Utils as any;
    utils.clampAngle ??= (angle: number) => ((angle % 360) + 360) % 360;
    utils.diffAngle ??= (a: number, b: number) => {
      const diff = (((b - a) % 360) + 540) % 360;
      return diff - 180;
    };
  });

  it('computes the default hold on the aircraft track: right turns, 1 min below FL140, 1.5 min above', () => {
    expect(presentPositionComputedHold(87.6, 9_000)).toEqual({
      inboundMagneticCourse: 88,
      turnDirection: TurnDirection.Right,
      time: 1,
      type: HoldType.Computed,
    });
    expect(presentPositionComputedHold(359.7, 20_000).inboundMagneticCourse).toBe(0);
    expect(presentPositionComputedHold(359.7, 20_000).time).toBe(1.5);
  });

  it('inserts a manual hold at a PPOS waypoint before the TO waypoint, and makes it the active leg', () => {
    const { fp } = testPlan();
    const hold = presentPositionComputedHold(90, 10_000);
    const holdIndex = fp.holdAtPresentPosition(ppos, 90, hold, hold);

    expect(legs(fp)).toEqual(['T-P/CF', 'T-P/HM', 'BRAVO/TF', 'CHARL/TF']);
    expect(holdIndex).toBe(1);
    expect(fp.activeLegIndex).toBe(1);

    const holdLeg = fp.allLegs[1] as FlightPlanLeg;
    const holdFix = holdLeg.terminationWaypoint();
    expect(holdFix.location.lat).toBeCloseTo(ppos.lat, 6);
    expect(holdFix.location.long).toBeCloseTo(ppos.long, 6);
    expect(holdLeg.definition.course).toBe(90);
    expect(holdLeg.definition.turnDirection).toBe(TurnDirection.Right);
    expect(holdLeg.definition.lengthTime).toBe(1);
    expect(holdLeg.defaultHold).toEqual(hold);
  });

  it('gives a flyable path: hold, then the TO waypoint', () => {
    const { fp } = testPlan();
    const hold = presentPositionComputedHold(90, 10_000);
    fp.holdAtPresentPosition(ppos, 90, hold, hold);

    const geometry = GeometryFactory.createFromFlightPlan(fp);
    geometry.recomputeWithParameters(250, 250, ppos, 90, fp, fp.activeLegIndex, -1);
    for (const [, leg] of geometry.legs) {
      const end = leg.getPathEndPoint();
      expect(Number.isFinite(end.lat) && Number.isFinite(end.long)).toBe(true);
    }
  });
});
