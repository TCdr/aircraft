// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import { RunwayCondition, TakeoffAntiIceSetting, TakeoffPerformanceResult } from '@flybywiresim/fbw-sdk';
import { A380842TakeoffPerformanceCalculator } from '@shared/performance/a380x_takeoff';
import { PerformanceRunway } from './PerformanceRunways';
import {
  TakeoffConditions,
  computeTakeoffPerformance,
  missingTakeoffParameters,
  optimumDerateLevel,
  takeoffFlapsLabel,
  takeoffThrustLabel,
  takeoffThrustOptions,
} from './TakeoffPerformance';

const calculator = new A380842TakeoffPerformanceCalculator();

const RUNWAY: PerformanceRunway = {
  ident: '06',
  magneticBearing: 60,
  takeoffLength: 4000,
  landingLength: 4000,
  elevation: 0,
  slope: 0,
};

/** Dry, sea level, ISA, no wind, 450 t, OPT CONF, packs on, FLEX */
const CONDITIONS: TakeoffConditions = {
  wind: { kind: 'longitudinal', headwind: 0 },
  oat: 15,
  qnh: 1013.25,
  runwayCondition: 0,
  antiIce: 0,
  tow: 450_000,
  conf: 0,
  airCond: 0,
  thrust: { kind: 'FLEX' },
};

// The calculator result of CONDITIONS for a configuration (null: OPT CONF)
const calculatorResult = (conf: number | null, forceToga: boolean, tow = 450_000): TakeoffPerformanceResult => {
  const args = [
    4000,
    0,
    180,
    0,
    0,
    1013.25,
    15,
    TakeoffAntiIceSetting.Off,
    true,
    forceToga,
    RunwayCondition.Dry,
  ] as const;
  return conf === null
    ? calculator.calculateTakeoffPerformanceOptConf(tow, false, ...args)
    : calculator.calculateTakeoffPerformance(tow, false, conf, ...args);
};

describe('T.O PERF', () => {
  beforeAll(() => {
    // The VMCA and VMCG tables are interpolated with this sim helper, not in the common test mock
    const utils = (window as any).Avionics.Utils;
    utils.lerpAngle ??= (from: number, to: number, d: number) => {
      const delta = ((((to - from) % 360) + 540) % 360) - 180;
      return (((from + delta * d) % 360) + 360) % 360;
    };
  });

  it('lists the missing parameters in the order of the panel', () => {
    expect(
      missingTakeoffParameters(
        { ...CONDITIONS, wind: null, oat: null, qnh: null, runwayCondition: null, antiIce: null },
        null,
      ),
    ).toEqual(['WIND', 'OAT', 'QNH', 'RWY COND', 'A-ICE', 'RWY']);
    expect(computeTakeoffPerformance(calculator, { ...CONDITIONS, oat: null }, RUNWAY)).toEqual({
      results: null,
      errors: ['Missing parameter OAT'],
    });
  });

  it('gives the optimum configuration, the speeds and TFLEX of the calculator', () => {
    const expected = calculatorResult(null, false);
    const { results, errors } = computeTakeoffPerformance(calculator, CONDITIONS, RUNWAY);
    expect(errors).toEqual([]);
    expect(results).toMatchObject({
      runway: '06',
      tow: 450_000,
      mtowPerf: expected.mtow,
      v1: expected.v1,
      vr: expected.vR,
      v2: expected.v2,
      flaps: expected.inputs.conf,
      thrust: { kind: 'FLEX', temperature: expected.flex },
      engineOutAcceleration: 1500,
      reverseThrustCredit: false,
      qnh: 1013.25,
    });
    expect(results!.stopMargin).toBeGreaterThan(0);
  });

  it('computes a given configuration at TOGA', () => {
    const expected = calculatorResult(2, true);
    const { results } = computeTakeoffPerformance(
      calculator,
      { ...CONDITIONS, conf: 2, thrust: { kind: 'TOGA' } },
      RUNWAY,
    );
    expect(results).toMatchObject({
      flaps: 2,
      v1: expected.v1,
      vr: expected.vR,
      v2: expected.v2,
      thrust: { kind: 'TOGA' },
    });
  });

  it('gives the derate speeds and MTOW(perf) of a derate level the TOW permits', () => {
    const derate = calculatorResult(2, true).derates![0];
    const { results, errors } = computeTakeoffPerformance(
      calculator,
      { ...CONDITIONS, conf: 2, thrust: { kind: 'DERATE', level: derate.level } },
      RUNWAY,
    );
    expect(errors).toEqual([]);
    expect(results).toMatchObject({
      mtowPerf: derate.mtow,
      v1: derate.v1,
      vr: derate.vR,
      v2: derate.v2,
      thrust: { kind: 'DERATE', level: derate.level },
    });
  });

  it('refuses a derate level the TOW does not permit', () => {
    const heavy = calculatorResult(2, true, 500_000);
    expect(heavy.derates?.some((d) => d.level === 24)).toBe(false);
    const { results, errors } = computeTakeoffPerformance(
      calculator,
      { ...CONDITIONS, tow: 500_000, conf: 2, thrust: { kind: 'DERATE', level: 24 } },
      RUNWAY,
    );
    expect(errors).toEqual(['TOW above MTOW(perf) for D24']);
    expect(results?.v1).toBeNull();
  });

  it('shows MTOW(perf) without speeds when the TOW is above it', () => {
    // About 480 t on a 2000 m runway at sea level
    const shortRunway = { ...RUNWAY, takeoffLength: 2000 };
    const { results, errors } = computeTakeoffPerformance(calculator, { ...CONDITIONS, tow: 500_000 }, shortRunway);
    expect(errors).toEqual(['TOW above MTOW(perf)']);
    expect(results?.mtowPerf).toBeLessThan(500_000);
    expect(results?.v2).toBeNull();
  });

  it('shows the calculator errors and the crosswind limit', () => {
    expect(computeTakeoffPerformance(calculator, { ...CONDITIONS, runwayCondition: 1 }, RUNWAY).errors).toEqual([
      'RWY COND not available in the performance database',
    ]);
    expect(
      computeTakeoffPerformance(
        calculator,
        { ...CONDITIONS, wind: { kind: 'direction', direction: 150, speed: 35, gust: null } },
        RUNWAY,
      ).errors,
    ).toEqual(['Crosswind above the maximum demonstrated crosswind']);
  });

  it('picks the derate level with the highest MTOW(perf) for OPTIMUM DERATE, TOGA when equal', () => {
    const result = { mtow: 500_000, derates: [] } as unknown as TakeoffPerformanceResult;
    expect(optimumDerateLevel(result)).toBeNull();
    result.derates = [
      { level: 4, mtow: 500_000, v1: 0, vR: 0, v2: 0, estimates: [] },
      { level: 8, mtow: 505_000, v1: 0, vR: 0, v2: 0, estimates: [] },
      { level: 12, mtow: 505_000, v1: 0, vR: 0, v2: 0, estimates: [] },
    ];
    expect(optimumDerateLevel(result)).toBe(8);
  });

  it('labels the thrust options and results', () => {
    expect(takeoffThrustOptions([4, 24]).map((o) => o.label)).toEqual([
      'FLEX (STD)',
      'TOGA',
      'D04',
      'D24',
      'OPTIMUM DERATE',
    ]);
    expect(takeoffThrustLabel({ kind: 'FLEX', temperature: 45 })).toBe('FLEX 45');
    expect(takeoffThrustLabel({ kind: 'DERATE', level: 8 })).toBe('D08');
    expect(takeoffFlapsLabel(1)).toBe('1+F');
    expect(takeoffFlapsLabel(3)).toBe('3');
  });
});
