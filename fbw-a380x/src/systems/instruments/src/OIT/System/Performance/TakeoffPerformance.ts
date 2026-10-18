// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  RunwayCondition,
  TakeoffAntiIceSetting,
  TakeoffPerfomanceError,
  TakeoffPerformanceCalculator,
  TakeoffPerformanceResult,
} from '@flybywiresim/fbw-sdk';
import { PerformanceRunway } from './PerformanceRunways';
import { RunwayWind, WindEntry, missingParameterErrors, runwayWind } from './PerformanceEntries';

/*
 * T.O PERF: the CONDITIONS panel options, the missing parameters of the ERROR list, and the computation of the
 * RESULTS panel with the A380 takeoff performance calculator.
 */

/** RWY COND list of the CONDITIONS panel */
export const TAKEOFF_RUNWAY_CONDITIONS: readonly { readonly label: string; readonly condition: RunwayCondition }[] = [
  { label: 'Dry', condition: RunwayCondition.Dry },
  { label: 'Wet', condition: RunwayCondition.Wet },
  { label: 'Water 1/4" (6.3 mm)', condition: RunwayCondition.Contaminated6mmWater },
  { label: 'Water 1/2" (12.7 mm)', condition: RunwayCondition.Contaminated13mmWater },
  { label: 'Slush 1/4" (6.3 mm)', condition: RunwayCondition.Contaminated6mmSlush },
  { label: 'Slush 1/2" (12.7 mm)', condition: RunwayCondition.Contaminated13mmSlush },
  { label: 'Compacted snow', condition: RunwayCondition.ContaminatedCompactedSnow },
];

/** A-ICE list of the CONDITIONS panel */
export const TAKEOFF_ANTI_ICE_OPTIONS: readonly { readonly label: string; readonly setting: TakeoffAntiIceSetting }[] =
  [
    { label: 'Off', setting: TakeoffAntiIceSetting.Off },
    { label: 'Engine only', setting: TakeoffAntiIceSetting.Engine },
    { label: 'Engine & Wing', setting: TakeoffAntiIceSetting.EngineWing },
  ];

/** CONF list: the optimum configuration (the standard), or a given flap setting (1 = 1+F) */
export const TAKEOFF_CONF_OPTIONS: readonly { readonly label: string; readonly conf: number | null }[] = [
  { label: 'OPT CONF (STD)', conf: null },
  { label: 'CONF 1+F', conf: 1 },
  { label: 'CONF 2', conf: 2 },
  { label: 'CONF 3', conf: 3 },
];

/** AIR COND list: the packs on (the standard) or off */
export const TAKEOFF_AIR_COND_OPTIONS: readonly { readonly label: string; readonly packs: boolean }[] = [
  { label: 'On (STD)', packs: true },
  { label: 'Off', packs: false },
];

export type TakeoffThrustOption =
  | { readonly kind: 'FLEX' }
  | { readonly kind: 'TOGA' }
  | { readonly kind: 'DERATE'; readonly level: number }
  | { readonly kind: 'OPTIMUM DERATE' };

/**
 * The THRUST list: FLEX (the standard), TOGA, the derate levels of the calculator, OPTIMUM DERATE.
 * @param derateLevels the derate levels of the calculator, as their thrust reduction in percent
 * @returns the options with their labels
 */
export function takeoffThrustOptions(
  derateLevels: readonly number[],
): { readonly label: string; readonly option: TakeoffThrustOption }[] {
  const options: { label: string; option: TakeoffThrustOption }[] = [
    { label: 'FLEX (STD)', option: { kind: 'FLEX' } },
    { label: 'TOGA', option: { kind: 'TOGA' } },
  ];
  derateLevels.forEach((level) => options.push({ label: derateLabel(level), option: { kind: 'DERATE', level } }));
  options.push({ label: 'OPTIMUM DERATE', option: { kind: 'OPTIMUM DERATE' } });
  return options;
}

/**
 * @param level a derate level as its thrust reduction in percent
 * @returns its label, e.g. D04, D24
 */
function derateLabel(level: number): string {
  return `D${level.toFixed(0).padStart(2, '0')}`;
}

/** The entries of the CONDITIONS panel; null for an empty field */
export interface TakeoffConditions {
  readonly wind: WindEntry | null;
  readonly oat: number | null;
  readonly qnh: number | null;
  /** Index in TAKEOFF_RUNWAY_CONDITIONS */
  readonly runwayCondition: number | null;
  /** Index in TAKEOFF_ANTI_ICE_OPTIONS */
  readonly antiIce: number | null;
  /** Takeoff weight in kg */
  readonly tow: number | null;
  /** Index in TAKEOFF_CONF_OPTIONS */
  readonly conf: number;
  /** Index in TAKEOFF_AIR_COND_OPTIONS */
  readonly airCond: number;
  readonly thrust: TakeoffThrustOption;
}

/**
 * The missing parameters of the ERROR list, in the order of the panel.
 * @param conditions the CONDITIONS panel
 * @param runway the selected runway, or null
 * @returns the names of the missing parameters (WIND, OAT, QNH, RWY COND, A-ICE, TOW, RWY)
 */
export function missingTakeoffParameters(conditions: TakeoffConditions, runway: PerformanceRunway | null): string[] {
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
  if (conditions.tow === null) {
    missing.push('TOW');
  }
  if (runway === null) {
    missing.push('RWY');
  }
  return missing;
}

/** The thrust of the RESULTS panel */
export type TakeoffResultThrust =
  | { readonly kind: 'TOGA' }
  | { readonly kind: 'FLEX'; readonly temperature: number }
  | { readonly kind: 'DERATE'; readonly level: number };

/** The RESULTS panel of a SINGLE RWY COMPUTATION */
export interface TakeoffResults {
  readonly runway: string;
  /** Weights in kg */
  readonly tow: number;
  readonly mtowPerf: number | null;
  /** Speeds in knots, null when the TOW is not possible */
  readonly v1: number | null;
  readonly vr: number | null;
  readonly v2: number | null;
  /** The selected or optimum flap configuration, 1 = 1+F */
  readonly flaps: number;
  readonly thrust: TakeoffResultThrust;
  /** Runway length left after the required takeoff length, metres, or null when not known */
  readonly stopMargin: number | null;
  /** Takeoff shift, metres */
  readonly takeoffShift: number;
  /** Engine-out acceleration altitude, feet */
  readonly engineOutAcceleration: number;
  /** The thrust reversers are not credited on dry and wet runways */
  readonly reverseThrustCredit: boolean;
  /** The QNH of the computation, hPa (for XCHECK WITH AVNCS) */
  readonly qnh: number;
}

/** A computation: the results, or the errors that prevent them */
export interface TakeoffComputation {
  readonly results: TakeoffResults | null;
  readonly errors: string[];
}

/**
 * Design choice: the engine-out acceleration altitude is the runway elevation + 1500 ft, the minimum the FMS takes
 * for it (the calculator has no obstacle data to raise it).
 */
const ENGINE_OUT_ACCELERATION_HEIGHT = 1500;

/** The line-up allowance of the computation: a 180° turn on the runway, the longest one */
export const TAKEOFF_ENTRY_ANGLE = 180;

/** The thrust reversers are credited on contaminated runways only */
const NO_REVERSE_CREDIT_CONDITIONS = [RunwayCondition.Dry, RunwayCondition.Wet];

/**
 * @param error a calculator error
 * @returns the line of the ERROR list
 */
function takeoffErrorText(error: TakeoffPerfomanceError): string {
  switch (error) {
    case TakeoffPerfomanceError.StructuralMtow:
      return 'TOW above the maximum structural takeoff weight';
    case TakeoffPerfomanceError.OperatingEmptyWeight:
      return 'TOW below the operating empty weight';
    case TakeoffPerfomanceError.MaximumPressureAlt:
      return 'Airport pressure altitude above the maximum';
    case TakeoffPerfomanceError.MaximumTemperature:
      return 'OAT above the maximum takeoff temperature';
    case TakeoffPerfomanceError.MaximumTailwind:
      return 'Tailwind above the maximum';
    case TakeoffPerfomanceError.MaximumRunwaySlope:
      return 'Runway slope above the maximum';
    case TakeoffPerfomanceError.RunwayConditionNotSupported:
      return 'RWY COND not available in the performance database';
    case TakeoffPerfomanceError.RunwayLengthOutsideData:
      return 'Runway length outside the performance database';
    case TakeoffPerfomanceError.TooHeavy:
      return 'TOW above MTOW(perf)';
    case TakeoffPerfomanceError.CgOutOfLimits:
      return 'CG out of limits';
    default:
      return 'Computation not possible';
  }
}

/**
 * The thrust option the TOW permits with OPTIMUM DERATE: the derate level with the highest MTOW(perf), TOGA included;
 * the shallowest of equal ones, because a deeper level than the one with the highest MTOW(perf) is not permitted.
 * @param result a TOGA computation
 * @returns the level (thrust reduction in percent), or null for TOGA
 */
export function optimumDerateLevel(result: TakeoffPerformanceResult): number | null {
  let best: { level: number | null; mtow: number } = { level: null, mtow: result.mtow ?? 0 };
  for (const derate of result.derates ?? []) {
    if (derate.mtow > best.mtow) {
      best = { level: derate.level, mtow: derate.mtow };
    }
  }
  return best.level;
}

/**
 * Computes the RESULTS panel.
 * @param calculator the takeoff performance calculator
 * @param conditions the CONDITIONS panel, without missing parameters
 * @param runway the selected runway
 * @returns the results, or the errors of the ERROR list
 */
export function computeTakeoffPerformance(
  calculator: TakeoffPerformanceCalculator,
  conditions: TakeoffConditions,
  runway: PerformanceRunway,
): TakeoffComputation {
  const missing = missingTakeoffParameters(conditions, runway);
  if (missing.length > 0) {
    return { results: null, errors: missingParameterErrors(missing) };
  }
  const wind = runwayWind(conditions.wind!, runway.magneticBearing) as RunwayWind;
  const oat = conditions.oat!;
  const qnh = conditions.qnh!;
  const tow = conditions.tow!;
  const runwayCondition = TAKEOFF_RUNWAY_CONDITIONS[conditions.runwayCondition!].condition;
  const antiIce = TAKEOFF_ANTI_ICE_OPTIONS[conditions.antiIce!].setting;
  const packs = TAKEOFF_AIR_COND_OPTIONS[conditions.airCond].packs;
  const conf = TAKEOFF_CONF_OPTIONS[conditions.conf].conf;

  const crosswind = Math.abs(wind.gustCrosswind ?? wind.crosswind ?? 0);
  if (crosswind > calculator.getCrosswindLimit(runwayCondition, oat)) {
    return { results: null, errors: ['Crosswind above the maximum demonstrated crosswind'] };
  }

  // FLEX is only computed for the FLEX and OPTIMUM DERATE options (OPTIMUM DERATE shows TFLEX when TOGA is optimum)
  const thrust = conditions.thrust;
  const forceToga = thrust.kind === 'TOGA' || thrust.kind === 'DERATE';
  const args = [
    runway.takeoffLength,
    runway.slope,
    TAKEOFF_ENTRY_ANGLE,
    wind.headwind,
    runway.elevation,
    qnh,
    oat,
    antiIce,
    packs,
    forceToga,
    runwayCondition,
  ] as const;
  const result =
    conf !== null
      ? calculator.calculateTakeoffPerformance(tow, false, conf, ...args)
      : calculator.calculateTakeoffPerformanceOptConf(tow, false, ...args);

  if (result.error !== TakeoffPerfomanceError.None && result.error !== TakeoffPerfomanceError.TooHeavy) {
    return { results: null, errors: [takeoffErrorText(result.error)] };
  }

  const base = {
    runway: runway.ident,
    tow,
    flaps: result.inputs.conf,
    takeoffShift: 0,
    engineOutAcceleration: Math.round(runway.elevation) + ENGINE_OUT_ACCELERATION_HEIGHT,
    reverseThrustCredit: !NO_REVERSE_CREDIT_CONDITIONS.includes(runwayCondition),
    qnh,
  };
  const noSpeeds = { v1: null, vr: null, v2: null, stopMargin: null };

  if (result.error === TakeoffPerfomanceError.TooHeavy) {
    return {
      results: { ...base, ...noSpeeds, mtowPerf: result.mtow ?? null, thrust: { kind: 'TOGA' } },
      errors: [takeoffErrorText(result.error)],
    };
  }

  let derateLevel: number | null = null;
  if (thrust.kind === 'DERATE') {
    derateLevel = thrust.level;
  } else if (thrust.kind === 'OPTIMUM DERATE') {
    derateLevel = optimumDerateLevel(result);
  }

  if (derateLevel !== null) {
    const derated = result.derates?.find((d) => d.level === derateLevel);
    if (derated === undefined) {
      return {
        results: { ...base, ...noSpeeds, mtowPerf: null, thrust: { kind: 'DERATE', level: derateLevel } },
        errors: [`TOW above MTOW(perf) for ${derateLabel(derateLevel)}`],
      };
    }
    const distances = calculator.calculateTakeoffDistances?.(result, undefined, derateLevel);
    return {
      results: {
        ...base,
        mtowPerf: derated.mtow,
        v1: derated.v1,
        vr: derated.vR,
        v2: derated.v2,
        thrust: { kind: 'DERATE', level: derateLevel },
        stopMargin: stopMargin(distances?.available, distances?.required),
      },
      errors: [],
    };
  }

  const flex = !forceToga && result.flex !== undefined ? result.flex : undefined;
  const distances = calculator.calculateTakeoffDistances?.(result, flex);
  return {
    results: {
      ...base,
      mtowPerf: result.mtow ?? null,
      v1: result.v1 ?? null,
      vr: result.vR ?? null,
      v2: result.v2 ?? null,
      thrust: flex !== undefined ? { kind: 'FLEX', temperature: flex } : { kind: 'TOGA' },
      stopMargin: stopMargin(distances?.available, distances?.required),
    },
    errors: [],
  };
}

/**
 * Design choice: the calculator has no accelerate-stop distance; the stop margin shown is the runway length left
 * after the required takeoff length of the charts, which include the accelerate-stop limitation.
 * @param available the runway length available, metres
 * @param required the required takeoff length, metres
 * @returns the margin in metres, or null when not known
 */
function stopMargin(available: number | undefined, required: number | undefined): number | null {
  return available !== undefined && required !== undefined ? Math.max(0, available - required) : null;
}

/**
 * @param thrust the thrust of the results
 * @returns the thrust label of the RESULTS panel: TOGA, FLEX 45, D08
 */
export function takeoffThrustLabel(thrust: TakeoffResultThrust): string {
  switch (thrust.kind) {
    case 'FLEX':
      return `FLEX ${thrust.temperature.toFixed(0)}`;
    case 'DERATE':
      return derateLabel(thrust.level);
    default:
      return 'TOGA';
  }
}

/**
 * @param flaps a takeoff flap configuration (1 = 1+F)
 * @returns its label on the RESULTS panel
 */
export function takeoffFlapsLabel(flaps: number): string {
  return flaps === 1 ? '1+F' : flaps.toFixed(0);
}
