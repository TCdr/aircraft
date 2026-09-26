// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import {
  LineupAngle,
  RunwayCondition,
  TakeoffAntiIceSetting,
  TakeoffPerfomanceError,
  TakeoffPerformanceEstimate,
} from '@flybywiresim/fbw-sdk';
import { A380SpeedsUtils, ApproachConf, SpeedsLookupTables } from '@shared/OperatingSpeeds';
import { A380842TakeoffPerformanceCalculator } from './a380x_takeoff';

const FEET_PER_METRE = 3.28084;

const calculator = new A380842TakeoffPerformanceCalculator();

interface Inputs {
  tow: number;
  conf: number;
  tora: number;
  slope: number;
  lineupAngle: LineupAngle;
  wind: number;
  elevation: number;
  qnh: number;
  oat: number;
  forceToga: boolean;
  runwayCondition: RunwayCondition;
  cg: number | undefined;
}

/** Sea level, ISA, dry runway, no wind and no slope: the conditions of the Airbus charts */
const DEFAULTS: Inputs = {
  tow: 450_000,
  conf: 2,
  tora: 3000,
  slope: 0,
  lineupAngle: 0,
  wind: 0,
  elevation: 0,
  qnh: 1013.25,
  oat: 15,
  forceToga: false,
  runwayCondition: RunwayCondition.Dry,
  cg: 36,
};

const calculate = (overrides: Partial<Inputs> = {}) => {
  const i = { ...DEFAULTS, ...overrides };
  return calculator.calculateTakeoffPerformance(
    i.tow,
    false,
    i.conf,
    i.tora,
    i.slope,
    i.lineupAngle,
    i.wind,
    i.elevation,
    i.qnh,
    i.oat,
    TakeoffAntiIceSetting.Off,
    true,
    i.forceToga,
    i.runwayCondition,
    i.cg,
  );
};

/** The weight limit in kg, the floor of a chart value in tonnes (1 kg for the floating point interpolation) */
const expectChartWeight = (mtow: number | undefined, tonnes: number) => {
  expect(mtow).toBeDefined();
  expect(Math.abs(mtow! - tonnes * 1000)).toBeLessThanOrEqual(1);
};

describe('A380842TakeoffPerformanceCalculator', () => {
  beforeAll(() => {
    // The VMCA and VMCG tables are interpolated with this sim helper, not in the common test mock
    const utils = (globalThis as any).Avionics.Utils;
    utils.lerpAngle ??= (from: number, to: number, d: number) => {
      const delta = ((((to - from) % 360) + 540) % 360) - 180;
      return (((from + delta * d) % 360) + 360) % 360;
    };
  });

  describe('take-off weight limit (Airbus A380 AC 3-3, TRENT 900)', () => {
    it('gives the ISA chart value at a chart point', () => {
      // FIGURE-3-3-1-991-001-A01: sea level, 3000 m
      expectChartWeight(calculate().mtow, 577.0);
      // 4000 ft, 2500 m (7 °C is the ISA temperature at 4000 ft)
      expectChartWeight(calculate({ elevation: 4000, oat: 7, tora: 2500, tow: 400_000 }).mtow, 486.2);
    });

    it('gives the ISA + 15 °C chart value at the flat rating temperature', () => {
      // FIGURE-3-3-2-991-001-A01: sea level, 3000 m, 30 °C
      expectChartWeight(calculate({ oat: 30 }).mtow, 567.0);
    });

    it('interpolates between the runway lengths and between ISA and ISA + 15 °C', () => {
      expectChartWeight(calculate({ tora: 3050 }).mtow, (577.0 + 581.4) / 2);
      expectChartWeight(calculate({ oat: 22.5 }).mtow, (577.0 + 567.0) / 2);
    });

    it('keeps the ISA limit below ISA, the longest runway beyond the charts and sea level below it', () => {
      expectChartWeight(calculate({ oat: -10 }).mtow, 577.0);
      expectChartWeight(calculate({ tora: 6000 }).mtow, 637.1);
      expectChartWeight(calculate({ elevation: -500 }).mtow, 577.0);
    });

    it('gives a higher limit on a longer runway and a lower one at a higher airfield', () => {
      expect(calculate({ tora: 3500 }).mtow!).toBeGreaterThan(calculate({ tora: 2500 }).mtow!);
      expect(calculate({ elevation: 6000, oat: 3 }).mtow!).toBeLessThan(calculate().mtow!);
    });

    it('is too heavy above the limit', () => {
      // 1800 m at sea level: 456.9 t
      const result = calculate({ tora: 1800, tow: 480_000 });
      expect(result.error).toBe(TakeoffPerfomanceError.TooHeavy);
      expectChartWeight(result.mtow, 456.9);
    });
  });

  describe('corrections (A380 FCOM PER-TOF-TOC)', () => {
    it('takes the ASDA line-up distance off the runway', () => {
      expect(calculate({ lineupAngle: 90 }).params.adjustedTora).toBeCloseTo(3000 - 172.5 / FEET_PER_METRE, 6);
      expect(calculate({ lineupAngle: 180 }).params.adjustedTora).toBeCloseTo(3000 - 219.8 / FEET_PER_METRE, 6);
    });

    it('counts a tailwind more than a headwind (150 % against 50 %)', () => {
      const calm = calculate().mtow!;
      const headwind = calculate({ wind: 10 });
      const tailwind = calculate({ wind: -10 });
      expect(headwind.mtow!).toBeGreaterThan(calm);
      expect(tailwind.mtow!).toBeLessThan(calm);
      expect(calm - tailwind.mtow!).toBeGreaterThan(headwind.mtow! - calm);
      expect(headwind.estimates).toContain(TakeoffPerformanceEstimate.Wind);
    });

    it('lowers the limit uphill and raises it downhill', () => {
      const uphill = calculate({ slope: 1 });
      expect(uphill.mtow!).toBeLessThan(calculate().mtow!);
      expect(calculate({ slope: -1 }).mtow!).toBeGreaterThan(calculate().mtow!);
      expect(uphill.estimates).toContain(TakeoffPerformanceEstimate.Slope);
    });

    it('flags the temperatures above the charts as an estimate', () => {
      expect(calculate({ oat: 30 }).estimates).not.toContain(TakeoffPerformanceEstimate.Temperature);
      expect(calculate({ oat: 35 }).estimates).toContain(TakeoffPerformanceEstimate.Temperature);
    });
  });

  describe('takeoff speeds (A380 FCOM PER-TOF-TOR-SRS P 1-2)', () => {
    const cases: Partial<Inputs>[] = [
      { tow: 320_000, conf: 1 },
      { tow: 400_000, conf: 2 },
      { tow: 505_000, conf: 3, tora: 4000 },
      { tow: 450_000, conf: 1, elevation: 6000, oat: 3, tora: 4500 },
    ];

    it.each(cases)('meets the minimum speeds (%o)', (overrides) => {
      const i = { ...DEFAULTS, ...overrides };
      const result = calculate(overrides);
      expect(result.error).toBe(TakeoffPerfomanceError.None);
      const { v1, vR, v2 } = result as { v1: number; vR: number; v2: number };
      const pressureAlt = result.params.pressureAlt;
      const confs = [undefined, ApproachConf.CONF_1F, ApproachConf.CONF_2, ApproachConf.CONF_3];
      const vs1g = SpeedsLookupTables.getApproachVls(confs[i.conf]!, i.cg!, i.tow) / 1.23;
      const vmca = A380SpeedsUtils.getVmca(pressureAlt);
      const vmcg = A380SpeedsUtils.getVmcg(pressureAlt);

      // V2 >= 1.13 VS1G and >= 1.10 VMCA, and the lowest such speed
      expect(v2).toBeGreaterThanOrEqual(1.13 * vs1g);
      expect(v2).toBeGreaterThanOrEqual(1.1 * vmca);
      expect(v2 - 1).toBeLessThan(Math.max(1.13 * vs1g, 1.1 * vmca));
      // VR >= 1.05 VMCA, V1 >= VMCG, V1 <= VR <= V2
      expect(vR).toBeGreaterThanOrEqual(1.05 * vmca);
      expect(v1).toBeGreaterThanOrEqual(vmcg);
      expect(v1).toBeLessThanOrEqual(vR);
      expect(vR).toBeLessThanOrEqual(v2);
    });

    it('keeps the VR / V2 and V1 / VR ratios of the FCOM example (V1 153, VR 168, V2 174) at a high weight', () => {
      const { v1, vR, v2 } = calculate({ tow: 505_000, conf: 1, tora: 4000 });
      expect(Math.abs(vR! - (v2! * 168) / 174)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(v1! - (vR! * 153) / 168)).toBeLessThanOrEqual(0.5);
    });

    it('gives higher speeds at a higher weight, and the highest at the forward CG when none is entered', () => {
      expect(calculate({ tow: 480_000 }).v2!).toBeGreaterThan(calculate({ tow: 380_000 }).v2!);
      expect(calculate({ cg: undefined }).v2!).toBeGreaterThanOrEqual(calculate({ cg: 40 }).v2!);
    });
  });

  describe('FLEX temperature (A380 FCOM PER-TOF-THR-FLX)', () => {
    it('has TREF = ISA + 15 and TMAXFLEX = ISA + 60 (30 °C and 75 °C at sea level)', () => {
      const { params } = calculate();
      expect(params.tRef).toBeCloseTo(30, 6);
      expect(params.tFlexMax).toBeCloseTo(75, 6);
    });

    it('is between TREF, the OAT and TMAXFLEX', () => {
      for (const overrides of [{ tow: 420_000 }, { tow: 500_000, tora: 3200 }, { tow: 460_000, oat: 38 }]) {
        const result = calculate(overrides);
        const oat = overrides.oat ?? DEFAULTS.oat;
        expect(result.flex).toBeDefined();
        expect(result.flex!).toBeGreaterThanOrEqual(result.params.tRef);
        expect(result.flex!).toBeGreaterThanOrEqual(oat);
        expect(result.flex!).toBeLessThanOrEqual(result.params.tFlexMax);
      }
    });

    it('stops at TMAXFLEX for a light aircraft on a long runway (40 % maximum thrust reduction)', () => {
      expect(calculate({ tow: 320_000, tora: 4000 }).flex).toBe(75);
    });

    it('is the highest temperature at which the TOW is still possible', () => {
      const result = calculate({ tow: 500_000, tora: 3200 });
      const flex = result.flex!;
      expect(flex).toBeLessThan(75);
      expect(calculate({ tow: 500_000, tora: 3200, oat: flex, forceToga: true }).mtow!).toBeGreaterThanOrEqual(500_000);
      expect(calculate({ tow: 500_000, tora: 3200, oat: flex + 1, forceToga: true }).mtow!).toBeLessThan(500_000);
      expect(result.estimates).toContain(TakeoffPerformanceEstimate.Flex);
    });

    it('decreases with the weight', () => {
      expect(calculate({ tow: 500_000, tora: 3200 }).flex!).toBeLessThanOrEqual(
        calculate({ tow: 470_000, tora: 3200 }).flex!,
      );
    });

    it('is not given when the TOW needs a temperature below TREF, nor with TOGA forced', () => {
      // 1800 m at sea level: 456.9 t at ISA, 441.1 t at ISA + 15 °C
      const belowTref = calculate({ tora: 1800, tow: 450_000 });
      expect(belowTref.error).toBe(TakeoffPerfomanceError.None);
      expect(belowTref.flex).toBeUndefined();
      expect(calculate({ forceToga: true }).flex).toBeUndefined();
    });
  });

  describe('optimum configuration', () => {
    // Without wind and slope the weight limit does not depend on the configuration (a tie); with a tailwind it does,
    // through the lift-off speed
    it.each<Partial<Inputs>>([
      { tow: 500_000, tora: 3200 },
      { tow: 500_000, tora: 3600, wind: -8 },
    ])('picks the configuration with the highest FLEX, the highest configuration on a tie (%o)', (overrides) => {
      const i = { ...DEFAULTS, ...overrides };
      const best = calculator.calculateTakeoffPerformanceOptConf(
        i.tow,
        false,
        i.tora,
        i.slope,
        i.lineupAngle,
        i.wind,
        i.elevation,
        i.qnh,
        i.oat,
        TakeoffAntiIceSetting.Off,
        true,
        i.forceToga,
        i.runwayCondition,
        i.cg,
      );
      const flexes = [1, 2, 3].map((conf) => calculate({ ...overrides, conf }).flex ?? -Infinity);
      const highest = Math.max(...flexes);
      expect(highest).toBeGreaterThan(-Infinity);
      expect(best.flex).toBe(highest);
      expect(best.inputs.conf).toBe(flexes.lastIndexOf(highest) + 1);
    });
  });

  describe('input limits (A380 FCOM LIM-12 and the data range)', () => {
    it.each<[Partial<Inputs>, TakeoffPerfomanceError]>([
      [{ conf: 4 }, TakeoffPerfomanceError.InvalidData],
      [{ tow: 511_000 }, TakeoffPerfomanceError.StructuralMtow],
      [{ tow: 290_000 }, TakeoffPerfomanceError.OperatingEmptyWeight],
      [{ cg: 25 }, TakeoffPerfomanceError.CgOutOfLimits],
      [{ elevation: 8_100 }, TakeoffPerfomanceError.MaximumPressureAlt],
      [{ slope: 2.1 }, TakeoffPerfomanceError.MaximumRunwaySlope],
      [{ wind: -11 }, TakeoffPerfomanceError.MaximumTailwind],
      [{ runwayCondition: RunwayCondition.Wet }, TakeoffPerfomanceError.RunwayConditionNotSupported],
      [{ tora: 1650 }, TakeoffPerfomanceError.RunwayLengthOutsideData],
      [{ oat: 76 }, TakeoffPerfomanceError.MaximumTemperature],
    ])('rejects %o with %s', (overrides, error) => {
      const result = calculate(overrides);
      expect(result.error).toBe(error);
      expect(result.v2).toBeUndefined();
    });

    it('accepts the limits themselves', () => {
      expect(calculate({ slope: 2 }).error).toBe(TakeoffPerfomanceError.None);
      expect(calculate({ wind: -10 }).error).toBe(TakeoffPerfomanceError.None);
      expect(calculate({ tow: 510_000, tora: 4000 }).error).toBe(TakeoffPerfomanceError.None);
    });

    it('uses the pressure altitude, from the QNH', () => {
      expect(calculate({ elevation: 1000 }).params.pressureAlt).toBeCloseTo(1000, 6);
      const lowQnh = calculate({ qnh: 983 }).params.pressureAlt;
      expect(lowQnh).toBeGreaterThan(800);
      expect(lowQnh).toBeLessThan(860);
      expect(calculate({ elevation: 7_500, qnh: 983 }).error).toBe(TakeoffPerfomanceError.MaximumPressureAlt);
    });

    it('has the takeoff CG envelope of the FBW A380X', () => {
      expect(calculator.isCgWithinLimits(30, 300_000)).toBe(true);
      // forward limit 29 % to 375 t, then 35.75 % at 510 t: 32.75 % at 450 t
      expect(calculator.isCgWithinLimits(32.5, 450_000)).toBe(false);
      expect(calculator.isCgWithinLimits(33, 450_000)).toBe(true);
      expect(calculator.isCgWithinLimits(43.5, 400_000)).toBe(false);
      expect(calculator.getCrosswindLimit(RunwayCondition.Dry, 15)).toBe(30);
    });

    it('counts the limits themselves as within limits, at the structural MTOW too', () => {
      expect(calculator.isCgWithinLimits(29, 375_000)).toBe(true);
      expect(calculator.isCgWithinLimits(43, 400_000)).toBe(true);
      expect(calculator.isCgWithinLimits(35.75, 510_000)).toBe(true);
      expect(calculator.isCgWithinLimits(43, 510_000)).toBe(true);
      expect(calculator.isCgWithinLimits(35.7, 510_000)).toBe(false);
    });
  });

  describe('runway distances', () => {
    it('needs the whole runway at the weight limit of the runway', () => {
      // 4000 ft, 2500 m: 486.2 t
      const result = calculate({ elevation: 4000, oat: 7, tora: 2500, tow: 486_000, forceToga: true });
      const distances = calculator.calculateTakeoffDistances(result, undefined)!;
      expect(distances.required!).toBeLessThanOrEqual(distances.available);
      expect(distances.required!).toBeGreaterThan(distances.available - 5);
      expect(distances.requiredEstimated).toBe(false);
    });

    it('needs more runway at a higher weight and at a FLEX temperature', () => {
      const light = calculator.calculateTakeoffDistances(calculate({ tow: 420_000 }), undefined)!;
      const heavyResult = calculate({ tow: 500_000 });
      const heavy = calculator.calculateTakeoffDistances(heavyResult, undefined)!;
      const flex = calculator.calculateTakeoffDistances(heavyResult, heavyResult.flex)!;
      expect(heavy.required!).toBeGreaterThan(light.required!);
      expect(flex.required!).toBeGreaterThan(heavy.required!);
      expect(flex.required!).toBeLessThanOrEqual(flex.available);
    });

    it('gives no distances for a FLEX temperature outside the possible range', () => {
      const result = calculate({ tow: 500_000, tora: 3200 });
      expect(calculator.calculateTakeoffDistances(result, result.flex! + 1)).toBeUndefined();
      expect(calculator.calculateTakeoffDistances(result, 29)).toBeUndefined();
    });

    it('estimates the length below the shortest runway of the charts', () => {
      const distances = calculator.calculateTakeoffDistances(calculate({ tow: 310_000, tora: 1800 }), undefined)!;
      expect(distances.requiredBelowData).toBe(true);
      expect(distances.requiredEstimated).toBe(true);
      expect(distances.required!).toBeLessThan(1700);
    });
  });
});
