// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LandingConf } from '@flybywiresim/fbw-sdk';
import { TakeoffComputation, TakeoffResultThrust } from './TakeoffPerformance';
import { LandingComputation } from './LandingPerformance';
import {
  computeMultipleRunways,
  landingRunwayItems,
  multipleRunwayWindError,
  takeoffRunwayItems,
} from './MultipleRunwayResults';
import { PerformanceRunway } from './PerformanceRunways';

const TOW = 500_000;

/**
 * @param mtowPerf the MTOW(perf), null without one
 * @param thrust the thrust of the results
 * @param speeds whether the TOW permits the takeoff (the speeds exist)
 * @returns a T.O PERF computation at the TOW
 */
function takeoff(
  mtowPerf: number | null,
  thrust: TakeoffResultThrust = { kind: 'TOGA' },
  speeds = true,
): TakeoffComputation {
  return {
    results: {
      runway: '',
      tow: TOW,
      mtowPerf,
      v1: speeds ? 150 : null,
      vr: speeds ? 160 : null,
      v2: speeds ? 170 : null,
      flaps: 2,
      thrust,
      stopMargin: null,
      takeoffShift: 0,
      engineOutAcceleration: 1500,
      reverseThrustCredit: false,
      qnh: 1013,
    },
    errors: [],
  };
}

const failed: TakeoffComputation = { results: null, errors: ['Runway length outside the performance database'] };

const labels = (items: { label: string; colour: string }[]) => items.map((i) => `${i.label} ${i.colour}`);

describe('MULTIPLE RWY COMPUTATION', () => {
  it('needs a direction/speed wind', () => {
    expect(multipleRunwayWindError({ kind: 'longitudinal', headwind: 10 })).not.toBeNull();
    expect(multipleRunwayWindError({ kind: 'direction', direction: 80, speed: 15, gust: null })).toBeNull();
    expect(multipleRunwayWindError(null)).toBeNull();
  });

  it('lists the MTOW(perf) of each runway with TOGA, sorted by weight, red below the TOW', () => {
    const items = takeoffRunwayItems(
      [
        { ident: '33L', computation: takeoff(480_000, { kind: 'TOGA' }, false) },
        { ident: '06', computation: takeoff(560_000) },
        { ident: '15R', computation: failed },
        { ident: '07', computation: takeoff(520_000) },
      ],
      { kind: 'TOGA' },
      true,
    );
    expect(labels(items)).toEqual(['06(560.0) green', '07(520.0) green', '33L(480.0) red', '15R(---) red']);
  });

  it('lists TFLEX with FLEX, sorted by temperature then weight; TOGA amber when the TOW is permitted', () => {
    const items = takeoffRunwayItems(
      [
        { ident: '15R', computation: takeoff(510_000) },
        { ident: '07', computation: takeoff(530_000, { kind: 'FLEX', temperature: 44 }) },
        { ident: '33L', computation: takeoff(480_000, { kind: 'TOGA' }, false) },
        { ident: '06', computation: takeoff(560_000, { kind: 'FLEX', temperature: 68 }) },
      ],
      { kind: 'FLEX' },
      false,
    );
    expect(labels(items)).toEqual(['06(68C) green', '07(44C) green', '15R(TOGA) amber', '33L(TOGA) red']);
  });

  it('lists the thrust kind with OPTIMUM DERATE', () => {
    const items = takeoffRunwayItems(
      [
        { ident: '33L', computation: failed },
        { ident: '07', computation: takeoff(530_000, { kind: 'DERATE', level: 4 }) },
        { ident: '06', computation: takeoff(560_000, { kind: 'FLEX', temperature: 50 }) },
      ],
      { kind: 'OPTIMUM DERATE' },
      true,
    );
    expect(labels(items)).toEqual(['06(FLEX) green', '07(D04) amber', '33L(---) red']);
  });

  it('computes the ticked runways of the airport and shows the first one of the RWY list', () => {
    const runway = (ident: string, length: number): PerformanceRunway => ({
      ident,
      magneticBearing: 0,
      takeoffLength: length,
      landingLength: length,
      elevation: 0,
      slope: 0,
    });
    const airport = [runway('06', 3000), runway('24', 3000), runway('15', 2000)];
    const compute = (rwy: PerformanceRunway) => takeoff(rwy.takeoffLength * 180);
    const sort = (runs: Parameters<typeof takeoffRunwayItems>[0]) => takeoffRunwayItems(runs, { kind: 'TOGA' }, true);
    const wind = { kind: 'direction' as const, direction: 60, speed: 10, gust: null };

    const both = computeMultipleRunways(airport, ['15', '24'], wind, compute, sort);
    expect(both.runs?.map((r) => r.ident)).toEqual(['24', '15']);
    expect(both.shown.results?.mtowPerf).toBe(540_000);

    expect(computeMultipleRunways(airport, ['06'], { kind: 'longitudinal', headwind: 5 }, compute, sort)).toEqual({
      shown: { results: null, errors: ['WIND: enter a direction/speed for a MULTIPLE RWY COMPUTATION'] },
      runs: null,
    });
    // Ticks of runways the airport does not have compute nothing
    expect(computeMultipleRunways(airport, ['27L'], wind, compute, sort)).toEqual({
      shown: { results: null, errors: ['Missing parameter RWY'] },
      runs: null,
    });
  });

  it('lists the MLW(perf) of each runway in LDG PERF, red below the LW', () => {
    const landing = (mlwPerf: number | null): LandingComputation => ({
      results: {
        runway: '',
        lw: 390_000,
        mlwPerf,
        limitation: null,
        flaps: LandingConf.Full,
        goAroundConf: null,
        landingDistance: 2000,
        actualLandingDistance: 1500,
        runwayLength: 3000,
        stopMargin: 1000,
        goAroundSpeed: 150,
        goAroundGradient: 2.5,
        speedIncrement: 5,
        vapp: 140,
        overweight: false,
        reverseThrustCredit: false,
      },
      errors: [],
    });
    const items = landingRunwayItems(
      [
        { ident: '24', computation: landing(380_000) },
        { ident: '06', computation: landing(420_000) },
        { ident: '15', computation: { results: null, errors: ['x'] } },
      ],
      true,
    );
    expect(labels(items)).toEqual(['06(420.0) green', '24(380.0) red', '15(---) red']);
  });
});
