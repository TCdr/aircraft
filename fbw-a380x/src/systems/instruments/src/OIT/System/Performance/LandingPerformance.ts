// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  LandingAntiIce,
  LandingApproachType,
  LandingBrakingMode,
  LandingComputationType,
  LandingConf,
  LandingGoAroundConf,
  LandingLimitation,
  LandingPerformanceCalculator,
  LandingPerformanceError,
  LandingRunwayCondition,
} from '@flybywiresim/fbw-sdk';
import { PerformanceRunway } from './PerformanceRunways';
import { RunwayWind, WindEntry, missingParameterErrors, runwayWind } from './PerformanceEntries';

/*
 * LDG PERF: the CONDITIONS panel options, the missing parameters of the ERROR list, and the computation of the
 * RESULTS panel with the A380 landing performance calculator, in DISPATCH or IN-FLIGHT mode.
 */

/** COMPUTATION list */
export const LANDING_COMPUTATION_OPTIONS: readonly { readonly label: string; readonly type: LandingComputationType }[] =
  [
    { label: 'IN-FLIGHT', type: LandingComputationType.InFlight },
    { label: 'DISPATCH', type: LandingComputationType.Dispatch },
  ];

/** RWY COND list: the runway conditions of the landing performance data */
export const LANDING_RUNWAY_CONDITIONS: readonly {
  readonly label: string;
  readonly condition: LandingRunwayCondition;
}[] = [
  { label: 'Dry', condition: LandingRunwayCondition.Dry },
  { label: 'Wet', condition: LandingRunwayCondition.Wet },
  { label: 'Water 1/4" (6.3 mm)', condition: LandingRunwayCondition.Water6mm },
  { label: 'Water 1/2" (12.7 mm)', condition: LandingRunwayCondition.Water13mm },
  { label: 'Slush 1/4" (6.3 mm)', condition: LandingRunwayCondition.Slush6mm },
  { label: 'Slush 1/2" (12.7 mm)', condition: LandingRunwayCondition.Slush13mm },
  { label: 'Compacted snow', condition: LandingRunwayCondition.CompactedSnow },
  { label: 'Ice', condition: LandingRunwayCondition.Icy },
];

/** A-ICE list */
export const LANDING_ANTI_ICE_OPTIONS: readonly { readonly label: string; readonly antiIce: LandingAntiIce }[] = [
  { label: 'Off', antiIce: LandingAntiIce.Off },
  { label: 'Engine only', antiIce: LandingAntiIce.Engine },
  { label: 'Engine & Wing', antiIce: LandingAntiIce.EngineWing },
];

/** LDG CONF list: CONF FULL is the standard */
export const LANDING_CONF_OPTIONS: readonly { readonly label: string; readonly conf: LandingConf }[] = [
  { label: 'CONF FULL (STD)', conf: LandingConf.Full },
  { label: 'CONF 3', conf: LandingConf.Conf3 },
  { label: 'AUTO CONF', conf: LandingConf.Auto },
];

/** GA CONF list of an overweight landing in CONF 3 */
export const LANDING_GO_AROUND_CONF_OPTIONS: readonly {
  readonly label: string;
  readonly conf: LandingGoAroundConf;
}[] = [
  { label: 'CONF 2', conf: LandingGoAroundConf.Conf2 },
  { label: 'CONF 1+F', conf: LandingGoAroundConf.Conf1F },
];

/** AIR COND list */
export const LANDING_AIR_COND_OPTIONS: readonly { readonly label: string; readonly on: boolean }[] = [
  { label: 'On (STD)', on: true },
  { label: 'Off', on: false },
];

/** APPR TYPE list: Normal for CAT I, CAT II for CAT II and CAT III */
export const LANDING_APPROACH_TYPE_OPTIONS: readonly {
  readonly label: string;
  readonly type: LandingApproachType;
}[] = [
  { label: 'Normal (STD)', type: LandingApproachType.Normal },
  { label: 'CAT II', type: LandingApproachType.Cat2 },
];

/** LDG TECHNIQUE list */
export const LANDING_TECHNIQUE_OPTIONS: readonly { readonly label: string; readonly autoland: boolean }[] = [
  { label: 'Manual (STD)', autoland: false },
  { label: 'Autoland', autoland: true },
];

/** BRK MODE list (IN-FLIGHT; a DISPATCH computation always uses the manual braking) */
export const LANDING_BRAKING_OPTIONS: readonly { readonly label: string; readonly mode: LandingBrakingMode }[] = [
  { label: 'Manual (STD)', mode: LandingBrakingMode.Manual },
  { label: 'Lo', mode: LandingBrakingMode.Lo },
  { label: '2', mode: LandingBrakingMode.Two },
  { label: '3', mode: LandingBrakingMode.Three },
  { label: 'Hi', mode: LandingBrakingMode.Hi },
];

/** The glide slope of an autoland when the crew has not entered one, degrees */
const DEFAULT_GLIDE_SLOPE = 3;

/** The shortcut that inserts the minimum regulatory go-around gradient */
const MIN_GO_AROUND_GRADIENT_SHORTCUT = 'MIN';

/** The entries of the CONDITIONS panel; null for an empty field */
export interface LandingConditions {
  /** Index in LANDING_COMPUTATION_OPTIONS */
  readonly computation: number;
  readonly wind: WindEntry | null;
  readonly oat: number | null;
  readonly qnh: number | null;
  /** Index in LANDING_RUNWAY_CONDITIONS */
  readonly runwayCondition: number | null;
  /** Index in LANDING_ANTI_ICE_OPTIONS */
  readonly antiIce: number | null;
  /** Landing weight in kg */
  readonly lw: number | null;
  /** Index in LANDING_CONF_OPTIONS */
  readonly conf: number;
  /** Index in LANDING_GO_AROUND_CONF_OPTIONS (overweight landing in CONF 3) */
  readonly goAroundConf: number;
  /** Index in LANDING_AIR_COND_OPTIONS */
  readonly airCond: number;
  /** Index in LANDING_APPROACH_TYPE_OPTIONS */
  readonly approachType: number;
  /** The go-around gradient in %, null for the regulatory minimum */
  readonly goAroundGradient: number | null;
  /** VLS+ in knots, null for the default (the wind increment with the A/THR) */
  readonly speedIncrement: number | null;
  /** Index in LANDING_TECHNIQUE_OPTIONS */
  readonly technique: number;
  /** Glide slope of an autoland, degrees */
  readonly glideSlope: number | null;
  /** Index in LANDING_BRAKING_OPTIONS */
  readonly braking: number;
}

/**
 * @param conditions the CONDITIONS panel
 * @param runway the selected runway, or null
 * @returns the names of the missing parameters of the ERROR list, in the order of the panel
 */
export function missingLandingParameters(conditions: LandingConditions, runway: PerformanceRunway | null): string[] {
  const missing: string[] = [];
  if (conditions.wind === null) {
    missing.push('WIND');
  }
  if (conditions.oat === null) {
    missing.push('OAT');
  }
  if (conditions.qnh === null) {
    missing.push('QNH');
  }
  if (conditions.runwayCondition === null) {
    missing.push('RWY COND');
  }
  if (conditions.antiIce === null) {
    missing.push('A-ICE');
  }
  if (conditions.lw === null) {
    missing.push('LW');
  }
  if (runway === null) {
    missing.push('RWY');
  }
  return missing;
}

/**
 * @param conditions the CONDITIONS panel
 * @param mlw the certified maximum landing weight, kg
 * @returns whether the GA CONF field shows: an IN-FLIGHT overweight landing
 */
export function landingGoAroundConfShown(conditions: LandingConditions, mlw: number): boolean {
  return (
    LANDING_COMPUTATION_OPTIONS[conditions.computation].type === LandingComputationType.InFlight &&
    conditions.lw !== null &&
    conditions.lw > mlw
  );
}

/** The RESULTS panel */
export interface LandingResults {
  readonly runway: string;
  /** Weights in kg */
  readonly lw: number;
  readonly mlwPerf: number | null;
  readonly limitation: LandingLimitation | null;
  /** The landing configuration of the results */
  readonly flaps: LandingConf.Conf3 | LandingConf.Full;
  /** The go-around configuration of the results */
  readonly goAroundConf: LandingGoAroundConf | null;
  /** DISPATCH: the required landing distance, IN-FLIGHT: the actual landing distance; metres */
  readonly landingDistance: number | null;
  /** The actual landing distance, metres (MORE panel) */
  readonly actualLandingDistance: number | null;
  /** The landing distance available, metres */
  readonly runwayLength: number;
  /** LDA minus LDG DIST, metres */
  readonly stopMargin: number | null;
  readonly goAroundSpeed: number | null;
  /** % */
  readonly goAroundGradient: number | null;
  /** VAPP = VLS + this increment, knots */
  readonly speedIncrement: number;
  readonly vapp: number;
  readonly overweight: boolean;
  readonly reverseThrustCredit: boolean;
}

export interface LandingComputation {
  readonly results: LandingResults | null;
  readonly errors: string[];
}

/**
 * @param error a calculator error
 * @returns the line of the ERROR list
 */
function landingErrorText(error: LandingPerformanceError): string {
  switch (error) {
    case LandingPerformanceError.OperatingEmptyWeight:
      return 'LW below the operating empty weight';
    case LandingPerformanceError.MaximumLandingWeight:
      return 'LW above MLW: overweight landing computed IN-FLIGHT only';
    case LandingPerformanceError.MaximumTakeoffWeight:
      return 'LW above MTOW';
    case LandingPerformanceError.MaximumPressureAlt:
      return 'Airport pressure altitude above the maximum';
    case LandingPerformanceError.MaximumRunwaySlope:
      return 'Runway slope above the maximum';
    case LandingPerformanceError.RunwayCondition:
      return 'RWY COND not available in the performance database';
    default:
      return 'Computation not possible';
  }
}

/**
 * Computes the RESULTS panel.
 * @param calculator the landing performance calculator
 * @param conditions the CONDITIONS panel
 * @param runway the selected runway
 * @returns the results, or the errors of the ERROR list
 */
export function computeLandingPerformance(
  calculator: LandingPerformanceCalculator,
  conditions: LandingConditions,
  runway: PerformanceRunway,
): LandingComputation {
  const missing = missingLandingParameters(conditions, runway);
  if (missing.length > 0) {
    return { results: null, errors: missingParameterErrors(missing) };
  }
  const wind = runwayWind(conditions.wind!, runway.magneticBearing) as RunwayWind;
  const runwayCondition = LANDING_RUNWAY_CONDITIONS[conditions.runwayCondition!].condition;
  const oat = conditions.oat!;
  const crosswind = Math.abs(wind.gustCrosswind ?? wind.crosswind ?? 0);
  if (crosswind > calculator.crosswindLimit(runwayCondition, oat)) {
    return { results: null, errors: ['Crosswind above the maximum demonstrated crosswind'] };
  }
  const type = LANDING_COMPUTATION_OPTIONS[conditions.computation].type;
  const autoland = LANDING_TECHNIQUE_OPTIONS[conditions.technique].autoland;
  const goAroundConf = landingGoAroundConfShown(conditions, calculator.mlw)
    ? LANDING_GO_AROUND_CONF_OPTIONS[conditions.goAroundConf].conf
    : undefined;

  const result = calculator.calculateLandingPerformance({
    type,
    weight: conditions.lw!,
    conf: LANDING_CONF_OPTIONS[conditions.conf].conf,
    goAroundConf,
    lda: runway.landingLength,
    elevation: runway.elevation,
    slope: runway.slope,
    headwind: wind.headwind,
    crosswind,
    oat,
    qnh: conditions.qnh!,
    runwayCondition,
    antiIce: LANDING_ANTI_ICE_OPTIONS[conditions.antiIce!].antiIce,
    airConditioning: LANDING_AIR_COND_OPTIONS[conditions.airCond].on,
    approachType: LANDING_APPROACH_TYPE_OPTIONS[conditions.approachType].type,
    goAroundGradient: conditions.goAroundGradient ?? calculator.minGoAroundGradient ?? 0,
    speedIncrement: conditions.speedIncrement ?? undefined,
    autoland,
    glideSlope: conditions.glideSlope ?? DEFAULT_GLIDE_SLOPE,
    brakingMode:
      type === LandingComputationType.InFlight
        ? LANDING_BRAKING_OPTIONS[conditions.braking].mode
        : LandingBrakingMode.Manual,
    // The data credits the reversers on contaminated runways only (the MORE panel shows it)
    reverseThrust: true,
    overweightProcedure: false,
  });
  if (result.error !== LandingPerformanceError.None) {
    return { results: null, errors: [landingErrorText(result.error)] };
  }
  return {
    results: {
      runway: runway.ident,
      lw: conditions.lw!,
      mlwPerf: result.mlwPerf ?? null,
      limitation: result.limitation ?? null,
      flaps: result.conf,
      goAroundConf: result.goAroundConf ?? null,
      landingDistance: result.landingDistance ?? null,
      actualLandingDistance: result.actualLandingDistance ?? null,
      runwayLength: runway.landingLength,
      stopMargin: result.stopMargin ?? null,
      goAroundSpeed: result.goAroundSpeed ?? null,
      goAroundGradient: result.goAroundGradient ?? null,
      speedIncrement: result.speedIncrement,
      vapp: result.vapp,
      overweight: result.overweight,
      reverseThrustCredit: result.reverseCredit,
    },
    errors: [],
  };
}

/**
 * Parses the GA GRADIENT entry: a gradient in %, or MIN for the regulatory minimum.
 * @param text the entry
 * @param minimum the regulatory minimum, %
 * @returns the gradient (null for the minimum), or undefined for an invalid entry or one below the minimum
 */
export function parseGoAroundGradientEntry(text: string, minimum: number): number | null | undefined {
  const entry = text.trim().toUpperCase();
  if (entry === MIN_GO_AROUND_GRADIENT_SHORTCUT) {
    return null;
  }
  if (!/^\d{1,2}(\.\d)?$/.test(entry)) {
    return undefined;
  }
  const value = parseFloat(entry);
  return value >= minimum ? value : undefined;
}
