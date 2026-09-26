//  Copyright (c) 2024 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

export type LineupAngle = 0 | 90 | 180;

export enum RunwayCondition {
  Dry = 'Dry',
  Wet = 'Wet',
  Contaminated6mmWater = 'Contaminated6mmWater',
  Contaminated13mmWater = 'Contaminated13mmWater',
  Contaminated6mmSlush = 'Contaminated6mmSlush',
  Contaminated13mmSlush = 'Contaminated13mmSlush',
  ContaminatedCompactedSnow = 'ContaminatedCompactedSnow',
  Contaminated5mmWetSnow = 'Contaminated5mmWetSnow',
  Contaminated15mmWetSnow = 'Contaminated15mmWetSnow',
  Contaminated30mmWetSnow = 'Contaminated30mmWetSnow',
  Contaminated10mmDrySnow = 'Contaminated10mmDrySnow',
  Contaminated100mmDrySnow = 'Contaminated100mmDrySnow',
}

export interface LimitWeight {
  /** base limit at sea level, ISA etc. in kg. */
  baseLimit: number;
  /** slope correction in kg. */
  deltaSlope: number;
  /** limit with slope correction applied. */
  slopeLimit: number;
  /** pressure altitude correction in kg. */
  deltaAlt: number;
  /** limit with slope and pressure altitude corrections applied. */
  altLimit: number;

  /** bleed correction in kg. */
  deltaBleed: number;

  /** temperature correction in kg. */
  oatDeltaTemp: number;
  /** wind correction in kg. */
  oatDeltaWind: number;
  /** temperature correction in kg. */
  tRefDeltaTemp: number;
  /** wind correction in kg. */
  tRefDeltaWind: number;
  /** temperature correction in kg. */
  tMaxDeltaTemp: number;
  /** wind correction in kg. */
  tMaxDeltaWind: number;
  /** temperature correction in kg. */
  tFlexMaxDeltaTemp: number;
  /** wind correction in kg. */
  tFlexMaxDeltaWind: number;

  /** OAT limit weight in kg. */
  oatLimit: number;
  /** OAT limit weight in kg with no bleeds. */
  oatLimitNoBleed: number;
  /** Tref limit weight in kg. */
  tRefLimit: number;
  /** Tref limit weight in kg with no bleeds. */
  tRefLimitNoBleed: number;
  /** Tmax limit weight in kg. */
  tMaxLimit: number;
  /** Tmax limit weight in kg with no bleeds. */
  tMaxLimitNoBleed: number;
  /** Tflexmax limit weight in kg. */
  tFlexMaxLimit: number;
  /** Tflexmax limit weight in kg with no bleeds. */
  tFlexMaxLimitNoBleed: number;
}

export enum LimitingFactor {
  Runway = 'Runway',
  SecondSegment = 'Second Segment',
  BrakeEnergy = 'Brake Energy',
  Vmcg = 'VMCG',
}

export enum TakeoffAntiIceSetting {
  Off,
  Engine,
  EngineWing,
}

export interface TakeoffPerformanceInputs {
  /** Takeoff weight in kg. */
  tow: number;
  /** Whether the plane has a "forward" cg. */
  forwardCg: boolean;
  /** Actual CG as % MAC. */
  cg?: number;
  /** Config (flaps). */
  conf: number;
  /** Takeoff run available in metres. */
  tora: number;
  /** Runway slope in %. */
  slope: number;
  /** Lineup angle in degrees. */
  lineupAngle: LineupAngle;
  /** Wind in knots of headwind (i.e. tailwind is negative). */
  wind: number;
  /** Runway elevation in feet. */
  elevation: number;
  /** QNH in hPa. */
  qnh: number;
  /** Outside air temp in °C. */
  oat: number;
  /** Anti-ice configuration. */
  antiIce: TakeoffAntiIceSetting;
  /** Whether the packs will be on. */
  packs: boolean;
  /** Whether to force TOGA thrust (do not calculate flex). */
  forceToga: boolean;
  /** The runway condition (e.g. dry/wet/contaminated..). */
  runwayCondition: RunwayCondition;
}

export interface TakeoffPerformanceParameters {
  /** TORA adjusted for lineup angle, in metres. */
  adjustedTora: number;
  /** Pressure altitude in feet. */
  pressureAlt: number;
  /** ISA temperature in °C. */
  isaTemp: number;
  /** Tref in °C. */
  tRef: number;
  /** Tmax in °C. */
  tMax: number;
  /** Tflex,max in °C */
  tFlexMax: number;
  /** Headwind, limited to the maximum possible. */
  headwind: number;
  /** The factor limiting the flex temp. */
  flexLimitingFactor?: LimitingFactor;
}

export interface TakeoffPerformanceSpeeds {
  dryV2: number;
  v2Table1NoWind?: number;
  v2Table2Threshold: number;
  v2Base: number;
  v2DeltaRunway: number;
  v2DeltaAlt: number;
  v2DeltaSlope: number;
  v2DeltaWind: number;
  dryVR: number;
  vRBase: number;
  vRDeltaRunway: number;
  vRDeltaAlt: number;
  vRDeltaSlope: number;
  vRDeltaWind: number;
  dryV1: number;
  v1Table2?: number;
  v1Base: number;
  v1DeltaRunway: number;
  v1DeltaAlt: number;
  v1DeltaSlope: number;
  v1DeltaWind: number;
}

/** The results that a calculator can give as estimates rather than from the aircraft manufacturer data. */
export enum TakeoffPerformanceEstimate {
  /** The FLEX temperature. */
  Flex = 'Flex',
  /** V1. */
  V1 = 'V1',
  /** VR. */
  VR = 'VR',
  /** V2, when raised to a minimum that is not manufacturer data. */
  V2 = 'V2',
  /** The weights and speeds include a wind correction. */
  Wind = 'Wind',
  /** The weights and speeds include a runway slope correction. */
  Slope = 'Slope',
  /** The OAT is above the temperatures of the manufacturer data. */
  Temperature = 'Temperature',
}

export interface TakeoffPerformanceResult {
  /** User inputs. */
  inputs: TakeoffPerformanceInputs;
  /** Initial parameters calculated from user inputs. */
  params: TakeoffPerformanceParameters;

  // results
  error: TakeoffPerfomanceError;
  flex?: number;
  mtow?: number;
  asd?: number;
  stabTrim?: number;
  v1?: number;
  vR?: number;
  v2?: number;

  // intermediate values
  tvmcg?: number;

  limits?: Record<LimitingFactor, LimitWeight>;

  oatLimitingFactor?: LimitingFactor;
  tRefLimitingFactor?: LimitingFactor;
  tMaxLimitingFactor?: LimitingFactor;
  tFlexMaxLimitingFactor?: LimitingFactor;

  intermediateSpeeds?: TakeoffPerformanceSpeeds;

  /** The results that are estimates, for the calculators that tell them apart from the manufacturer data. */
  estimates?: TakeoffPerformanceEstimate[];
}

/**
 * The runway distances of a takeoff at one thrust setting, in metres from the start of the takeoff run (the line-up
 * allowance excluded), for the calculators that can give them.
 */
export interface TakeoffRunwayDistances {
  /** The FLEX temperature of the distances in °C, or undefined for TOGA. */
  flex: number | undefined;
  /** The runway length available for the takeoff run: the TORA without the line-up allowance. */
  available: number;
  /**
   * The runway length the takeoff needs: the takeoff length of the manufacturer charts, with all the regulatory
   * limitations and margins. Undefined when it is longer than the data.
   */
  required: number | undefined;
  /** The required length is an estimate, not manufacturer data. */
  requiredEstimated: boolean;
  /** The required length is shorter than the data, which gives no shorter length: only a maximum. */
  requiredBelowData: boolean;
  /** The shortest runway length of the data, in metres. */
  shortestDataLength: number;
  /** Estimated distances (all engines) where V1 and VR are reached, and where the aircraft reaches 35 ft. */
  v1?: number;
  vr?: number;
  screenHeight?: number;
}

/**
 * Estimated distances of the all-engine takeoff run, from the required takeoff length: the all-engine distance to 35 ft
 * is at most the required length / 1.15 (CS 25.113), reached at V2 + 10 kt (Airbus SRS all-engine target), with a
 * constant acceleration.
 * @param required required takeoff length in metres
 * @param v1 V1, VR and V2 in knots (CAS)
 * @param pressureAlt airfield pressure altitude in feet
 * @param oat outside air temperature in °C
 * @param headwind headwind component in knots
 */
export function estimateTakeoffRunDistances(
  required: number,
  v1: number | undefined,
  vr: number | undefined,
  v2: number,
  pressureAlt: number,
  oat: number,
  headwind: number,
): Pick<TakeoffRunwayDistances, 'v1' | 'vr' | 'screenHeight'> {
  const pressureRatio = (1 - 6.8755856e-6 * pressureAlt) ** 5.2558797;
  const densityRatio = pressureRatio / ((oat + 273.15) / 288.15);
  const groundSpeed = (cas: number) => Math.max(1, cas / Math.sqrt(densityRatio) - headwind);
  const screenHeight = required / 1.15;
  const atScreenHeight = groundSpeed(v2 + 10);
  const at = (cas: number | undefined) =>
    cas !== undefined ? screenHeight * (groundSpeed(cas) / atScreenHeight) ** 2 : undefined;
  return { screenHeight, v1: at(v1), vr: at(vr) };
}

// Note: these are keys in the localisations for the EFB (except none).
export enum TakeoffPerfomanceError {
  None = 'None',
  InvalidData = 'InvalidData',
  OperatingEmptyWeight = 'OperatingEmptyWeight',
  StructuralMtow = 'StructuralMtow',
  MaximumPressureAlt = 'MaximumPressureAlt',
  MaximumTemperature = 'MaximumTemperature',
  CgOutOfLimits = 'CgOutOfLimits',
  VmcgVmcaLimits = 'VmcgVmcaLimits',
  MaximumTireSpeed = 'MaximumTireSpeed',
  MaximumTailwind = 'MaximumTailwind',
  MaximumRunwaySlope = 'MaximumRunwaySlope',
  TooHeavy = 'TooHeavy',
  TooLight = 'TooLight',
  /** The runway condition is not covered by the performance data. */
  RunwayConditionNotSupported = 'RunwayConditionNotSupported',
  /** The runway is shorter than the performance data. */
  RunwayLengthOutsideData = 'RunwayLengthOutsideData',
}

export interface TakeoffPerformanceCalculator {
  /**
   * Performs a complete takeoff performance calculation for the EFB.
   * @param tow takeoff weight in kilograms.
   * @param cg takeoff centre of gravity in % MAC.
   * @param conf takeoff flap configuration (e.g. 1, 2, 3).
   * @param tora takeoff run available in metres.
   * @param slope runway slope in percent, -ve downhill.
   * @param lineupAngle the approach angle to the runway takeoff position.
   * @param wind wind component in the runway direction in knots, -ve tailwind.
   * @param elevation runway elevation in feet.
   * @param qnh outside air pressure in hectopascals.
   * @param oat outside air temperature in °C.
   * @param antiIce whether wing anti-ice is on.
   * @param packs whether packs are on.
   * @param out an object to write the results to. A new object will be created if not provided.
   */
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
  ): TakeoffPerformanceResult;

  /**
   * Performs a complete takeoff performance calculation for the EFB, determining the optimum config.
   * @param tow takeoff weight in kilograms.
   * @param cg takeoff centre of gravity in % MAC.
   * @param tora takeoff run available in metres.
   * @param slope runway slope in percent, -ve downhill.
   * @param lineupAngle the approach angle to the runway takeoff position.
   * @param wind wind component in the runway direction in knots, -ve tailwind.
   * @param elevation runway elevation in feet.
   * @param qnh outside air pressure in hectopascals.
   * @param oat outside air temperature in °C.
   * @param antiIce whether wing anti-ice is on.
   * @param packs whether packs are on.
   * @param out an object to write the results to. A new object will be created if not provided.
   */
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
  ): TakeoffPerformanceResult;

  /**
   * Checks if a TOCG is within the limits.
   * @param cg The TOCG to check.
   * @param tow The takeoff weight to check for.
   * @returns true if within limits.
   */
  isCgWithinLimits(cg: number, tow: number): boolean;

  /**
   * Gets the maximum crosswind limit for a given runway condition and outside temperature.
   * @param runwayCondition The runway condition to check.
   * @param oat Outside air temperature in °C.
   * @returns max crosswind in knots.
   */
  getCrosswindLimit(runwayCondition: RunwayCondition, oat: number): number;

  /** Structural MTOW in kg. */
  readonly structuralMtow: number;

  /** Maximum pressure alt in feet. */
  readonly maxPressureAlt: number;

  /** OEW in kg. */
  readonly oew: number;

  /** Maximum headwind in knots. */
  readonly maxHeadwind: number;

  /** Maximum tailwind in knots. */
  readonly maxTailwind: number;

  /**
   * For the calculators that can give them: the runway distances of a calculated takeoff, at TOGA or at a FLEX
   * temperature (for a FLEX lower than the maximum one of the result, a FLEX simulation). Undefined when the result
   * has an error, or the FLEX temperature is outside the possible range.
   */
  calculateTakeoffDistances?(
    result: TakeoffPerformanceResult,
    flex: number | undefined,
  ): TakeoffRunwayDistances | undefined;
}
