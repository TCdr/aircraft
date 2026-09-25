//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  LineupAngle,
  RunwayCondition,
  TakeoffAntiIceSetting,
  TakeoffPerfomanceError,
  TakeoffPerformanceCalculator,
  TakeoffPerformanceEstimate,
  TakeoffPerformanceResult,
  TakeoffRunwayDistances,
} from '@flybywiresim/fbw-sdk';
import { A380SpeedsUtils, ApproachConf, SpeedsLookupTables } from '@shared/OperatingSpeeds';
import {
  A380_TOW_LIMIT_ISA,
  A380_TOW_LIMIT_ISA_15,
  A380_TOW_LIMIT_PRESSURE_ALTITUDES,
  A380_TOW_LIMIT_RUNWAY_LENGTHS,
} from './a380x_takeoff_data';

const FEET_PER_METRE = 3.28084;
const MPS_PER_KNOT = 0.514444;
const GRAVITY = 9.80665;

/** The flap configurations of the calculator (1 = CONF 1+F, 2 = CONF 2, 3 = CONF 3) in the speed tables */
const CONF_IN_SPEED_TABLES: Record<number, ApproachConf> = {
  1: ApproachConf.CONF_1F,
  2: ApproachConf.CONF_2,
  3: ApproachConf.CONF_3,
};

/** The FBW A380X takeoff CG envelope, (CG % MAC, weight kg) (airframe.json5, mtow) */
const TAKEOFF_CG_ENVELOPE: readonly [number, number][] = [
  [29, 270_000],
  [29, 375_000],
  [35.75, 510_000],
  [43, 510_000],
  [43, 270_000],
];

/**
 * Takeoff performance calculator for the A380-842 (TRENT 900 engines).
 *
 * The take-off weight limit comes from the Airbus take-off weight limitation charts (a380x_takeoff_data.ts): dry
 * runway, no wind, no slope, maximum takeoff thrust, at ISA and at ISA + 15 °C (the flat rating temperature TREF).
 * V2 is the minimum of the A380 FCOM, 1.13 VS1G (PER-TOF-TOR-SRS), with VS1G from the FBW A380X speed tables.
 *
 * Unless {@link realDataOnly} is set, the calculator also gives estimates for what this data does not cover:
 * - the wind (50 % of the headwind, 150 % of the tailwind, A380 FCOM PER-TOF-TOC-OCD) and the runway slope, as a
 *   change of the distance needed to reach the lift-off speed
 * - the temperatures above TREF and the FLEX temperature: from TREF the thrust decreases linearly down to 60 % at
 *   TMAXFLEX = ISA + 60 (the 40 % maximum reduction, A380 FCOM PER-TOF-THR-FLX) and the weight limit goes with it;
 *   the density effect on the weight limit is calibrated on the charts (ISA against ISA + 15 °C, flat rated thrust).
 *   This reproduces the FCOM example of takeoff results (PER-TOF-TOR-SRS P 1: TOW 560 t for a MTOW(perf) of 614 t
 *   gives FLEX 38 °C), which gives 39 °C at sea level.
 * - VR and V1, in the ratios of the same FCOM example (V1 153, VR 168, V2 174)
 * - the minimum speeds from VMCA and VMCG (V2 >= 1.10 VMCA, VR >= 1.05 VMCA, V1 >= VMCG, PER-TOF-TOR-SRS P 1-2), with
 *   the VMCA and VMCG of the FBW A380X speed tables, as its FMS uses them: the FCOM gives no A380 values.
 * - the runway length needed below the shortest runway of the charts, and where V1, VR and 35 ft are reached (see
 *   {@link calculateTakeoffDistances}).
 */
export class A380842TakeoffPerformanceCalculator implements TakeoffPerformanceCalculator {
  /** The FBW A380X structural MTOW in kg (airframe.json5) */
  public readonly structuralMtow = 510_000;

  /** The highest airfield pressure altitude of the Airbus charts, in feet */
  public readonly maxPressureAlt = 8_000;

  /** The FBW A380X empty weight in kg (flight_model.cfg, 661 403 lb) */
  public readonly oew = 300_006;

  /** Not limited: only 50 % of the headwind is taken into account (A380 FCOM PER-TOF-TOC-OCD) */
  public readonly maxHeadwind = Number.POSITIVE_INFINITY;

  /** A380 FCOM PER-TOF-TOC-OCD */
  public readonly maxTailwind = 10;

  /** When true, only the Airbus data is used: no FLEX, V1 or VR, and no wind, slope or temperature above TREF */
  public realDataOnly = false;

  /** The flat rating temperature TREF, and TMAXFLEX, as ISA deviations (A380 FCOM PER-TOF-THR-FLX) */
  private static readonly TREF_ISA_DEVIATION = 15;

  private static readonly TMAXFLEX_ISA_DEVIATION = 60;

  /** The thrust at TMAXFLEX: the thrust cannot be reduced by more than 40 % (A380 FCOM PER-TOF-THR-FLX) */
  private static readonly THRUST_RATIO_AT_TMAXFLEX = 0.6;

  /** A380 FCOM LIM-12 */
  private static readonly MAX_SLOPE = 2;

  /** Maximum certified crosswind at takeoff, gust included (A380 FCOM LIM-12) */
  private static readonly MAX_CROSSWIND = 30;

  /** Lineup distance corrections, the ASDA ones (the larger), in metres (A380 FCOM PER-TOF-TOC-RWY) */
  private static readonly LINEUP_CORRECTION: Record<LineupAngle, number> = {
    0: 0,
    90: 172.5 / FEET_PER_METRE,
    180: 219.8 / FEET_PER_METRE,
  };

  /** The speed ratios of the A380 FCOM example of takeoff results (PER-TOF-TOR-SRS P 1) */
  private static readonly VR_TO_V2 = 168 / 174;

  private static readonly V1_TO_VR = 153 / 168;

  /** CG used for the speeds when none is entered: the forward limit, which gives the highest speeds */
  private static readonly DEFAULT_CG = 29;

  /** The takeoff distance is at least 115 % of the all-engine takeoff distance to 35 ft (CS 25.113) */
  private static readonly ALL_ENGINE_DISTANCE_FACTOR = 1.15;

  /** The all-engine speed target once airborne, V2 + 10 kt (A380 FCOM DSC-22-FG, SRS TO mode) */
  private static readonly ALL_ENGINE_V2_INCREMENT = 10;

  calculateTakeoffPerformance(
    tow: number,
    forwardCg: boolean,
    conf: number,
    tora: number,
    slope: number,
    lineupAngle: LineupAngle,
    wind: number,
    elevation: number,
    qnh: number,
    oat: number,
    antiIce: TakeoffAntiIceSetting,
    packs: boolean,
    forceToga: boolean,
    runwayCondition: RunwayCondition,
    cg?: number,
    out?: Partial<TakeoffPerformanceResult>,
  ): TakeoffPerformanceResult {
    const result = (out ?? {}) as TakeoffPerformanceResult;
    result.inputs = {
      tow,
      forwardCg,
      cg,
      conf,
      tora,
      slope,
      lineupAngle,
      wind,
      elevation,
      qnh,
      oat,
      antiIce,
      packs,
      forceToga,
      runwayCondition,
    };
    const pressureAlt = A380842TakeoffPerformanceCalculator.pressureAltitude(elevation, qnh);
    const isaTemp = A380842TakeoffPerformanceCalculator.isaTemperature(pressureAlt);
    result.params = {
      adjustedTora: tora - (A380842TakeoffPerformanceCalculator.LINEUP_CORRECTION[lineupAngle] ?? 0),
      pressureAlt,
      isaTemp,
      tRef: isaTemp + A380842TakeoffPerformanceCalculator.TREF_ISA_DEVIATION,
      tMax: isaTemp + A380842TakeoffPerformanceCalculator.TMAXFLEX_ISA_DEVIATION,
      tFlexMax: isaTemp + A380842TakeoffPerformanceCalculator.TMAXFLEX_ISA_DEVIATION,
      headwind: wind,
    };
    result.flex = undefined;
    result.mtow = undefined;
    result.v1 = undefined;
    result.vR = undefined;
    result.v2 = undefined;
    result.stabTrim = undefined;
    result.estimates = [];
    result.error = this.checkInputs(result, cg);
    if (result.error !== TakeoffPerfomanceError.None) {
      return result;
    }

    const params = result.params;
    const speedCg = cg ?? A380842TakeoffPerformanceCalculator.DEFAULT_CG;
    const isaDeviation = oat - isaTemp;
    if (!this.realDataOnly) {
      if (wind !== 0) {
        result.estimates.push(TakeoffPerformanceEstimate.Wind);
      }
      if (slope !== 0) {
        result.estimates.push(TakeoffPerformanceEstimate.Slope);
      }
      if (isaDeviation > A380842TakeoffPerformanceCalculator.TREF_ISA_DEVIATION) {
        result.estimates.push(TakeoffPerformanceEstimate.Temperature);
      }
    }

    // The weight limit depends on the lift-off speed through the wind and slope corrections, so on the weight itself
    let mtow = tow;
    for (let i = 0; i < 3; i++) {
      const limit = this.weightLimit(params.adjustedTora, wind, slope, pressureAlt, oat, conf, speedCg, mtow);
      if (limit === undefined) {
        result.error = TakeoffPerfomanceError.RunwayLengthOutsideData;
        return result;
      }
      mtow = limit;
    }
    result.mtow = Math.floor(mtow);
    if (tow > result.mtow) {
      result.error = TakeoffPerfomanceError.TooHeavy;
      return result;
    }

    // A380 FCOM PER-TOF-TOR-SRS P 1-2: V2 >= 1.13 VS1G and >= 1.10 VMCA, VR >= 1.05 VMCA, V1 >= VMCG
    const vmca = A380SpeedsUtils.getVmca(pressureAlt);
    const vmcg = A380SpeedsUtils.getVmcg(pressureAlt);
    const v2StallMin = Math.ceil(1.13 * A380842TakeoffPerformanceCalculator.vs1g(conf, speedCg, tow));
    if (this.realDataOnly) {
      // The VMCA of the FBW speed tables is no A380 data: V2 only from VS1G, refused below the VMCA minimum
      if (v2StallMin < 1.1 * vmca) {
        result.error = TakeoffPerfomanceError.VmcgVmcaLimits;
        return result;
      }
      result.v2 = v2StallMin;
    } else {
      const v2 = Math.max(v2StallMin, Math.ceil(1.1 * vmca));
      result.v2 = v2;
      if (v2 > v2StallMin) {
        result.estimates.push(TakeoffPerformanceEstimate.V2);
      }
      result.vR = Math.max(Math.round(v2 * A380842TakeoffPerformanceCalculator.VR_TO_V2), Math.ceil(1.05 * vmca));
      result.v1 = Math.min(
        result.vR,
        Math.max(Math.round(result.vR * A380842TakeoffPerformanceCalculator.V1_TO_VR), Math.ceil(vmcg)),
      );
      result.estimates.push(TakeoffPerformanceEstimate.VR, TakeoffPerformanceEstimate.V1);
    }

    // FLEX: the highest temperature from TREF (and above the OAT) up to TMAXFLEX at which the TOW is still possible
    if (!forceToga && !this.realDataOnly) {
      const lowest = Math.ceil(Math.max(params.tRef, oat));
      for (let t = Math.floor(params.tFlexMax); t >= lowest; t--) {
        const limit = this.weightLimit(params.adjustedTora, wind, slope, pressureAlt, t, conf, speedCg, tow);
        if (limit !== undefined && limit >= tow) {
          result.flex = t;
          result.estimates.push(TakeoffPerformanceEstimate.Flex);
          break;
        }
      }
    }

    return result;
  }

  calculateTakeoffPerformanceOptConf(
    tow: number,
    forwardCg: boolean,
    tora: number,
    slope: number,
    lineupAngle: LineupAngle,
    wind: number,
    elevation: number,
    qnh: number,
    oat: number,
    antiIce: TakeoffAntiIceSetting,
    packs: boolean,
    forceToga: boolean,
    runwayCondition: RunwayCondition,
    cg?: number,
    out?: Partial<TakeoffPerformanceResult>,
  ): TakeoffPerformanceResult {
    // A380 FCOM PER-TOF-THR-FLX: the configuration that gives the highest TFLEX, the highest configuration when two
    // give the same one
    let best: TakeoffPerformanceResult | undefined;
    for (const conf of [1, 2, 3]) {
      const result = this.calculateTakeoffPerformance(
        tow,
        forwardCg,
        conf,
        tora,
        slope,
        lineupAngle,
        wind,
        elevation,
        qnh,
        oat,
        antiIce,
        packs,
        forceToga,
        runwayCondition,
        cg,
      );
      if (
        best === undefined ||
        (result.error === TakeoffPerfomanceError.None &&
          (best.error !== TakeoffPerfomanceError.None ||
            (result.flex ?? -Infinity) >= (best.flex ?? -Infinity) ||
            (result.flex === undefined && best.flex === undefined && (result.mtow ?? 0) >= (best.mtow ?? 0))))
      ) {
        best = result;
      }
    }
    return out ? Object.assign(out, best) : best!;
  }

  /**
   * The runway distances of a calculated takeoff at TOGA or at a FLEX temperature.
   *
   * The required length is the runway length at which the take-off weight limit of the charts equals the TOW: it
   * includes all the regulatory limitations and margins of the charts. Where it is shorter than the charts, it is
   * estimated with a length proportional to the weight (the takeoff speeds are then at their minimum control speed
   * floor, and the acceleration goes with 1 / weight).
   *
   * V1, VR and 35 ft are estimates: the charts give no distances for them. The all-engine distance to 35 ft is taken as
   * the required length / 1.15 (CS 25.113), as the all-engine distance usually limits a four-engine aircraft (A380 FCOM
   * PER-TOF-GEN, speed optimization), with a constant acceleration up to V2 + 10 kt at 35 ft.
   */
  calculateTakeoffDistances(
    result: TakeoffPerformanceResult,
    flex: number | undefined,
  ): TakeoffRunwayDistances | undefined {
    if (result.error !== TakeoffPerfomanceError.None || result.v2 === undefined) {
      return undefined;
    }
    const { inputs, params } = result;
    if (
      flex !== undefined &&
      (this.realDataOnly ||
        result.flex === undefined ||
        flex > result.flex ||
        flex < Math.ceil(Math.max(params.tRef, inputs.oat)))
    ) {
      return undefined;
    }
    const temperature = flex ?? inputs.oat;
    const cg = inputs.cg ?? A380842TakeoffPerformanceCalculator.DEFAULT_CG;
    const limitAt = (length: number) =>
      this.weightLimit(
        length,
        inputs.wind,
        inputs.slope,
        params.pressureAlt,
        temperature,
        inputs.conf,
        cg,
        inputs.tow,
        true,
      ) ?? 0;

    const distances: TakeoffRunwayDistances = {
      flex,
      available: params.adjustedTora,
      required: undefined,
      requiredEstimated: false,
      requiredBelowData: false,
    };

    // The weight limit grows with the runway length: bisection between a very short runway and the longest of the data
    const lengths = A380_TOW_LIMIT_RUNWAY_LENGTHS;
    let low = 100;
    let high = lengths[lengths.length - 1];
    if (limitAt(high) < inputs.tow) {
      return distances;
    }
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (limitAt(mid) >= inputs.tow) {
        high = mid;
      } else {
        low = mid;
      }
    }
    const required = high;
    const belowData = this.equivalentLength(required, inputs, params.pressureAlt, temperature, cg) < lengths[0];
    const estimated =
      belowData ||
      (!this.realDataOnly && (inputs.wind !== 0 || inputs.slope !== 0)) ||
      temperature - params.isaTemp > A380842TakeoffPerformanceCalculator.TREF_ISA_DEVIATION;
    distances.requiredBelowData = belowData;
    if (this.realDataOnly && estimated) {
      // The data gives no length shorter than its shortest runway: only that maximum
      return distances;
    }
    distances.required = required;
    distances.requiredEstimated = estimated;

    if (!this.realDataOnly) {
      const screenHeight = required / A380842TakeoffPerformanceCalculator.ALL_ENGINE_DISTANCE_FACTOR;
      const groundSpeed = (cas: number) =>
        Math.max(
          1,
          A380842TakeoffPerformanceCalculator.trueAirspeed(cas, params.pressureAlt, inputs.oat) - inputs.wind,
        );
      const atScreenHeight = groundSpeed(result.v2 + A380842TakeoffPerformanceCalculator.ALL_ENGINE_V2_INCREMENT);
      const at = (cas: number | undefined) =>
        cas !== undefined ? screenHeight * (groundSpeed(cas) / atScreenHeight) ** 2 : undefined;
      distances.screenHeight = screenHeight;
      distances.v1 = at(result.v1);
      distances.vr = at(result.vR);
    }
    return distances;
  }

  isCgWithinLimits(cg: number, tow: number): boolean {
    // point in polygon (ray casting)
    let inside = false;
    const env = TAKEOFF_CG_ENVELOPE;
    for (let i = 0, j = env.length - 1; i < env.length; j = i++) {
      const [xi, yi] = env[i];
      const [xj, yj] = env[j];
      if (yi > tow !== yj > tow && cg < ((xj - xi) * (tow - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /** FCOM LIM: one crosswind limit for every runway condition and temperature */
  getCrosswindLimit(_runwayCondition: RunwayCondition, _oat: number): number {
    return A380842TakeoffPerformanceCalculator.MAX_CROSSWIND;
  }

  private checkInputs(result: TakeoffPerformanceResult, cg: number | undefined): TakeoffPerfomanceError {
    const inputs = result.inputs;
    const params = result.params;
    if (CONF_IN_SPEED_TABLES[inputs.conf] === undefined || !Number.isFinite(inputs.tow)) {
      return TakeoffPerfomanceError.InvalidData;
    }
    if (inputs.tow > this.structuralMtow) {
      return TakeoffPerfomanceError.StructuralMtow;
    }
    if (inputs.tow < this.oew) {
      return TakeoffPerfomanceError.OperatingEmptyWeight;
    }
    if (cg !== undefined && !this.isCgWithinLimits(cg, inputs.tow)) {
      return TakeoffPerfomanceError.CgOutOfLimits;
    }
    if (params.pressureAlt > this.maxPressureAlt) {
      return TakeoffPerfomanceError.MaximumPressureAlt;
    }
    if (Math.abs(inputs.slope) > A380842TakeoffPerformanceCalculator.MAX_SLOPE) {
      return TakeoffPerfomanceError.MaximumRunwaySlope;
    }
    if (inputs.wind < -this.maxTailwind) {
      return TakeoffPerfomanceError.MaximumTailwind;
    }
    if (inputs.runwayCondition !== RunwayCondition.Dry) {
      return TakeoffPerfomanceError.RunwayConditionNotSupported;
    }
    if (params.adjustedTora < A380_TOW_LIMIT_RUNWAY_LENGTHS[0]) {
      return TakeoffPerfomanceError.RunwayLengthOutsideData;
    }
    if (inputs.oat > params.tMax) {
      return TakeoffPerfomanceError.MaximumTemperature;
    }
    // The Airbus data has no tailwind, no slope and no temperature above TREF (a headwind is simply not credited)
    if (
      this.realDataOnly &&
      (inputs.wind < 0 ||
        inputs.slope !== 0 ||
        inputs.oat - params.isaTemp > A380842TakeoffPerformanceCalculator.TREF_ISA_DEVIATION)
    ) {
      return TakeoffPerfomanceError.OutsideManufacturerData;
    }
    return TakeoffPerfomanceError.None;
  }

  /**
   * The take-off weight limit in kg, or undefined when the runway is shorter than the data.
   * @param runwayLength runway length available in metres
   * @param wind headwind component in knots, negative for a tailwind
   * @param slope runway slope in %, positive uphill
   * @param pressureAlt airfield pressure altitude in feet
   * @param temperature OAT (or FLEX temperature) in °C
   * @param conf flap configuration 1 (1+F), 2 or 3
   * @param cg CG in % MAC for the speeds
   * @param weight the weight in kg for the lift-off speed of the wind and slope corrections
   * @param extrapolate below the shortest runway of the data, a weight limit proportional to the runway length (an
   *   estimate) instead of undefined
   */
  private weightLimit(
    runwayLength: number,
    wind: number,
    slope: number,
    pressureAlt: number,
    temperature: number,
    conf: number,
    cg: number,
    weight: number,
    extrapolate = false,
  ): number | undefined {
    let length = runwayLength;
    if (!this.realDataOnly && (wind !== 0 || slope !== 0)) {
      const v2 = 1.13 * A380842TakeoffPerformanceCalculator.vs1g(conf, cg, weight);
      const liftOffTas = A380842TakeoffPerformanceCalculator.trueAirspeed(v2, pressureAlt, temperature) * MPS_PER_KNOT;
      length = A380842TakeoffPerformanceCalculator.equivalentRunwayLength(length, wind, slope, liftOffTas);
    }
    const shortest = A380_TOW_LIMIT_RUNWAY_LENGTHS[0];
    if (extrapolate && length < shortest) {
      const atShortest = this.weightLimit(shortest, 0, 0, pressureAlt, temperature, conf, cg, weight);
      return atShortest !== undefined ? (atShortest * Math.max(0, length)) / shortest : undefined;
    }
    const isa = A380842TakeoffPerformanceCalculator.isaTemperature(pressureAlt);
    const deviation = temperature - isa;
    const atIsa = A380842TakeoffPerformanceCalculator.tableLimit(A380_TOW_LIMIT_ISA, pressureAlt, length);
    const atTref = A380842TakeoffPerformanceCalculator.tableLimit(A380_TOW_LIMIT_ISA_15, pressureAlt, length);
    if (atIsa === undefined || atTref === undefined) {
      return undefined;
    }
    const tref = A380842TakeoffPerformanceCalculator.TREF_ISA_DEVIATION;
    let tonnes: number;
    if (deviation <= 0) {
      // colder than ISA: the ISA limit (the charts give nothing colder)
      tonnes = atIsa;
    } else if (deviation <= tref) {
      tonnes = atIsa + ((atTref - atIsa) * deviation) / tref;
    } else {
      // Above TREF (estimate): less density, and the thrust, with the weight limit, decreases linearly down to its
      // TMAXFLEX value
      const thrustRatio =
        1 -
        ((1 - A380842TakeoffPerformanceCalculator.THRUST_RATIO_AT_TMAXFLEX) * (deviation - tref)) /
          (A380842TakeoffPerformanceCalculator.TMAXFLEX_ISA_DEVIATION - tref);
      const densityRatio = (isa + tref + 273.15) / (temperature + 273.15);
      tonnes = atTref * densityRatio ** A380842TakeoffPerformanceCalculator.densityExponent(length) * thrustRatio;
    }
    return tonnes * 1000;
  }

  /** The runway length without wind and slope for a runway length, the one of the charts */
  private equivalentLength(
    runwayLength: number,
    inputs: TakeoffPerformanceResult['inputs'],
    pressureAlt: number,
    temperature: number,
    cg: number,
  ): number {
    if (this.realDataOnly || (inputs.wind === 0 && inputs.slope === 0)) {
      return runwayLength;
    }
    const v2 = 1.13 * A380842TakeoffPerformanceCalculator.vs1g(inputs.conf, cg, inputs.tow);
    const liftOffTas = A380842TakeoffPerformanceCalculator.trueAirspeed(v2, pressureAlt, temperature) * MPS_PER_KNOT;
    return A380842TakeoffPerformanceCalculator.equivalentRunwayLength(
      runwayLength,
      inputs.wind,
      inputs.slope,
      liftOffTas,
    );
  }

  /**
   * The runway length without wind and slope that needs the same distance to reach the lift-off speed.
   * @param length runway length in metres
   * @param wind headwind in knots, negative for a tailwind: 50 % of the headwind and 150 % of the tailwind are used
   *   (A380 FCOM PER-TOF-TOC-OCD)
   * @param slope runway slope in %, positive uphill
   * @param liftOffTas lift-off true airspeed in m/s
   */
  private static equivalentRunwayLength(length: number, wind: number, slope: number, liftOffTas: number): number {
    const factoredWind = (wind >= 0 ? 0.5 : 1.5) * wind * MPS_PER_KNOT;
    // The ground distance to reach the lift-off speed goes with the square of the ground speed at lift-off
    let equivalent = length * (liftOffTas / (liftOffTas - factoredWind)) ** 2;
    // With the mean acceleration that uses the runway, a slope changes it by g x slope
    const meanAcceleration = liftOffTas ** 2 / (2 * length);
    equivalent *= Math.max(0, 1 - (GRAVITY * slope) / 100 / meanAcceleration);
    return equivalent;
  }

  /**
   * The exponent k of the take-off weight limit W ~ density^k at a runway length, from the charts: between ISA and
   * ISA + 15 °C the thrust is flat rated, so the change of W is the density effect.
   */
  private static densityExponent(length: number): number {
    const alts = A380_TOW_LIMIT_PRESSURE_ALTITUDES;
    let k = 0;
    for (const alt of alts) {
      const w0 = A380842TakeoffPerformanceCalculator.tableLimit(A380_TOW_LIMIT_ISA, alt, length)!;
      const w15 = A380842TakeoffPerformanceCalculator.tableLimit(A380_TOW_LIMIT_ISA_15, alt, length)!;
      const t = A380842TakeoffPerformanceCalculator.isaTemperature(alt) + 273.15;
      k += Math.log(w15 / w0) / Math.log(t / (t + 15));
    }
    return k / alts.length;
  }

  /**
   * A take-off weight limit of a chart table in tonnes, interpolated between the pressure altitudes and the runway
   * lengths, or undefined below the shortest runway. Beyond the longest runway, the last column; below sea level, the
   * sea level row (both conservative).
   */
  private static tableLimit(
    table: readonly (readonly number[])[],
    pressureAlt: number,
    length: number,
  ): number | undefined {
    const lengths = A380_TOW_LIMIT_RUNWAY_LENGTHS;
    const alts = A380_TOW_LIMIT_PRESSURE_ALTITUDES;
    if (length < lengths[0]) {
      return undefined;
    }
    const [li, lf] = A380842TakeoffPerformanceCalculator.lerpIndex(
      lengths,
      Math.min(length, lengths[lengths.length - 1]),
    );
    const [ai, af] = A380842TakeoffPerformanceCalculator.lerpIndex(alts, Math.max(pressureAlt, alts[0]));
    const row = (a: number) => table[a][li] + (table[a][li + 1] - table[a][li]) * lf;
    return row(ai) + (row(ai + 1) - row(ai)) * af;
  }

  /** The index of the lower breakpoint and the fraction towards the next one */
  private static lerpIndex(breakpoints: readonly number[], value: number): [number, number] {
    const last = breakpoints.length - 2;
    let i = 0;
    while (i < last && value > breakpoints[i + 1]) {
      i++;
    }
    const f = (value - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i]);
    return [i, Math.min(Math.max(f, 0), 1)];
  }

  /** VS1G in knots: the FBW A380X VLS table of the configuration is 1.23 VS1G (A380 FCOM DSC-22-27-10-10 P 3) */
  private static vs1g(conf: number, cg: number, weight: number): number {
    return SpeedsLookupTables.getApproachVls(CONF_IN_SPEED_TABLES[conf], cg, weight) / 1.23;
  }

  private static trueAirspeed(cas: number, pressureAlt: number, temperature: number): number {
    const densityRatio =
      A380842TakeoffPerformanceCalculator.pressureRatio(pressureAlt) / ((temperature + 273.15) / 288.15);
    return cas / Math.sqrt(densityRatio);
  }

  private static pressureAltitude(elevation: number, qnh: number): number {
    return elevation + 145442.15 * (1 - (qnh / 1013.25) ** 0.190263);
  }

  private static pressureRatio(pressureAlt: number): number {
    return (1 - 6.8755856e-6 * pressureAlt) ** 5.2558797;
  }

  private static isaTemperature(pressureAlt: number): number {
    return 15 - 0.0019812 * pressureAlt;
  }
}
