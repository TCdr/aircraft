//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  BTV_TOUCHDOWN_DISTANCE,
  BtvLines,
  LandingAntiIce,
  LandingApproachType,
  LandingBrakingDistance,
  LandingBrakingMode,
  LandingComputationType,
  LandingConf,
  LandingGoAroundConf,
  LandingLimitation,
  LandingPerformanceCalculator,
  LandingPerformanceError,
  LandingPerformanceEstimate,
  LandingPerformanceInputs,
  LandingPerformanceResult,
  LandingRunwayCondition,
  landingIsaTemperature,
  landingPressureAltitude,
  landingWindIncrement,
} from '@flybywiresim/fbw-sdk';
import { ApproachConf, SpeedsLookupTables } from '@shared/OperatingSpeeds';
import { Vmcl } from '@shared/PerformanceConstants';

const MPS_PER_KNOT = 0.514444;
const GRAVITY = 9.80665;
const FEET_PER_METRE = 3.28084;

/** The forward CG limit in % MAC: the landing performance assumes the most forward CG (A380 FCOM PER-LND-LCD-ACC) */
const FORWARD_CG = 29;

/**
 * Landing field length on a dry runway in metres (Airbus A380 Aircraft Characteristics, Dec 01/25, FIGURE-3-4-1-991-001-A01,
 * "valid for all temperatures", extracted from the vector curves of the chart), for the pressure altitudes
 * {@link LFL_ALTITUDES} (rows) and the landing weights {@link LFL_WEIGHTS} (columns).
 */
const LFL_WEIGHTS = [300, 320, 340, 360, 380, 400, 420, 430, 450];
const LFL_ALTITUDES = [0, 2000, 4000, 6000, 8000];
const LFL = [
  [1581, 1654, 1728, 1803, 1878, 1953, 2019, 2050, 2138],
  [1651, 1728, 1809, 1887, 1969, 2044, 2113, 2150, 2261],
  [1722, 1803, 1891, 1978, 2063, 2144, 2215, 2267, 2396],
  [1803, 1894, 1978, 2069, 2159, 2249, 2337, 2400, 2528],
  [1887, 1984, 2078, 2172, 2270, 2359, 2469, 2541, 2681],
];

/** The required landing distance on a dry runway is the actual landing distance divided by 0.6 (PER-LND-GEN) */
const DRY_DISPATCH_FACTOR = 1 / 0.6;
/** The wet RLD is the dry RLD x 1.15, the contaminated RLD at least the contaminated ALD x 1.15 (PER-LND-GEN) */
const WET_FACTOR = 1.15;

/**
 * The landing distance model, fitted on the whole chart (45 points, 0.8 % RMS, 2 % max): an airborne and transition
 * phase of {@link AIR_TIME} at the ground speed, then a constant deceleration {@link DRY_DECELERATION} to the stop, at
 * the VLS CONF FULL of the FBW A380X speed tables (forward CG) in true airspeed. The chart gives the distance; the model
 * gives its change with the conditions that the chart does not cover.
 */
const AIR_TIME = 5.149;
const DRY_DECELERATION = 3.253;
/** Part of the airborne phase before the touchdown, for the touchdown point of the runway picture */
const TOUCHDOWN_TIME = 4.15;

/**
 * Maximum braking deceleration in m/s² on each runway condition code (6 dry ... 1 poor): the dry one of the fit, the
 * others in the ratios of the ground distances of the A320 in-flight landing distances (FBW A32NX QRH data, MAX
 * MANUAL, CONF FULL, 7 s airborne): the braking is limited by the runway friction.
 */
const RWYCC_DECELERATION: Record<number, number> = {
  6: DRY_DECELERATION,
  5: DRY_DECELERATION / 1.447,
  4: DRY_DECELERATION / 1.878,
  3: DRY_DECELERATION / 2.205,
  2: DRY_DECELERATION / 2.497,
  1: DRY_DECELERATION / 3.926,
};

/** Deceleration targets of the autobrake modes (A380 FCOM DSC-32-10-30-20, basic AUTO BRK), and the part achieved */
const AUTOBRAKE_DECELERATION: Partial<Record<LandingBrakingMode, number>> = {
  [LandingBrakingMode.Lo]: 2.0,
  [LandingBrakingMode.Two]: 2.5,
  [LandingBrakingMode.Three]: 3.0,
  [LandingBrakingMode.Hi]: 3.5,
};
const AUTOBRAKE_EFFICIENCY = 0.95;
const AUTOBRAKE_DELAY = 0.5;

/** Deceleration of the two thrust reversers (engines 2 and 3), with credit on a contaminated runway */
const REVERSER_DECELERATION = 0.15;
/** Autoland: longer airborne phase (flare law), in seconds */
const AUTOLAND_EXTRA_AIR_TIME = 1.5;
/** Overweight landing: maximum braking after the nosewheel touchdown (PER-LND-GEN Overweight landing requirements) */
const OVERWEIGHT_BRAKING_DELAY = 2;

/**
 * Approach climb gradient: gradient = T / W - K, with T the thrust of the three remaining engines at TOGA in tonnes
 * (flat rated up to ISA + 15, then 40 % less at ISA + 60, as the takeoff calculator) and K the drag to lift ratio of
 * the go-around configuration. T and K of CONF 3 come from the A380 FCOM example of in-flight landing results
 * (PER-LND-LDI P 3, PER-LND-LRF-FSR P 2): 386.0 t at a GA altitude of 1320 ft, ISA + 2, gives a GA gradient of
 * 8.939 %, and 569.0 t (the MLW(perf)) the minimum 2.7 %.
 */
const GA_THRUST_SEA_LEVEL = 74.89 / (1 - 6.8756e-6 * 1320) ** (5.2559 * 0.7);
const GA_DRAG_RATIO: Record<LandingGoAroundConf, number> = {
  [LandingGoAroundConf.Conf3]: 0.10462,
  [LandingGoAroundConf.Conf2]: 0.093,
  [LandingGoAroundConf.Conf1F]: 0.083,
};
const GA_BLEED_FACTOR = {
  airConditioningOff: 1.015,
  [LandingAntiIce.Off]: 1,
  [LandingAntiIce.Engine]: 0.995,
  [LandingAntiIce.EngineWing]: 0.97,
};

/**
 * BTV DRY and WET lines (A380 FCOM DSC-32-10-30-20, computation principle): touchdown at 400 m from the threshold at
 * least, touchdown ground speed from the approach speed and the wind, then the stopping distances of the FBW A380X BTV
 * (autobrakes.rs BrakingDistanceCalculator, the lines the ND and the OANS show): 5 s of roll before the braking, then
 * 2.8 m/s² on a dry runway (autobrake HI, no reverser) and 1.8 m/s² on a wet one (1/4 in of water, maximum braking and
 * reverse).
 */
const BTV_ROLL_BEFORE_BRAKING = 5;
const BTV_DRY_DECELERATION = 2.8;
const BTV_WET_DECELERATION = 1.8;

const GA_CONF_IN_SPEED_TABLES: Record<LandingGoAroundConf, ApproachConf> = {
  [LandingGoAroundConf.Conf3]: ApproachConf.CONF_3,
  [LandingGoAroundConf.Conf2]: ApproachConf.CONF_2,
  [LandingGoAroundConf.Conf1F]: ApproachConf.CONF_1F,
};

/** The runway conditions of the A380 LDG PERF application (A380 FCOM PER-LND-LCD-OCD Runway conditions) */
const RUNWAY_CONDITIONS = [
  LandingRunwayCondition.Dry,
  LandingRunwayCondition.Wet,
  LandingRunwayCondition.Water6mm,
  LandingRunwayCondition.Water13mm,
  LandingRunwayCondition.Slush6mm,
  LandingRunwayCondition.Slush13mm,
  LandingRunwayCondition.CompactedSnow,
  LandingRunwayCondition.Icy,
];

const WATER_CONTAMINATED = [
  LandingRunwayCondition.Water6mm,
  LandingRunwayCondition.Water13mm,
  LandingRunwayCondition.Slush6mm,
  LandingRunwayCondition.Slush13mm,
];

/** A landing and go-around configuration pair */
interface ConfCase {
  conf: LandingConf.Conf3 | LandingConf.Full;
  goAroundConf: LandingGoAroundConf;
}

/** Linear interpolation, extrapolated beyond the ends */
function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]) {
    i++;
  }
  return ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / (xs[i + 1] - xs[i]);
}

/** Pressure ratio at a pressure altitude in feet */
function pressureRatio(pressureAlt: number): number {
  return (1 - 6.8756e-6 * pressureAlt) ** 5.2559;
}

/** Density ratio at a pressure altitude in feet and a temperature in °C */
function densityRatio(pressureAlt: number, temperature: number): number {
  return (pressureRatio(pressureAlt) * 288.15) / (temperature + 273.15);
}

/**
 * Landing performance calculator of the A380-842, after the LDG PERF application of the A380 FCOM (PER-LND): DISPATCH
 * and IN-FLIGHT computations, required and actual landing distances, stop margin, VAPP, go-around gradient and speed,
 * MLW(PERF) and its limitation code, AUTO CONF.
 *
 * The data: the landing field length chart of the Airbus Aircraft Characteristics (dry runway, manual landing, CONF
 * FULL, VAPP = VLS, no wind), the regulatory rules of the FCOM (RLD = ALD / 0.6 on a dry runway, x 1.15 on a wet
 * runway, 50 % of the headwind and 150 % of the tailwind, the temperature only for water contaminated runways and
 * autoland, the slope only for autoland), and its example of in-flight results for the go-around gradient.
 * Everything else is an estimate (see the constants): the other runway conditions, the autobrake modes, the reversers,
 * the autoland, the go-around gradient.
 */
export class A380842LandingPerformanceCalculator implements LandingPerformanceCalculator {
  /** FBW A380X airframe.json5 */
  public readonly mlw = 395_000;

  public readonly mtow = 510_000;

  public readonly oew = 300_006;

  /** A380 FCOM LIM-12 */
  public readonly maxTailwind = 10;

  /** The highest airfield altitude of the Airbus chart */
  public readonly maxPressureAlt = 8_000;

  /** A380 FCOM PER-LND-LCD-ACC Go-around gradient: 2.7 % whatever the approach type (four engines) */
  public readonly minGoAroundGradient = 2.7;

  public readonly features = {
    autoConf: true,
    goAround: true,
    antiIce: true,
    airConditioning: true,
    approachType: true,
    overweightProcedure: false,
    btv: true,
  };

  /** A380 FCOM LIM-12 */
  private static readonly MAX_SLOPE = 2;

  public runwayConditions(_type: LandingComputationType): LandingRunwayCondition[] {
    return RUNWAY_CONDITIONS;
  }

  public brakingModes(): LandingBrakingMode[] {
    return [
      LandingBrakingMode.Manual,
      LandingBrakingMode.Lo,
      LandingBrakingMode.Two,
      LandingBrakingMode.Three,
      LandingBrakingMode.Hi,
    ];
  }

  /** No reverse thrust credit on dry and wet runways; on a contaminated runway as per the operator policy (MORE panel) */
  public reverseThrustAvailable(
    _type: LandingComputationType,
    condition: LandingRunwayCondition,
    _conf?: LandingConf,
    _brakingMode?: LandingBrakingMode,
  ): boolean {
    return condition !== LandingRunwayCondition.Dry && condition !== LandingRunwayCondition.Wet;
  }

  /**
   * A380 FCOM PER-LND-CTA-CWD: 35 kt on dry and wet runways (gust included), 20 kt with slush or dry snow, 15 kt with
   * standing water or compacted snow (friction 0.2, poor), 5 kt on an icy runway.
   */
  public crosswindLimit(condition: LandingRunwayCondition, _oat: number): number {
    switch (condition) {
      case LandingRunwayCondition.Dry:
      case LandingRunwayCondition.Wet:
        return 35;
      case LandingRunwayCondition.Slush6mm:
      case LandingRunwayCondition.Slush13mm:
        return 20;
      case LandingRunwayCondition.Water6mm:
      case LandingRunwayCondition.Water13mm:
      case LandingRunwayCondition.CompactedSnow:
        return 15;
      default:
        return 5;
    }
  }

  public windIncrement(headwind: number): number {
    return landingWindIncrement(headwind);
  }

  public calculateLandingPerformance(inputs: LandingPerformanceInputs): LandingPerformanceResult {
    const pressureAlt = landingPressureAltitude(inputs.elevation, inputs.qnh);
    const isaTemp = landingIsaTemperature(pressureAlt);
    const inFlight = inputs.type === LandingComputationType.InFlight;
    const weight = inputs.weight;
    const windIncrement = this.windIncrement(inputs.headwind);
    const speedIncrement = Math.max(inputs.speedIncrement ?? windIncrement, inputs.autoland ? 5 : 0);

    const result: LandingPerformanceResult = {
      inputs,
      error: this.checkInputs(inputs, pressureAlt),
      conf: inputs.conf === LandingConf.Conf3 ? LandingConf.Conf3 : LandingConf.Full,
      pressureAlt,
      isaTemp,
      vls: 0,
      windIncrement,
      speedIncrement,
      vapp: 0,
      brakingDistances: [],
      overweight: inFlight && weight > this.mlw,
      reverseCredit: inputs.reverseThrust && this.reverseThrustAvailable(inputs.type, inputs.runwayCondition),
      estimates: [LandingPerformanceEstimate.GoAroundGradient, LandingPerformanceEstimate.MlwPerf],
    };
    if (result.error !== LandingPerformanceError.None) {
      return result;
    }

    // AUTO CONF: landing in FULL if its go-around in CONF 3 has the gradient, otherwise in CONF 3 with a go-around in
    // CONF 2, and for an overweight landing CONF 3 with a go-around in CONF 1+F (PER-LND-LCF-ACC)
    const cases = this.confCases(inputs, result.overweight);
    const chosen = cases.find((c) => this.goAroundGradient(inputs, weight, c) >= inputs.goAroundGradient) ?? cases[0];
    result.conf = chosen.conf;
    result.goAroundConf = chosen.goAroundConf;

    result.vls = this.vls(chosen.conf, weight);
    result.vapp = result.vls + speedIncrement;
    result.goAroundGradient = this.goAroundGradient(inputs, weight, chosen);
    result.btv = this.btvLines(inputs, result.vapp, pressureAlt);
    result.goAroundSpeed = this.goAroundSpeed(inputs, weight, chosen);

    const ald = this.actualLandingDistance(inputs, weight, chosen.conf, inFlight ? inputs.brakingMode : undefined);
    result.actualLandingDistance = ald;
    result.landingDistance = inFlight ? ald : this.requiredLandingDistance(inputs, weight, chosen.conf);
    result.stopMargin = inputs.lda - result.landingDistance;
    result.airDistance = this.groundSpeed(inputs, result.vapp, pressureAlt) * TOUCHDOWN_TIME;
    if (inFlight) {
      result.brakingDistances = this.brakingModes().map(
        (mode): LandingBrakingDistance => ({
          mode,
          distance: this.actualLandingDistance(inputs, weight, chosen.conf, mode),
        }),
      );
    }

    // MLW(PERF): the highest weight of the landing distance and go-around gradient requirements, of the best
    // configuration of AUTO CONF
    let best: { weight: number; limitation: LandingLimitation } | undefined;
    for (const c of inputs.conf === LandingConf.Auto ? cases : [chosen]) {
      const limit = this.mlwPerf(inputs, c);
      if (best === undefined || limit.weight > best.weight) {
        best = limit;
      }
    }
    result.mlwPerf = best.weight;
    result.limitation = weight <= best.weight ? LandingLimitation.Weight : best.limitation;

    if (!this.isChartDistance(inputs, weight, pressureAlt, chosen.conf, speedIncrement)) {
      result.estimates.push(LandingPerformanceEstimate.LandingDistance);
    }
    return result;
  }

  private checkInputs(inputs: LandingPerformanceInputs, pressureAlt: number): LandingPerformanceError {
    if (
      ![inputs.weight, inputs.lda, inputs.elevation, inputs.oat, inputs.qnh, inputs.headwind].every(Number.isFinite)
    ) {
      return LandingPerformanceError.InvalidData;
    }
    if (!RUNWAY_CONDITIONS.includes(inputs.runwayCondition)) {
      return LandingPerformanceError.RunwayCondition;
    }
    if (inputs.weight < this.oew) {
      return LandingPerformanceError.OperatingEmptyWeight;
    }
    if (inputs.type === LandingComputationType.Dispatch && inputs.weight > this.mlw) {
      return LandingPerformanceError.MaximumLandingWeight;
    }
    if (inputs.weight > this.mtow) {
      return LandingPerformanceError.MaximumTakeoffWeight;
    }
    if (pressureAlt > this.maxPressureAlt) {
      return LandingPerformanceError.MaximumPressureAlt;
    }
    if (inputs.headwind < -this.maxTailwind) {
      return LandingPerformanceError.MaximumTailwind;
    }
    if (Math.abs(inputs.slope) > A380842LandingPerformanceCalculator.MAX_SLOPE) {
      return LandingPerformanceError.MaximumRunwaySlope;
    }
    return LandingPerformanceError.None;
  }

  private confCases(inputs: LandingPerformanceInputs, overweight: boolean): ConfCase[] {
    const full: ConfCase = { conf: LandingConf.Full, goAroundConf: LandingGoAroundConf.Conf3 };
    const conf3: ConfCase = {
      conf: LandingConf.Conf3,
      goAroundConf:
        overweight && inputs.goAroundConf === LandingGoAroundConf.Conf1F
          ? LandingGoAroundConf.Conf1F
          : LandingGoAroundConf.Conf2,
    };
    switch (inputs.conf) {
      case LandingConf.Full:
        return [full];
      case LandingConf.Conf3:
        return [conf3];
      default:
        return overweight
          ? [full, conf3, { conf: LandingConf.Conf3, goAroundConf: LandingGoAroundConf.Conf1F }]
          : [full, conf3];
    }
  }

  /** VLS of the landing configuration at the most forward CG, in knots */
  private vls(conf: LandingConf.Conf3 | LandingConf.Full, weight: number): number {
    return SpeedsLookupTables.getApproachVls(
      conf === LandingConf.Full ? ApproachConf.CONF_FULL : ApproachConf.CONF_3,
      FORWARD_CG,
      weight,
    );
  }

  /**
   * The go-around speed of the approach climb (PER-LND-LRD-DSR Go-around speed): VLS of the go-around configuration for
   * a CAT I approach; for CAT II, also at least VLS of the landing configuration + 5 kt and VMCL + 5 kt.
   */
  private goAroundSpeed(inputs: LandingPerformanceInputs, weight: number, c: ConfCase): number {
    const vlsGoAround = SpeedsLookupTables.getApproachVls(GA_CONF_IN_SPEED_TABLES[c.goAroundConf], FORWARD_CG, weight);
    if (inputs.approachType === LandingApproachType.Cat2) {
      return Math.max(vlsGoAround, this.vls(c.conf, weight) + 5, Vmcl + 5);
    }
    return vlsGoAround;
  }

  /** The approach climb gradient in % (one engine out, TOGA, gear up), at the go-around altitude */
  private goAroundGradient(inputs: LandingPerformanceInputs, weight: number, c: ConfCase): number {
    const gaAltitude = inputs.goAroundAltitude ?? inputs.elevation;
    const pressureAlt = landingPressureAltitude(gaAltitude, inputs.qnh);
    const oat = inputs.oat - 0.0019812 * (gaAltitude - inputs.elevation);
    const isaDeviation = oat - landingIsaTemperature(pressureAlt);
    const temperatureFactor = isaDeviation <= 15 ? 1 : Math.max(0.6, 1 - (0.4 * (isaDeviation - 15)) / 45);
    const bleed = (inputs.airConditioning ? 1 : GA_BLEED_FACTOR.airConditioningOff) * GA_BLEED_FACTOR[inputs.antiIce];
    const thrust = GA_THRUST_SEA_LEVEL * pressureRatio(pressureAlt) ** 0.7 * temperatureFactor * bleed;
    return 100 * (thrust / (weight / 1000) - GA_DRAG_RATIO[c.goAroundConf]);
  }

  /** The BTV DRY and WET lines of the approach speed, in metres from the threshold (see {@link BTV_ROLL_BEFORE_BRAKING}) */
  private btvLines(inputs: LandingPerformanceInputs, vapp: number, pressureAlt: number): BtvLines {
    const tas = vapp / Math.sqrt(densityRatio(pressureAlt, inputs.oat));
    const groundSpeed = Math.max(0, tas - inputs.headwind) * MPS_PER_KNOT;
    const stop = (deceleration: number) =>
      BTV_TOUCHDOWN_DISTANCE + groundSpeed * BTV_ROLL_BEFORE_BRAKING + groundSpeed ** 2 / (2 * deceleration);
    return { touchdown: BTV_TOUCHDOWN_DISTANCE, dry: stop(BTV_DRY_DECELERATION), wet: stop(BTV_WET_DECELERATION) };
  }

  /** Ground speed at the threshold in m/s: 50 % of the headwind, 150 % of the tailwind (PER-LND-LCD-OCD Wind) */
  private groundSpeed(
    inputs: LandingPerformanceInputs,
    ias: number,
    pressureAlt: number,
    temperature?: number,
  ): number {
    const tas = ias / Math.sqrt(densityRatio(pressureAlt, temperature ?? landingIsaTemperature(pressureAlt)));
    const wind = inputs.headwind >= 0 ? 0.5 * inputs.headwind : 1.5 * inputs.headwind;
    return (tas - wind) * MPS_PER_KNOT;
  }

  /** The runway condition code of a runway condition (runway condition assessment matrix) */
  private runwayConditionCode(inputs: LandingPerformanceInputs): number {
    switch (inputs.runwayCondition) {
      case LandingRunwayCondition.Dry:
        return 6;
      case LandingRunwayCondition.Wet:
        return 5;
      case LandingRunwayCondition.CompactedSnow:
        return inputs.oat <= -15 ? 4 : 3;
      case LandingRunwayCondition.Icy:
        return 1;
      default:
        return 2;
    }
  }

  /** Landing distance of the model for a braking deceleration (see {@link AIR_TIME}) */
  private modelDistance(
    groundSpeed: number,
    deceleration: number,
    extraAirTime: number,
    extraGroundTime: number,
  ): number {
    return (
      (AIR_TIME + extraAirTime) * groundSpeed + extraGroundTime * groundSpeed + groundSpeed ** 2 / (2 * deceleration)
    );
  }

  /** The landing distance of the chart at a weight and pressure altitude: dry, manual, CONF FULL, VLS, no wind */
  private chartActualDistance(weight: number, pressureAlt: number): number {
    const tonnes = weight / 1000;
    const byAltitude = LFL.map((row) => interpolate(LFL_WEIGHTS, row, tonnes));
    return interpolate(LFL_ALTITUDES, byAltitude, pressureAlt) / DRY_DISPATCH_FACTOR;
  }

  /**
   * The actual landing distance (50 ft above the threshold to the stop) in metres: the chart distance, changed in the
   * ratio of the model distance with the conditions to the model distance of the chart.
   * @param brakingMode an autobrake mode, the maximum manual braking when undefined or MANUAL
   * @param dry the distance on a dry runway whatever the runway condition
   */
  private actualLandingDistance(
    inputs: LandingPerformanceInputs,
    weight: number,
    conf: LandingConf.Conf3 | LandingConf.Full,
    brakingMode?: LandingBrakingMode,
    dry = false,
  ): number {
    const pressureAlt = landingPressureAltitude(inputs.elevation, inputs.qnh);
    const vlsFull = this.vls(LandingConf.Full, weight);
    const speedIncrement = Math.max(
      inputs.speedIncrement ?? this.windIncrement(inputs.headwind),
      inputs.autoland ? 5 : 0,
    );
    const vapp = this.vls(conf, weight) + speedIncrement;
    const condition = dry ? LandingRunwayCondition.Dry : inputs.runwayCondition;

    // The temperature counts on water contaminated runways and for autoland only, the slope for autoland only
    // (PER-LND-LCD-OCD Outside air temperature, PER-LND-LCD-RWY Slope)
    const withTemperature = inputs.autoland || WATER_CONTAMINATED.includes(condition);
    const groundSpeed = this.groundSpeed(inputs, vapp, pressureAlt, withTemperature ? inputs.oat : undefined);

    let maxDeceleration = RWYCC_DECELERATION[dry ? 6 : this.runwayConditionCode(inputs)];
    if (!dry && inputs.reverseThrust && this.reverseThrustAvailable(inputs.type, condition)) {
      maxDeceleration += REVERSER_DECELERATION;
    }
    if (inputs.autoland) {
      maxDeceleration += (GRAVITY * inputs.slope) / 100;
    }
    const autobrake = brakingMode !== undefined ? AUTOBRAKE_DECELERATION[brakingMode] : undefined;
    const deceleration =
      autobrake !== undefined ? Math.min(autobrake * AUTOBRAKE_EFFICIENCY, maxDeceleration) : maxDeceleration;

    let extraAirTime = 0;
    if (inputs.autoland) {
      const glideSlope = Math.max(2.5, Math.min(4.5, inputs.glideSlope || 3)) * (Math.PI / 180);
      const fiftyFeet = 50 / FEET_PER_METRE;
      extraAirTime =
        AUTOLAND_EXTRA_AIR_TIME +
        (fiftyFeet / Math.tan(glideSlope) - fiftyFeet / Math.tan((3 * Math.PI) / 180)) / groundSpeed;
    }
    const extraGroundTime =
      (autobrake !== undefined ? AUTOBRAKE_DELAY : 0) +
      (inputs.type === LandingComputationType.InFlight && weight > this.mlw ? OVERWEIGHT_BRAKING_DELAY : 0);

    const reference = this.modelDistance(
      (vlsFull * MPS_PER_KNOT) / Math.sqrt(densityRatio(pressureAlt, landingIsaTemperature(pressureAlt))),
      DRY_DECELERATION,
      0,
      0,
    );
    const actual = this.modelDistance(groundSpeed, deceleration, extraAirTime, extraGroundTime);
    return (this.chartActualDistance(weight, pressureAlt) * actual) / reference;
  }

  /**
   * The required landing distance of the DISPATCH computation (PER-LND-GEN Landing distance definitions): dry ALD / 0.6,
   * wet x 1.15, contaminated the greater of the wet RLD and the contaminated ALD x 1.15; autoland the greater of its ALD
   * x 1.15 and the manual RLD.
   */
  private requiredLandingDistance(
    inputs: LandingPerformanceInputs,
    weight: number,
    conf: LandingConf.Conf3 | LandingConf.Full,
  ): number {
    const manual = { ...inputs, autoland: false };
    const dryRld = this.actualLandingDistance(manual, weight, conf, undefined, true) * DRY_DISPATCH_FACTOR;
    let rld = dryRld;
    if (inputs.runwayCondition !== LandingRunwayCondition.Dry) {
      rld = dryRld * WET_FACTOR;
      if (inputs.runwayCondition !== LandingRunwayCondition.Wet) {
        rld = Math.max(rld, this.actualLandingDistance(manual, weight, conf) * WET_FACTOR);
      }
    }
    if (inputs.autoland) {
      rld = Math.max(rld, this.actualLandingDistance(inputs, weight, conf) * WET_FACTOR);
    }
    return rld;
  }

  /** The highest weight of the landing distance (LDA) and approach climb (ACG) requirements, by bisection */
  private mlwPerf(inputs: LandingPerformanceInputs, c: ConfCase): { weight: number; limitation: LandingLimitation } {
    const inFlight = inputs.type === LandingComputationType.InFlight;
    const distanceOk = (w: number) =>
      (inFlight
        ? this.actualLandingDistance(inputs, w, c.conf, inputs.brakingMode)
        : this.requiredLandingDistance(inputs, w, c.conf)) <= inputs.lda;
    const gradientOk = (w: number) => this.goAroundGradient(inputs, w, c) >= inputs.goAroundGradient;
    const limitOf = (ok: (w: number) => boolean) => {
      let low = 200_000;
      let high = 700_000;
      if (ok(high)) {
        return high;
      }
      if (!ok(low)) {
        return low;
      }
      while (high - low > 10) {
        const mid = (low + high) / 2;
        if (ok(mid)) {
          low = mid;
        } else {
          high = mid;
        }
      }
      return low;
    };
    const lda = limitOf(distanceOk);
    const acg = limitOf(gradientOk);
    return lda <= acg
      ? { weight: lda, limitation: LandingLimitation.Lda }
      : { weight: acg, limitation: LandingLimitation.ApproachClimb };
  }

  /** Whether the landing distance is the one of the chart: dispatch, dry, manual landing in FULL at VLS, no wind */
  private isChartDistance(
    inputs: LandingPerformanceInputs,
    weight: number,
    pressureAlt: number,
    conf: LandingConf,
    speedIncrement: number,
  ): boolean {
    return (
      inputs.type === LandingComputationType.Dispatch &&
      inputs.runwayCondition === LandingRunwayCondition.Dry &&
      !inputs.autoland &&
      conf === LandingConf.Full &&
      speedIncrement === 0 &&
      inputs.headwind === 0 &&
      pressureAlt >= 0 &&
      pressureAlt <= this.maxPressureAlt &&
      weight >= LFL_WEIGHTS[0] * 1000 &&
      weight <= LFL_WEIGHTS[LFL_WEIGHTS.length - 1] * 1000
    );
  }
}
