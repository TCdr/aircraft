// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import { LegType } from '@flybywiresim/fbw-sdk';
import { emptyFlightPlan } from '../test/FlightPlan';
import { WaypointFactory } from '@fmgc/flightplanning/waypoints/WaypointFactory';
import { FlightPlanLeg, FlightPlanLegFlags, isDiscontinuity } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { abeamPointOnLeg, abeamWaypointIdent } from './DirectTo';
import { GeometryFactory } from '@fmgc/guidance/geometry/GeometryFactory';

/** A flight plan along the equator from the aircraft at 0/0: waypoints left and right of the direct leg to TGT */
function testPlan() {
  const fp = emptyFlightPlan();
  const fixes = [
    WaypointFactory.fromLocation('ALPHA', { lat: 0.5, long: 1 }),
    WaypointFactory.fromLocation('BRAVOX', { lat: -0.5, long: 2 }),
    WaypointFactory.fromLocation('CHARL', { lat: 0.3, long: 3 }),
    WaypointFactory.fromLocation('TGT', { lat: 0, long: 4 }),
    WaypointFactory.fromLocation('AFTER', { lat: 0, long: 5 }),
  ];
  fp.enrouteSegment.allLegs.push(
    ...fixes.map((fix, i) =>
      FlightPlanLeg.fromEnrouteFix(fp.enrouteSegment, fix, '', i === 0 ? LegType.IF : LegType.TF),
    ),
  );
  (fp as any).syncSegmentLegsChange(fp.enrouteSegment);
  fp.incrementVersion();
  const index = (ident: string) => fp.allLegs.findIndex((it) => !isDiscontinuity(it) && it.ident === ident);
  (fp as any).setActiveLegIndex(index('ALPHA'));
  return { fp, index };
}

const ppos = { lat: 0, long: 0 };
const legs = (fp: ReturnType<typeof emptyFlightPlan>) =>
  fp.allLegs.map((it) => (isDiscontinuity(it) ? 'DISCO' : `${it.ident}/${LegType[it.type]}`));

describe('DIR TO options (A380 FCOM DSC-22-FMS, DIR TO revision)', () => {
  beforeAll(() => {
    // The guidance geometry uses these sim helpers, not in the common test mock
    const utils = (globalThis as any).Avionics.Utils;
    utils.clampAngle ??= (angle: number) => ((angle % 360) + 360) % 360;
    utils.diffAngle ??= (a: number, b: number) => {
      const diff = (((b - a) % 360) + 540) % 360;
      return diff - 180;
    };
  });

  it('projects a waypoint on the direct leg', () => {
    const abeam = abeamPointOnLeg({ lat: 0, long: 0 }, { lat: 0, long: 10 }, { lat: 1, long: 5 });
    expect(abeam).not.toBeNull();
    expect(abeam.location.lat).toBeCloseTo(0, 3);
    expect(abeam.location.long).toBeCloseTo(5, 3);
    expect(abeam.distanceFromStart).toBeCloseTo(300, -1);
    // Behind the aircraft, or beyond the target: no abeam point
    expect(abeamPointOnLeg({ lat: 0, long: 0 }, { lat: 0, long: 10 }, { lat: 1, long: -1 })).toBeNull();
    expect(abeamPointOnLeg({ lat: 0, long: 0 }, { lat: 0, long: 10 }, { lat: 1, long: 11 })).toBeNull();
  });

  it('names abeam waypoints AB and five characters of the reference fix', () => {
    expect(abeamWaypointIdent('BRAVOX')).toBe('ABBRAVO');
    expect(abeamWaypointIdent('PG082')).toBe('ABPG082');
  });

  it('DIRECT goes to the target from the turning point', async () => {
    const { fp, index } = testPlan();
    fp.directToLeg(ppos, 90, index('TGT'));
    expect(legs(fp)).toEqual(['T-P/CF', 'TGT/DF', 'AFTER/TF']);
    expect(fp.activeLeg).toBe(fp.allLegs[1]);
  });

  it('DIRECT WITH ABEAM replaces the waypoints up to the target by their abeam points', async () => {
    const { fp, index } = testPlan();
    fp.directToLeg(ppos, 90, index('TGT'), true);
    expect(legs(fp)).toEqual(['T-P/CF', 'ABALPHA/DF', 'ABBRAVO/TF', 'ABCHARL/TF', 'TGT/TF', 'AFTER/TF']);
    expect(fp.activeLeg).toBe(fp.allLegs[1]);
    const abeam = fp.allLegs[2] as FlightPlanLeg;
    expect(abeam.terminationWaypoint().location.lat).toBeCloseTo(0, 3);
    expect(abeam.terminationWaypoint().location.long).toBeCloseTo(2, 3);
    // Not a temporary flight plan: no pending ABEAM PTS
    expect(abeam.flags & FlightPlanLegFlags.PendingDirectToAbeamPoint).toBe(0);
  });

  it('CRS IN flies the current track up to the intercept point, then the inbound course', () => {
    const { fp, index } = testPlan();
    // Track 045 from 0/0 to meet the inbound course 180 of TGT (0N 4E): the intercept is north of TGT
    fp.directToLeg(ppos, 45, index('TGT'), false, { course: 180, isTrue: true, inbound: true });
    expect(legs(fp)).toEqual(['T-P/CF', 'INTCPT/DF', 'TGT/TF', 'AFTER/TF']);
    const intercept = (fp.allLegs[1] as FlightPlanLeg).terminationWaypoint().location;
    expect(intercept.lat).toBeCloseTo(4, 0);
    expect(intercept.long).toBeCloseTo(4, 1);
    expect(fp.activeLeg).toBe(fp.allLegs[1]);
  });

  it('CRS IN more than 160 degrees from the track has no intercept point', () => {
    const { fp, index } = testPlan();
    fp.directToLeg(ppos, 0, index('TGT'), false, { course: 180, isTrue: true, inbound: true });
    expect(legs(fp)).toEqual(['T-P/CF', 'TGT/CF', 'AFTER/TF']);
    expect((fp.allLegs[1] as FlightPlanLeg).definition.course).toBe(180);
  });

  it('CRS IN geometry: no gap between the track, the intercept point and the inbound course', () => {
    const fp = emptyFlightPlan();
    const fixes = [
      WaypointFactory.fromLocation('START', { lat: -0.1, long: 0 }),
      WaypointFactory.fromLocation('NORTH', { lat: 1, long: 4 }),
      WaypointFactory.fromLocation('AFTER', { lat: 1, long: 5 }),
    ];
    fp.enrouteSegment.allLegs.push(...fixes.map((fix) => FlightPlanLeg.fromEnrouteFix(fp.enrouteSegment, fix, '')));
    (fp as any).syncSegmentLegsChange(fp.enrouteSegment);
    fp.incrementVersion();
    (fp as any).setActiveLegIndex(1);

    // Flying north from 0/0, CRS IN 090 true to NORTH (1N 4E): the intercept is about 1N 0E
    fp.directToLeg(ppos, 0, 1, false, { course: 90, isTrue: true, inbound: true });
    const intercept = (fp.allLegs[1] as FlightPlanLeg).terminationWaypoint().location;
    expect(intercept.lat).toBeCloseTo(1, 1);
    expect(intercept.long).toBeCloseTo(0, 3);

    const geometry = GeometryFactory.createFromFlightPlan(fp);
    geometry.recomputeWithParameters(250, 250, ppos, 0, fp, fp.activeLegIndex, -1);
    for (const [, leg] of geometry.legs) {
      const end = leg.getPathEndPoint();
      expect(Number.isFinite(end.lat) && Number.isFinite(end.long)).toBe(true);
    }
  });

  it('CRS OUT flies to the intercept point, then a MANUAL leg on the outbound course, then a discontinuity', () => {
    const { fp, index } = testPlan();
    fp.directToLeg(ppos, 45, index('TGT'), false, { course: 0, isTrue: true, inbound: false });
    expect(legs(fp)).toEqual(['T-P/CF', 'INTCPT/DF', 'MANUAL/FM', 'DISCO', 'AFTER/IF']);
    const manual = fp.allLegs[2] as FlightPlanLeg;
    expect(manual.terminationWaypoint().ident).toBe('INTCPT');
    expect(manual.definition.course).toBe(0);
  });

  it('CRS OUT parallel to the track has no intercept point', () => {
    const { fp, index } = testPlan();
    fp.directToLeg(ppos, 90, index('TGT'), false, { course: 90, isTrue: true, inbound: false });
    expect(legs(fp)).toEqual(['T-P/CF', 'MANUAL/FM', 'DISCO', 'AFTER/IF']);
  });

  it('DIRECT WITH ABEAM to a waypoint out of the flight plan replaces the waypoints abeam the direct leg', async () => {
    const { fp } = testPlan();
    const offPlan = WaypointFactory.fromLocation('OFFPL', { lat: 0, long: 2.5 });
    fp.directToWaypoint(ppos, 90, offPlan, true);
    expect(legs(fp)).toEqual([
      'T-P/CF',
      'ABALPHA/DF',
      'ABBRAVO/TF',
      'OFFPL/TF',
      'DISCO',
      'CHARL/IF',
      'TGT/TF',
      'AFTER/TF',
    ]);
  });
});
