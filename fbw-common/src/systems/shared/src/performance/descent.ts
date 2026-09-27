// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The descent types of the Airbus descent performance application (A380 FCOM PER-IFT-DES-DSD, descent type preset),
 * all engines operative.
 */
export enum DescentType {
  /** The managed descent speeds of the FMS (ECON Mach / ECON IAS of the cost index), idle thrust */
  Econ = 'ECON',
  /** A fixed speed schedule, idle thrust */
  Standard = 'STANDARD',
  /** A fixed speed schedule at a given rate of descent (V/S mode) */
  GivenVs = 'GIVEN_VS',
  /** MMO/VMO, idle thrust, speed brakes extended */
  Emergency = 'EMERGENCY',
}

/** A380 FCOM PER-IFT-DES-CDT: off, engine, total (engine and wing) */
export enum DescentAntiIce {
  Off = 'OFF',
  Engine = 'ENGINE',
  Total = 'TOTAL',
}

/**
 * The speed schedule of a descent (A380 FCOM PER-IFT-DES-STD, speed profile): MACH above the crossover altitude, SPD
 * below it down to the speed limit altitude, SPD LIM below it.
 */
export interface DescentSpeedSchedule {
  mach: number;
  /** CAS in knots */
  cas: number;
  /** The speed limit CAS in knots, and the pressure altitude in feet below which it applies */
  limitCas: number;
  limitAltitude: number;
}

export interface DescentPerformanceInputs {
  type: DescentType;
  /** Pressure altitudes in feet */
  initialAltitude: number;
  targetAltitude: number;
  /** Gross weight at the start of the descent, in kg */
  weight: number;
  isaDeviation: number;
  /** Wind component along the track in knots, negative for a tailwind */
  headwind: number;
  antiIce: DescentAntiIce;
  speedBrakes: boolean;
  /** Fuel factor (performance factor) in % */
  fuelFactor: number;
  schedule: DescentSpeedSchedule;
  /** GIVEN V/S: the rate of descent in feet per minute (positive) */
  verticalSpeed?: number;
}

/** A point of the descent profile */
export interface DescentProfilePoint {
  /** Pressure altitude in feet */
  altitude: number;
  /** From the start of the descent: time in seconds, ground distance in NM, fuel in kg */
  time: number;
  distance: number;
  fuel: number;
  cas: number;
  mach: number;
  tas: number;
  /** Flight path angle in degrees (negative in descent) and rate of descent in feet per minute (positive) */
  gradient: number;
  rate: number;
  /** A particular point of the profile */
  event?: 'CROSSOVER' | 'DECEL' | 'SPD LIM';
}

export enum DescentPerformanceError {
  None = 'None',
  InvalidData = 'InvalidData',
  /** The target altitude is not below the initial altitude */
  TargetAboveInitial = 'TargetAboveInitial',
  /** Above the maximum operating altitude */
  MaximumAltitude = 'MaximumAltitude',
  WeightOutOfRange = 'WeightOutOfRange',
  /** GIVEN V/S: no rate of descent entered */
  VerticalSpeed = 'VerticalSpeed',
}

/** The results that do not come from the aircraft performance model alone */
export enum DescentPerformanceEstimate {
  /** The anti-ice corrections are the ones of the A320 FCOM descent table (PER-DES-STD) */
  AntiIce = 'ANTI_ICE',
}

export interface DescentPerformanceResult {
  inputs: DescentPerformanceInputs;
  error: DescentPerformanceError;
  /** From the initial to the target altitude: time in seconds, ground distance in NM, fuel in kg */
  time: number;
  distance: number;
  fuel: number;
  /** The profile at the initial altitude, every 5000 ft, at its particular points and at the target altitude */
  points: DescentProfilePoint[];
  /** Mean flight path angle (degrees, negative) and rate of descent (feet per minute) */
  averageGradient: number;
  averageRate: number;
  /**
   * GIVEN V/S: the given rate of descent is steeper than the idle descent below this pressure altitude (in feet),
   * where the descent is at idle thrust
   */
  verticalSpeedIdleBelow?: number;
  estimates: DescentPerformanceEstimate[];
}

export interface DescentPerformanceCalculator {
  /** The standard descent speed profile of the aircraft FCOM */
  readonly standardSchedule: DescentSpeedSchedule;
  readonly mmo: number;
  readonly vmo: number;
  /** Maximum operating altitude in feet */
  readonly maxAltitude: number;
  /** Operating empty weight and maximum takeoff weight in kg */
  readonly oew: number;
  readonly mtow: number;

  calculateDescent(inputs: DescentPerformanceInputs): DescentPerformanceResult;
}
