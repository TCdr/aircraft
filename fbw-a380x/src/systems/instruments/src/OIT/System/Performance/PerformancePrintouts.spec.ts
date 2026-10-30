// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LandingConf, LandingGoAroundConf, LandingLimitation } from '@flybywiresim/fbw-sdk';
import { TakeoffResults } from './TakeoffPerformance';
import { LandingResults } from './LandingPerformance';
import { PerformancePrintoutContent, landingPerfPrintout, takeoffPerfPrintout } from './PerformancePrintouts';

const TAKEOFF: TakeoffResults = {
  runway: '14',
  tow: 500_000,
  mtowPerf: 540_000,
  v1: 149,
  vr: 162,
  v2: 170,
  flaps: 1,
  thrust: { kind: 'FLEX', temperature: 45 },
  stopMargin: 702,
  takeoffShift: 0,
  engineOutAcceleration: 2000,
  reverseThrustCredit: false,
  qnh: 1013,
};

/**
 * @param results the results of the page
 * @param extra the parts of the page that differ from the default page
 * @returns the printout content
 */
function content<R>(results: R, extra: Partial<PerformancePrintoutContent<R>> = {}): PerformancePrintoutContent<R> {
  return {
    flightNumber: 'FBW123',
    airport: 'LFBO',
    conditions: [
      ['WIND', '(180/10)HD10'],
      ['OAT', '15 °C'],
    ],
    aircraftStatus: ['NO PERFORMANCE IMPACT'],
    notInComputation: [],
    results,
    errors: [],
    runwayList: [],
    metric: true,
    ...extra,
  };
}

describe('Performance printouts', () => {
  it('prints T.O PERF under its title: the conditions, the aircraft status and the results', () => {
    const printout = takeoffPerfPrintout(content(TAKEOFF));
    expect(printout.title).toBe('T.O PERF');
    const lines = printout.text.split('\n');
    expect(lines).toContain('FLT             FBW123');
    expect(lines).toContain('WIND            (180/10)HD10');
    expect(lines).toContain('NO PERFORMANCE IMPACT');
    expect(lines).toContain('TOW             500.0 T');
    expect(lines).toContain('MTOW(PERF)      540.0 T');
    expect(lines).toContain('THRUST          FLEX 45');
    expect(lines).toContain('V1              149 KT');
    expect(lines).toContain('FLAPS           1+F');
    expect(lines).toContain('STOP MARGIN     702 m');
    expect(lines).toContain('NO REVERSE THRUST CREDIT');
    expect(lines[lines.length - 1]).toBe('END');
  });

  it('prints the items not in the computation, the RWY list and the errors', () => {
    const text = takeoffPerfPrintout(
      content(
        { ...TAKEOFF, v1: null, vr: null, v2: null },
        {
          notInComputation: ['21-51-01 PACK 1 INOP'],
          runwayList: ['14(540.0)', '32(498.0)'],
          errors: ['TOW above MTOW(perf)'],
          metric: false,
        },
      ),
    ).text;
    expect(text).toContain('NOT IN COMPUTATION - APPLY THE PENALTIES BY HAND:\n  21-51-01 PACK 1 INOP');
    expect(text).toContain('MULTIPLE RWY COMPUTATION: 14(540.0) 32(498.0)');
    expect(text).toContain('V1              ---');
    expect(text).toContain('TOW             1102.3 klbs');
    expect(text).toContain('*** TOW above MTOW(perf)');
  });

  it('prints LDG PERF under its title', () => {
    const landing: LandingResults = {
      runway: '27R',
      lw: 400_000,
      mlwPerf: 420_000,
      limitation: LandingLimitation.Lda,
      flaps: LandingConf.Conf3,
      goAroundConf: LandingGoAroundConf.Conf2,
      landingDistance: 2100,
      actualLandingDistance: 1600,
      runwayLength: 3900,
      stopMargin: 1800,
      goAroundSpeed: 155,
      goAroundGradient: 2.4,
      speedIncrement: 5,
      vapp: 145,
      overweight: true,
      reverseThrustCredit: true,
    };
    const printout = landingPerfPrintout(content(landing));
    expect(printout.title).toBe('LDG PERF');
    const lines = printout.text.split('\n');
    expect(lines).toContain('OVERWEIGHT LANDING');
    expect(lines).toContain('FLAPS           3');
    expect(lines).toContain('VAPP            VLS+5 KT (145 KT)');
    expect(lines).toContain('GA CONF         2');
    expect(lines).toContain('GA GRADIENT     2.400 %');
    expect(lines).toContain('RWY LENGTH      3900 m');
    expect(lines).toContain('REVERSE THRUST CREDIT');
  });
});

/*
 * STORE keeps the text PRINT sends to the printer. These are the printouts as they were before the pages split their
 * print into a printout and its publication: the text of a stored document and of a print must not change.
 */
describe('Performance printouts, complete text', () => {
  it('T.O PERF', () => {
    expect(takeoffPerfPrintout(content(TAKEOFF)).text).toBe(
      [
        'FLT             FBW123',
        'AIRPORT         LFBO',
        '',
        'CONDITIONS',
        'WIND            (180/10)HD10',
        'OAT             15 °C',
        '',
        'AIRCRAFT STATUS',
        'NO PERFORMANCE IMPACT',
        '',
        'RESULTS',
        'RWY             14',
        'TOW             500.0 T',
        'MTOW(PERF)      540.0 T',
        'THRUST          FLEX 45',
        'V1              149 KT',
        'VR              162 KT',
        'V2              170 KT',
        'FLAPS           1+F',
        'STOP MARGIN     702 m',
        'T.O SHIFT       0 m',
        'EO ACCEL        2000 FT',
        'NO REVERSE THRUST CREDIT',
        '',
        'END',
      ].join('\n'),
    );
  });

  it('LDG PERF', () => {
    const landing: LandingResults = {
      runway: '27R',
      lw: 400_000,
      mlwPerf: 420_000,
      limitation: LandingLimitation.Lda,
      flaps: LandingConf.Conf3,
      goAroundConf: LandingGoAroundConf.Conf2,
      landingDistance: 2100,
      actualLandingDistance: 1600,
      runwayLength: 3900,
      stopMargin: 1800,
      goAroundSpeed: 155,
      goAroundGradient: 2.4,
      speedIncrement: 5,
      vapp: 145,
      overweight: true,
      reverseThrustCredit: true,
    };
    expect(landingPerfPrintout(content(landing)).text).toBe(
      [
        'FLT             FBW123',
        'AIRPORT         LFBO',
        '',
        'CONDITIONS',
        'WIND            (180/10)HD10',
        'OAT             15 °C',
        '',
        'AIRCRAFT STATUS',
        'NO PERFORMANCE IMPACT',
        '',
        'RESULTS',
        'RWY             27R',
        'OVERWEIGHT LANDING',
        'LW              400.0 T',
        'MLW(PERF)       420.0 T',
        'LIMITATION CODE LDA',
        'FLAPS           3',
        'VAPP            VLS+5 KT (145 KT)',
        'LDG DIST        2100 m',
        'STOP MARGIN     1800 m',
        'GA SPEED        155 KT',
        'GA CONF         2',
        'GA GRADIENT     2.400 %',
        'ACTUAL LDG DIST 1600 m',
        'RWY LENGTH      3900 m',
        'REVERSE THRUST CREDIT',
        '',
        'END',
      ].join('\n'),
    );
  });
});
