// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The A380X VNAV fuel predictions (Predictions / EngineModel / FlightModel with A380AircraftConfig), which give the
 * TRIP fuel of the FUEL&LOAD page, against the engine the sim flies and against the published A380 examples.
 *
 * The FMS predictions use the engine, aerodynamic and performance models of the aircraft. Here the aircraft is the sim
 * A380X: its thrust is the engines.cfg n1_and_mach_on_thrust_table (read forwards by MSFS, bilinear in N1 and Mach) and
 * its fuel flow is the FADEC Polynomial_A380X::correctedFuelFlow (fadec_a380x, x 2.8). Measured in the sim (A380X,
 * FL150, 240 kt, all four engines): TURB ENG JET THRUST within 0.5 % of table 1506 read forwards at the recorded
 * corrected N1, and L:A32NX_ENGINE_FF within 0.5 % of the FADEC polynomial: thrust and fuel flow per N1 are the sim's.
 *
 * The published in-flight performance examples (the only A380 performance figures with numbers, all heavy):
 * - climb: 1200.0 klb, ISA+10, HD10, FL15 to FL350, CI 160 -> 0:26, 25960 lb, 190.5 NM
 * - cruise: 1100.0 klb, ISA+10, FL350, ECON CI 160 -> ALL ENG FF 31889 lb/HR
 * - holding: 940.0 klb, ISA+10, 1500 ft, GD + 25 kt (235 kt) -> Average FF 26200 lb/HR
 * The remaining deviations from them are the sim A380X's own performance (same engine and drag models), not an FMS
 * error: the bands pin today's values, and a retune of the sim + FMS models must update them.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common, FlapConf } from '@fmgc/guidance/vnav/common';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { FlightModel } from '@fmgc/guidance/vnav/FlightModel';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';

const ENGINES_CFG =
  'fbw-a380x/src/base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/config/engines.cfg';
const FADEC_POLYNOMIALS = 'fbw-a380x/src/wasm/fadec_a380x/src/Fadec/Polynomials_A380X.hpp';

const TONNE_TO_LB = 2204.62;
const TROPOPAUSE = 36_089;
const STEP_ALTITUDE = 1_000;
const STEP_DISTANCE = 50;

const engineParameters = A380AircraftConfig.engineModelParameters;

interface Phase {
  fuel: number;
  time: number;
  distance: number;
}

interface Conditions {
  isaDeviation: number;
  headwind: number;
  /** CAS above the 250 kt / FL100 speed limit */
  cas: number;
  mach: number;
}

const staticAirTemperature = (altitude: number, isaDeviation: number) =>
  15 - 0.0019812 * Math.min(altitude, TROPOPAUSE) + isaDeviation;

const speedAt = (altitude: number, cas: number) => (altitude < 10_000 ? 250 : cas);

/** Climb at CLB thrust, as the VNAV climb strategy (altitude steps, 250 kt below FL100) */
function climb(config: AircraftConfig, from: number, to: number, weight: number, c: Conditions): Phase {
  const result = { fuel: 0, time: 0, distance: 0 };
  for (let altitude = from; altitude < to; altitude += STEP_ALTITUDE) {
    const stepSize = Math.min(STEP_ALTITUDE, to - altitude);
    const midAltitude = altitude + stepSize / 2;
    const climbN1 = EngineModel.getClimbThrustCorrectedN1(
      config.engineModelParameters,
      midAltitude,
      staticAirTemperature(midAltitude, c.isaDeviation),
    );
    const step = Predictions.altitudeStep(
      config,
      altitude,
      stepSize,
      speedAt(midAltitude, c.cas),
      c.mach,
      climbN1,
      0,
      weight - result.fuel,
      c.headwind,
      c.isaDeviation,
      TROPOPAUSE,
    );
    result.fuel += step.fuelBurned;
    result.time += step.timeElapsed;
    result.distance += step.distanceTraveled;
  }
  return result;
}

/** Idle descent, computed backwards from the bottom as the VNAV does (the steps give negative values) */
function descent(config: AircraftConfig, bottom: number, top: number, weight: number, c: Conditions): Phase {
  const result = { fuel: 0, time: 0, distance: 0 };
  for (let altitude = bottom; altitude < top; altitude += STEP_ALTITUDE) {
    const stepSize = Math.min(STEP_ALTITUDE, top - altitude);
    const midAltitude = altitude + stepSize / 2;
    const speed = speedAt(midAltitude, c.cas);
    const mach = Math.min(Common.CAStoMach(speed, Common.getDelta(midAltitude, midAltitude > TROPOPAUSE)), c.mach);
    const idleN1 =
      EngineModel.getIdleCorrectedN1(config.engineModelParameters, midAltitude, mach, TROPOPAUSE) +
      config.vnavConfig.IDLE_N1_MARGIN;
    const step = Predictions.altitudeStep(
      config,
      altitude,
      stepSize,
      speed,
      c.mach,
      idleN1,
      0,
      weight,
      c.headwind,
      c.isaDeviation,
      TROPOPAUSE,
    );
    result.fuel += Math.abs(step.fuelBurned);
    result.time += Math.abs(step.timeElapsed);
    result.distance += Math.abs(step.distanceTraveled);
  }
  return result;
}

/** Level cruise in 50 NM steps, as the VNAV cruise path builder */
function cruise(config: AircraftConfig, altitude: number, distance: number, weight: number, c: Conditions): Phase {
  const result = { fuel: 0, time: 0, distance: 0 };
  while (result.distance < distance) {
    const stepSize = Math.min(STEP_DISTANCE, distance - result.distance);
    const step = Predictions.levelFlightStep(
      config,
      altitude,
      stepSize,
      c.cas,
      c.mach,
      0,
      weight - result.fuel,
      c.headwind,
      c.isaDeviation,
      TROPOPAUSE,
    );
    result.fuel += step.fuelBurned;
    result.time += step.timeElapsed;
    result.distance += stepSize;
  }
  return result;
}

/** Total fuel flow of the FMS level flight prediction, lb/h */
function levelFuelFlow(weight: number, altitude: number, cas: number, mach: number, isaDeviation: number): number {
  const step = Predictions.levelFlightStep(
    A380AircraftConfig,
    altitude,
    10,
    cas,
    mach,
    0,
    weight,
    0,
    isaDeviation,
    TROPOPAUSE,
  );
  return (step.fuelBurned / step.timeElapsed) * 3600;
}

/**
 * Total fuel flow the sim engines burn in level flight at M (lb/h): the lowest corrected N1 at which table 1506, read
 * forwards as MSFS does, gives the drag (found by scanning, independently of the FMS inversion), and the FADEC fuel
 * flow at that N1 (corrected fuel flow x delta2 x sqrt(theta2), EngineControl_A380X::updateFF).
 */
function engineFuelFlowAtMach(weight: number, altitude: number, mach: number, isaDeviation: number): number {
  const aboveTropopause = altitude > TROPOPAUSE;
  const delta = Common.getDelta(altitude, aboveTropopause);
  const theta = Common.getTheta(altitude, isaDeviation, aboveTropopause);
  const delta2 = Common.getDelta2(delta, mach);
  const theta2 = Common.getTheta2(theta, mach);
  const drag = FlightModel.getDrag(
    A380AircraftConfig.flightModelParameters,
    weight,
    mach,
    delta,
    false,
    false,
    FlapConf.CLEAN,
  );
  const thrustRatioPerEngine = drag / delta2 / engineParameters.numberOfEngines / engineParameters.maxThrust;

  let correctedN1 = 20;
  while (EngineModel.tableInterpolation(engineParameters.table1506, correctedN1, mach) < thrustRatioPerEngine) {
    correctedN1 += 0.001;
  }

  const correctedFuelFlow = EngineModel.getCorrectedFuelFlow(engineParameters, correctedN1, mach, altitude);
  return correctedFuelFlow * engineParameters.numberOfEngines * delta2 * Math.sqrt(theta2);
}

/** Reads the engines.cfg n1_and_mach_on_thrust_table as rows of numbers (first row: the Mach columns) */
function readSimThrustTable(): number[][] {
  const source = readFileSync(resolve(process.cwd(), ENGINES_CFG), 'utf8');
  const line = /^n1_and_mach_on_thrust_table\s*=\s*([^;\r\n]*)/m.exec(source);
  if (!line) {
    throw new Error('n1_and_mach_on_thrust_table not found in engines.cfg');
  }
  return line[1]
    .trim()
    .split(',')
    .map((row) => row.split(':').map((cell) => Number.parseFloat(cell)));
}

/** The FADEC corrected fuel flow (lb/h per engine) evaluated from the C++ source: coefficients and final factor */
function fadecCorrectedFuelFlow(): (cn1: number, mach: number, alt: number) => number {
  const source = readFileSync(resolve(process.cwd(), FADEC_POLYNOMIALS), 'utf8');
  const body = /static double correctedFuelFlow\([\s\S]*?return ([\d.]+) \* outCFF;/.exec(source);
  if (!body) {
    throw new Error('correctedFuelFlow not found in the FADEC polynomials');
  }
  const coefficients = /c_Flow\[21\] = \{([\s\S]*?)\};/
    .exec(body[0])![1]
    .split('\n')
    .map((line) =>
      line
        .replace(/\/\/.*$/, '')
        .replace(',', '')
        .trim(),
    )
    .filter((cell) => cell.length > 0)
    .map((cell) => Number.parseFloat(cell));
  const factor = Number.parseFloat(body[1]);
  expect(coefficients).toHaveLength(21);
  return (n, m, a) => {
    const c = coefficients;
    // Same terms, same order as Polynomial_A380X::correctedFuelFlow
    const terms = [1, 1, n, m, a, n ** 2, n * m, n * a, m ** 2, m * a, a ** 2, n ** 3, n ** 2 * m, n ** 2 * a];
    terms.push(n * m ** 2, n * m * a, n * a ** 2, m ** 3, m ** 2 * a, m * a ** 2, a ** 3);
    return factor * terms.reduce((sum, term, i) => sum + c[i] * term, 0);
  };
}

/** The published examples' conditions: ISA+10, 10 kt headwind, CI 160 (about 330 kt / M.85 from their TAS column) */
const FCOM_CONDITIONS: Conditions = { isaDeviation: 10, headwind: 10, cas: 330, mach: 0.85 };

describe('A380X VNAV engine model = the sim engine', () => {
  it('uses the engines.cfg thrust table (table 1506)', () => {
    expect(readSimThrustTable()).toEqual(engineParameters.table1506.map((row) => [...row]));
  });

  it('uses the FADEC fuel flow polynomial (x 2.8)', () => {
    const fadec = fadecCorrectedFuelFlow();
    for (const [cn1, mach, alt] of [
      [60, 0.4, 5_000],
      [88, 0.85, 34_000],
      [95, 0.78, 25_000],
    ]) {
      expect(EngineModel.getCorrectedFuelFlow(engineParameters, cn1, mach, alt)).toBeCloseTo(fadec(cn1, mach, alt), 6);
    }
  });

  it('predicts the cruise fuel flow the FADEC burns at M.85, between the table Mach columns', () => {
    for (const [weightKlb, altitude, isaDeviation] of [
      [771.6, 34_000, 0],
      [771.6, 38_000, 0],
      [800, 30_000, 0],
      [1_100, 35_000, 10],
    ]) {
      const weight = weightKlb * 1_000;
      const predicted = levelFuelFlow(weight, altitude, 400, 0.85, isaDeviation);
      expect(predicted / engineFuelFlowAtMach(weight, altitude, 0.85, isaDeviation)).toBeCloseTo(1, 2);
    }
  });
});

describe('A380X VNAV predictions vs the published in-flight performance examples', () => {
  it('holding at 940 klb, 1500 ft, 235 kt: about 4 % below the published 26200 lb/h', () => {
    const ratio = levelFuelFlow(940_000, 1_500, 235, 0.85, 10) / 26_200;
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(0.97);
  });

  it('cruise at 1100 klb, FL350, M.85: about 5 % below the published 31889 lb/h', () => {
    const ratio = levelFuelFlow(1_100_000, 35_000, 330, 0.85, 10) / 31_889;
    expect(ratio).toBeGreaterThan(0.94);
    expect(ratio).toBeLessThan(0.96);
  });

  it('climb at 1200 klb, FL15 to FL350: about 21 % too quick and 24 % too little fuel', () => {
    const result = climb(A380AircraftConfig, 1_500, 35_000, 1_200_000, FCOM_CONDITIONS);
    // Published: 0:26, 25960 lb, 190.5 NM. The fuel per minute is right (about -4 %): the climb itself is too quick.
    expect(result.time / 60 / 26).toBeGreaterThan(0.75);
    expect(result.time / 60 / 26).toBeLessThan(0.83);
    expect(result.fuel / 25_960).toBeGreaterThan(0.72);
    expect(result.fuel / 25_960).toBeLessThan(0.8);
    expect(result.fuel / result.time / (25_960 / (26 * 60))).toBeGreaterThan(0.92);
  });

  it('gives an RJTT-RKSI-like TRIP (ZFW 342.6 t, 30 t at takeoff, 700 NM, FL340, ISA, no wind) of 20.5 t', () => {
    const takeoffWeight = (342.6 + 30) * TONNE_TO_LB;
    const conditions: Conditions = { isaDeviation: 0, headwind: 0, cas: 300, mach: 0.85 };
    const climbPhase = climb(A380AircraftConfig, 0, 34_000, takeoffWeight, conditions);
    const descentPhase = descent(
      A380AircraftConfig,
      0,
      34_000,
      takeoffWeight - climbPhase.fuel - 10 * TONNE_TO_LB,
      conditions,
    );
    const cruisePhase = cruise(
      A380AircraftConfig,
      34_000,
      700 - climbPhase.distance - descentPhase.distance,
      takeoffWeight - climbPhase.fuel,
      conditions,
    );
    const tonnes = (phase: Phase) => phase.fuel / TONNE_TO_LB;

    // Climb 5.94 t / 14 min / 93 NM, cruise 13.64 t, descent 0.89 t / 18 min / 106 NM
    expect(tonnes(climbPhase)).toBeCloseTo(5.94, 1);
    expect(tonnes(cruisePhase)).toBeCloseTo(13.64, 1);
    expect(tonnes(descentPhase)).toBeCloseTo(0.89, 1);
    // SimBrief: 23.5 t for the real route
    expect(tonnes(climbPhase) + tonnes(cruisePhase) + tonnes(descentPhase)).toBeCloseTo(20.47, 1);
  });
});
