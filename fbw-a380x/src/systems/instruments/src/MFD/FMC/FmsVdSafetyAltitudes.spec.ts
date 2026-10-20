// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Airport } from '@flybywiresim/fbw-sdk';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { msaAirports, vdCutPlanElements } from './FmsVdSafetyAltitudes';

const origin = { ident: 'EGLL', location: { lat: 51.5, long: -0.5 } } as Airport;
const destination = { ident: 'LSZH', location: { lat: 47.5, long: 8.5 } } as Airport;

const plan = (p: object) =>
  ({
    originAirport: origin,
    destinationAirport: destination,
    originDeparture: undefined,
    arrival: undefined,
    approachVia: undefined,
    approach: undefined,
    ...p,
  }) as unknown as ReadonlyFlightPlan;

describe('MSA in use', () => {
  it('none without a selected procedure: grid MORA only', () => {
    expect(msaAirports(plan({}))).toEqual([]);
  });

  it('the departure airport once a SID is selected', () => {
    expect(msaAirports(plan({ originDeparture: {} }))).toEqual([origin]);
  });

  it('the arrival airport once an arrival, approach transition or approach is selected', () => {
    expect(msaAirports(plan({ approach: {} }))).toEqual([destination]);
    expect(msaAirports(plan({ approachVia: {} }))).toEqual([destination]);
    expect(msaAirports(plan({ arrival: {} }))).toEqual([destination]);
    expect(msaAirports(plan({ originDeparture: {}, approach: {} }))).toEqual([origin, destination]);
  });
});

describe('VD cut from the active flight plan', () => {
  it('the legs from the TO leg to the destination at their distance from the aircraft, discontinuities kept', () => {
    const leg = (lat: number, toEnd: number | undefined) => ({
      isDiscontinuity: false,
      terminationWaypoint: () => ({ location: { lat, long: 0 } }),
      calculated: toEnd !== undefined ? { cumulativeDistanceToEndWithTransitions: toEnd } : undefined,
    });
    const elements = [
      leg(50, 300),
      leg(51, 250),
      { isDiscontinuity: true },
      leg(52, undefined),
      leg(53, 0),
      leg(54, 0),
    ];
    const p = {
      activeLegIndex: 1,
      firstMissedApproachLegIndex: 5,
      maybeElementAt: (i: number) => elements[i],
    } as unknown as ReadonlyFlightPlan;
    expect(vdCutPlanElements(p, 280)).toEqual([
      { isDiscontinuity: false, location: { lat: 51, long: 0 }, distanceFromAircraftNm: 30 },
      { isDiscontinuity: true },
      { isDiscontinuity: false, location: { lat: 52, long: 0 }, distanceFromAircraftNm: null },
      { isDiscontinuity: false, location: { lat: 53, long: 0 }, distanceFromAircraftNm: 280 },
    ]);
  });
});
