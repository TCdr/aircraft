// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { BtvLines } from './btvExits';

/**
 * The computation types of the Airbus landing performance application (A380 FCOM PER-LND-GEN, LDG PERF computation):
 * DISPATCH gives the required landing distance of the flight preparation, IN-FLIGHT the actual landing distance of the
 * landing to come.
 */
export enum LandingComputationType {
  Dispatch = 'DISPATCH',
  InFlight = 'IN_FLIGHT',
}

/**
 * The runway states and conditions of the landing performance data of both aircraft: each calculator lists the ones of
 * its manuals for each computation type ({@link LandingPerformanceCalculator.runwayConditions}).
 */
export enum LandingRunwayCondition {
  Dry = 'DRY',
  Wet = 'WET',
  WetGrooved = 'WET_GROOVED',
  /** 1/4 in (6.3 mm) of standing water */
  Water6mm = 'WATER_6MM',
  /** 1/2 in (12.7 mm) of standing water */
  Water13mm = 'WATER_13MM',
  Slush6mm = 'SLUSH_6MM',
  Slush13mm = 'SLUSH_13MM',
  CompactedSnow = 'COMPACTED_SNOW',
  DryWetSnow = 'DRY_WET_SNOW',
  Slush = 'SLUSH',
  StandingWater = 'STANDING_WATER',
  Icy = 'ICY',
  /** The runway condition codes of the in-flight landing distances (runway condition assessment matrix) */
  Good = 'GOOD',
  GoodToMedium = 'GOOD_TO_MEDIUM',
  Medium = 'MEDIUM',
  MediumToPoor = 'MEDIUM_TO_POOR',
  Poor = 'POOR',
}

/** The landing configuration: CONF 3, CONF FULL, or AUTO CONF (A380: FULL if its go-around gradient is sufficient) */
export enum LandingConf {
  Auto = 'AUTO',
  Conf3 = 'CONF_3',
  Full = 'FULL',
}

/** The go-around configuration (A380: CONF 3 after a landing in FULL, CONF 2 or CONF 1+F after a landing in CONF 3) */
export enum LandingGoAroundConf {
  Conf3 = 'CONF_3',
  Conf2 = 'CONF_2',
  Conf1F = 'CONF_1F',
}

/** The braking modes: manual (maximum braking), and the autobrake modes of each aircraft */
export enum LandingBrakingMode {
  Manual = 'MANUAL',
  /** A380 autobrake */
  Lo = 'LO',
  Two = '2',
  Three = '3',
  Hi = 'HI',
  /** A380 Brake To Vacate: the autobrake to the runway exit selected on the OANS (dry and wet runways) */
  Btv = 'BTV',
  /** A320 autobrake */
  Low = 'LOW',
  Medium = 'MED',
}

export enum LandingAntiIce {
  Off = 'OFF',
  Engine = 'ENGINE',
  EngineWing = 'ENGINE_WING',
}

/** Normal for a CAT I approach, CAT II for a CAT II or CAT III approach (A380 FCOM PER-LND-LCD-ACC Approach type) */
export enum LandingApproachType {
  Normal = 'NORMAL',
  Cat2 = 'CAT2',
}

/** The landing limitation codes (A380 FCOM PER-LND-LRD-DSR Landing limitation codes) */
export enum LandingLimitation {
  /** The landing weight is below the MLW(PERF) */
  Weight = 'WGT',
  /** The landing distance available */
  Lda = 'LDA',
  /** The approach climb gradient */
  ApproachClimb = 'ACG',
}

/** The results that come from an estimate rather than from the Airbus data (amber, with an asterisk) */
export enum LandingPerformanceEstimate {
  LandingDistance = 'LANDING_DISTANCE',
  GoAroundGradient = 'GO_AROUND_GRADIENT',
  MlwPerf = 'MLW_PERF',
}

export enum LandingPerformanceError {
  None = 'None',
  InvalidData = 'InvalidData',
  /** Below the operating empty weight */
  OperatingEmptyWeight = 'OperatingEmptyWeight',
  /** DISPATCH: above the certified MLW (an overweight landing is computed IN-FLIGHT only) */
  MaximumLandingWeight = 'MaximumLandingWeight',
  /** IN-FLIGHT: above the certified MTOW */
  MaximumTakeoffWeight = 'MaximumTakeoffWeight',
  MaximumPressureAlt = 'MaximumPressureAlt',
  MaximumTailwind = 'MaximumTailwind',
  MaximumRunwaySlope = 'MaximumRunwaySlope',
  /** The runway condition is not one of the computation type */
  RunwayCondition = 'RunwayCondition',
  /** IN-FLIGHT: BTV braking on a runway that is neither dry nor wet */
  BtvRunwayCondition = 'BtvRunwayCondition',
}

export interface LandingPerformanceInputs {
  type: LandingComputationType;
  /** Landing weight in kg */
  weight: number;
  conf: LandingConf;
  /** IN-FLIGHT overweight landing after a landing in CONF 3: the go-around configuration, when selected (A380) */
  goAroundConf?: LandingGoAroundConf;
  /** Landing distance available in metres */
  lda: number;
  /** Runway elevation in feet */
  elevation: number;
  /** Runway slope in %, negative downhill */
  slope: number;
  /** Wind component along the runway in knots, negative for a tailwind */
  headwind: number;
  /** Crosswind component in knots (absolute value) */
  crosswind: number;
  /** OAT in °C */
  oat: number;
  /** QNH in hPa */
  qnh: number;
  runwayCondition: LandingRunwayCondition;
  antiIce: LandingAntiIce;
  airConditioning: boolean;
  approachType: LandingApproachType;
  /** The go-around gradient to achieve, in % (the minimum is the regulatory one) */
  goAroundGradient: number;
  /** The altitude of the go-around gradient computation in feet, the runway elevation when undefined (A380) */
  goAroundAltitude?: number;
  /** VLS+: the speed increment on VLS in knots, the wind increment (A/THR ON) when undefined */
  speedIncrement?: number;
  autoland: boolean;
  /** The glide slope angle of an autoland, in degrees */
  glideSlope: number;
  /** IN-FLIGHT: the braking mode of the landing distance (DISPATCH: always manual) */
  brakingMode: LandingBrakingMode;
  /** Credit for the thrust reversers, where the data permits it (contaminated runways) */
  reverseThrust: boolean;
  /** A320 IN-FLIGHT: overweight landing procedure */
  overweightProcedure: boolean;
}

export interface LandingBrakingDistance {
  mode: LandingBrakingMode;
  /** Actual landing distance in metres */
  distance: number;
}

export interface LandingPerformanceResult {
  inputs: LandingPerformanceInputs;
  error: LandingPerformanceError;
  /** The landing configuration of the results (the one of AUTO CONF) */
  conf: LandingConf.Conf3 | LandingConf.Full;
  goAroundConf?: LandingGoAroundConf;
  /** Pressure altitude of the runway in feet */
  pressureAlt: number;
  isaTemp: number;
  /** VLS of the landing configuration at the landing weight, in knots */
  vls: number;
  /** The wind speed increment (1/3 of the headwind, 5 to 15 kt with the A/THR) */
  windIncrement: number;
  /** VLS+ of the calculation */
  speedIncrement: number;
  vapp: number;
  /** Go-around speed and gradient in %, when the aircraft data has them */
  goAroundSpeed?: number;
  goAroundGradient?: number;
  /** DISPATCH: the required landing distance; IN-FLIGHT: the actual landing distance of the braking mode */
  landingDistance?: number;
  /** The actual landing distance (from 50 ft above the threshold to the stop) of the braking mode */
  actualLandingDistance?: number;
  /** IN-FLIGHT, A320: the actual landing distance with the 15 % margin of the in-flight landing distances */
  factoredLandingDistance?: number;
  /** LDA minus the landing distance of the results */
  stopMargin?: number;
  /** The distance from the threshold to the touchdown, in metres */
  airDistance?: number;
  /** IN-FLIGHT: the actual landing distance of each braking mode */
  brakingDistances: LandingBrakingDistance[];
  /** The maximum landing weight limited by the performance, in kg */
  mlwPerf?: number;
  limitation?: LandingLimitation;
  /** IN-FLIGHT: the landing weight is above the certified MLW */
  overweight: boolean;
  /** Credit is taken for the thrust reversers */
  reverseCredit: boolean;
  /** A380: the BTV DRY and WET lines, to choose the runway exit */
  btv?: BtvLines;
  estimates: LandingPerformanceEstimate[];
}

export interface LandingPerformanceCalculator {
  /** Certified MLW and MTOW, operating empty weight, in kg */
  readonly mlw: number;
  readonly mtow: number;
  readonly oew: number;
  readonly maxTailwind: number;
  readonly maxPressureAlt: number;
  /** The regulatory minimum go-around gradient in %, undefined when the aircraft data has no go-around gradient */
  readonly minGoAroundGradient?: number;
  /** What the aircraft data covers, for the inputs of the calculator */
  readonly features: {
    autoConf: boolean;
    goAround: boolean;
    antiIce: boolean;
    airConditioning: boolean;
    approachType: boolean;
    overweightProcedure: boolean;
    /** Brake to vacate: the DRY and WET lines, and the runway exits they permit */
    btv: boolean;
  };

  /** The runway conditions of the aircraft data for a computation type */
  runwayConditions(type: LandingComputationType): LandingRunwayCondition[];

  /** The braking modes of the IN-FLIGHT computation */
  brakingModes(): LandingBrakingMode[];

  /**
   * Whether the data gives credit for the thrust reversers: a shorter distance with the reversers on this runway
   * condition, landing configuration and braking mode
   */
  reverseThrustAvailable(
    type: LandingComputationType,
    condition: LandingRunwayCondition,
    conf: LandingConf,
    brakingMode: LandingBrakingMode,
  ): boolean;

  /** The maximum crosswind for landing (gust included) on a runway condition, in knots */
  crosswindLimit(condition: LandingRunwayCondition, oat: number): number;

  /** The default VLS+ with the A/THR: 1/3 of the headwind, at least 5 kt and at most 15 kt */
  windIncrement(headwind: number): number;

  calculateLandingPerformance(inputs: LandingPerformanceInputs): LandingPerformanceResult;
}

/** VAPP = VLS + 1/3 of the headwind, not more than 15 kt and at least 5 kt with the A/THR (A380 FCOM PER-LND-LCD-ACC) */
export function landingWindIncrement(headwind: number): number {
  return Math.min(15, Math.max(5, Math.round(Math.max(0, headwind) / 3)));
}

/** Pressure altitude in feet of an elevation in feet with a QNH in hPa */
export function landingPressureAltitude(elevation: number, qnh: number): number {
  return elevation + 145442.15 * (1 - (qnh / 1013.25) ** 0.190263);
}

/** ISA temperature in °C at a pressure altitude in feet */
export function landingIsaTemperature(pressureAlt: number): number {
  return 15 - 0.0019812 * pressureAlt;
}
