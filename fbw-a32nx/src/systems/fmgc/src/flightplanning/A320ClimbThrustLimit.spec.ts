// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { FlightModel } from '@fmgc/guidance/vnav/FlightModel';
import { Common, FlapConf } from '@fmgc/guidance/vnav/common';

// The A32NX CLB N1 limit lives twice: in the FADEC (C++, drives the engines) and in the FMS (TS, drives the
// predictions). These checks keep both tables identical and check that the climb they give matches the A320neo FCOM
// climb tables (PER-CLB-CLT, CLIMB - 250KT/300KT/M.78 - ALL ENGINES).

const FADEC_THRUST_LIMITS = 'fbw-a32nx/src/wasm/fadec_a32nx/src/Fadec/ThrustLimits_A32NX.hpp';

const engineParams = A320AircraftConfig.engineModelParameters;
const flightParams = A320AircraftConfig.flightModelParameters;

/** Reads the CLB rows (altitude, CP, LP, CN1 flat, CN1 last) of the FADEC limits table from the C++ source. */
function readFadecClimbRows(): number[][] {
  const source = readFileSync(resolve(process.cwd(), FADEC_THRUST_LIMITS), 'utf8');
  const clbSection = /\/\/ CLB\r?\n([\s\S]*?)\/\/ MCT/.exec(source);
  if (!clbSection) {
    throw new Error('CLB section not found in the FADEC thrust limits');
  }
  const rows: number[][] = [];
  for (const match of clbSection[1].matchAll(/\{([^}]*)\}/g)) {
    // Drop the 6th column (CN1 flex), which the FMS table does not have and which is 0 for CLB.
    rows.push(
      match[1]
        .split(',')
        .map((cell) => Number.parseFloat(cell))
        .slice(0, 5),
    );
  }
  return rows;
}

describe('A32NX CLB N1 limit table', () => {
  it('the FMS table is identical to the FADEC table, row by row', () => {
    const fadecRows = readFadecClimbRows();
    expect(fadecRows.length).toBeGreaterThan(0);
    expect(fadecRows.length).toBe(engineParams.cn1ClimbLimit.length);
    fadecRows.forEach((row, index) => {
      expect(row).toEqual([...engineParams.cn1ClimbLimit[index]]);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Climb check against the A320neo FCOM climb tables.
//
// Model of the sim (identified from a recorded A32NX climb, see reports/a32nx-climb-performance-2026-10-04.md):
// - thrust = 2 x 27 120 lbf x n1_and_mach_on_thrust_table(corrected N1, Mach) x delta2 (engines.cfg, = FMS table1506);
// - drag from the FMS clean drag polar plus its Mach correction;
// - the A/THR holds the FADEC CLB N1 limit: CN1 from the table above, times sqrt(theta2), plus the packs bleed
//   correction of ThrustLimits_A32NX::bleedTotal (-0.3 above 8 000 ft when the OAT is at or above the corner point);
// - fuel flow from the FMS corrected fuel flow polynomial (only used to update the weight).
// The FCOM tables are for the A320neo with PW1127G-JM engines; the FBW A32NX models the LEAP-1A26, for which no
// climb tables are available.
// ---------------------------------------------------------------------------------------------------------------------

const CLIMB_CAS = 300;
const CLIMB_MACH = 0.78;
const LOW_ALTITUDE_CAS = 250;
const G_FT_S2 = 32.174;
const KNOTS_TO_FT_S = 1.68781;
const KG_TO_LB = 2.20462;

/** One FCOM climb table cell, from brake release: [distance NM, mean TAS kt, fuel kg]. */
type FcomCell = [number, number, number];

/**
 * A320neo FCOM (IGO fleet, 21 JAN 19, file "A320 Neo FCOM_1.pdf"), PER-CLB-CLT, CLIMB - 250KT/300KT/M.78 - ALL
 * ENGINES, MAX. CLIMB THRUST, NORMAL AIR CONDITIONING, ANTI ICE OFF, CG 33 %, from brake release, for the A320neo
 * MSN group 06720-08541, 08558-08586, 08627-08654, 08688-08702, 08737, 08771-09045 (320-271N, PW1127G-JM, PLP-AAT PDF
 * page 52). Per ISA deviation, per brake release weight (t): FL -> [distance NM, mean TAS kt, fuel kg].
 * - ISA+10: PDF pages 7248-7250 (P4/20-P6/20).
 * - ISA+20: PDF pages 7258-7260 (P14/20-P16/20).
 * The tables list FL100 twice: before and after the 250 kt -> 300 kt acceleration (PER-CLB-GEN, PDF page 7243). The
 * value used here is the row before the acceleration, because the model below starts at FL100 at 250 kt.
 * The time is distance / mean TAS, which is more precise than the whole-minute column.
 */
const FCOM_CLIMB: Record<number, Record<number, Record<number, FcomCell>>> = {
  10: {
    52: { 100: [10, 215, 285], 200: [30, 298, 540], 290: [59, 353, 794], 310: [66, 364, 848] },
    60: { 100: [12, 216, 338], 200: [36, 299, 639], 290: [70, 355, 943], 310: [79, 365, 1010] },
    64: { 100: [13, 218, 366], 200: [39, 299, 691], 290: [76, 356, 1023], 310: [87, 366, 1098] },
    70: { 100: [15, 220, 408], 200: [43, 301, 773], 290: [86, 357, 1151], 310: [98, 368, 1238] },
    76: { 100: [17, 221, 456], 200: [48, 302, 862], 290: [97, 359, 1294], 310: [112, 370, 1397] },
  },
  20: {
    52: { 100: [12, 224, 308], 200: [38, 310, 603], 290: [78, 368, 917], 310: [89, 380, 991] },
    60: { 100: [15, 226, 366], 200: [45, 311, 716], 290: [93, 370, 1097], 310: [108, 382, 1191] },
    70: { 100: [18, 229, 444], 200: [55, 313, 871], 290: [117, 373, 1358], 310: [137, 385, 1488] },
  },
};

/** FCOM time (min) and fuel (kg) from brake release to a flight level; FL300 is the mean of the FL290 and FL310 cells. */
function fcomFromBrakeRelease(
  isaDeviation: number,
  weightTonnes: number,
  flightLevel: number,
): { minutes: number; fuelKg: number } {
  const column = FCOM_CLIMB[isaDeviation][weightTonnes];
  const cells = flightLevel === 300 ? [column[290], column[310]] : [column[flightLevel]];
  const mean = (index: number) => cells.reduce((sum, cell) => sum + cell[index], 0) / cells.length;
  return { minutes: (mean(0) / mean(1)) * 60, fuelKg: mean(2) };
}

/** Corrected N1 that the engines run at in a CLB thrust climb at this altitude and Mach (FADEC limit + bleed). */
function climbCorrectedN1(isaDeviation: number, pressureAltitude: number, mach: number): number {
  const oat = Common.getTemp(pressureAltitude, isaDeviation);
  const cn1 = EngineModel.getClimbThrustCorrectedN1(engineParams, pressureAltitude, oat);
  const cornerPoint = interpolateClimbColumn(pressureAltitude, 1);
  const packsBleed = pressureAltitude >= 8000 && oat >= cornerPoint ? -0.3 : 0;
  const theta2 = Common.getTheta2(Common.getTheta(pressureAltitude, isaDeviation), mach);
  return cn1 + packsBleed / Math.sqrt(theta2);
}

function interpolateClimbColumn(pressureAltitude: number, column: number): number {
  const rows = engineParams.cn1ClimbLimit;
  if (pressureAltitude >= rows[rows.length - 1][0]) {
    return rows[rows.length - 1][column];
  }
  const hi = rows.findIndex((row) => row[0] > pressureAltitude);
  const lo = Math.max(0, hi - 1);
  return Common.interpolate(pressureAltitude, rows[lo][0], rows[hi][0], rows[lo][column], rows[hi][column]);
}

/** Specific excess power (T - D) x V / W in ft/s, and the fuel flow in lb/s, at one point of the climb. */
function climbPoint(isaDeviation: number, pressureAltitude: number, cas: number, weightLb: number) {
  const theta = Common.getTheta(pressureAltitude, isaDeviation);
  const delta = Common.getDelta(pressureAltitude);
  const mach = Math.min(Common.CAStoMach(cas, delta), CLIMB_MACH);
  const tasFtS = Common.machToTAS(mach, theta) * KNOTS_TO_FT_S;
  const cn1 = climbCorrectedN1(isaDeviation, pressureAltitude, mach);

  const delta2 = Common.getDelta2(delta, mach);
  const theta2 = Common.getTheta2(theta, mach);
  const thrust =
    EngineModel.tableInterpolation(engineParams.table1506, cn1, mach) *
    engineParams.maxThrust *
    engineParams.numberOfEngines *
    delta2;
  const drag = FlightModel.getDrag(flightParams, weightLb, mach, delta, false, false, FlapConf.CLEAN);
  const fuelFlowLbS =
    (EngineModel.getUncorrectedFuelFlow(
      EngineModel.getCorrectedFuelFlow(engineParams, cn1, mach, pressureAltitude),
      delta2,
      theta2,
    ) *
      engineParams.numberOfEngines) /
    3600;

  return { tasFtS, excessPowerFtS: ((thrust - drag) * tasFtS) / weightLb, fuelFlowLbS };
}

/**
 * Integrates the energy equation along the FCOM profile from FL100: accelerate from 250 kt to 300 kt at FL100, then
 * climb at 300 kt / M.78. Returns the minutes and kg of fuel to reach each requested flight level.
 */
function simulateClimbFromFl100(isaDeviation: number, initialWeightKg: number, flightLevels: number[]) {
  let weightLb = initialWeightKg * KG_TO_LB;
  let seconds = 0;
  let fuelLb = 0;

  // Level acceleration at FL100, 250 kt -> 300 kt, in 1 kt steps.
  for (let cas = LOW_ALTITUDE_CAS; cas < CLIMB_CAS; cas++) {
    const from = climbPoint(isaDeviation, 10000, cas, weightLb);
    const to = climbPoint(isaDeviation, 10000, cas + 1, weightLb);
    const energyGain = (to.tasFtS ** 2 - from.tasFtS ** 2) / (2 * G_FT_S2);
    const dt = energyGain / ((from.excessPowerFtS + to.excessPowerFtS) / 2);
    seconds += dt;
    fuelLb += from.fuelFlowLbS * dt;
    weightLb -= from.fuelFlowLbS * dt;
  }

  // Climb in 50 ft pressure-altitude steps. Above ISA a pressure-altitude step is a longer geometric step (T / T_ISA).
  const results: Record<number, { minutes: number; fuelKg: number }> = {};
  const step = 50;
  const top = Math.max(...flightLevels) * 100;
  for (let altitude = 10000; altitude < top; altitude += step) {
    const from = climbPoint(isaDeviation, altitude, CLIMB_CAS, weightLb);
    const to = climbPoint(isaDeviation, altitude + step, CLIMB_CAS, weightLb);
    const temperatureRatio =
      (273.15 + Common.getTemp(altitude + step / 2, isaDeviation)) / (273.15 + Common.getIsaTemp(altitude + step / 2));
    const energyGain = step * temperatureRatio + (to.tasFtS ** 2 - from.tasFtS ** 2) / (2 * G_FT_S2);
    const dt = energyGain / ((from.excessPowerFtS + to.excessPowerFtS) / 2);
    seconds += dt;
    fuelLb += from.fuelFlowLbS * dt;
    weightLb -= from.fuelFlowLbS * dt;
    const flightLevel = (altitude + step) / 100;
    if (flightLevels.includes(flightLevel)) {
      results[flightLevel] = { minutes: seconds / 60, fuelKg: fuelLb / KG_TO_LB };
    }
  }
  return results;
}

/**
 * FL100-FL300 must be within 5 % of the FCOM. The FL100-FL200 and FL200-FL300 parts get 8 %: the FCOM distances are
 * whole NM, which alone moves a 3-5 min part by up to 4 %.
 */
const TOTAL_TOLERANCE = 0.05;
const PART_TOLERANCE = 0.08;

const CLIMB_CASES: { isaDeviation: number; weightTonnes: number }[] = [
  { isaDeviation: 10, weightTonnes: 52 },
  { isaDeviation: 10, weightTonnes: 60 },
  { isaDeviation: 10, weightTonnes: 64 },
  { isaDeviation: 10, weightTonnes: 70 },
  { isaDeviation: 10, weightTonnes: 76 },
  { isaDeviation: 20, weightTonnes: 52 },
  { isaDeviation: 20, weightTonnes: 60 },
  { isaDeviation: 20, weightTonnes: 70 },
];

describe('A32NX CLB thrust climb against the A320neo FCOM climb tables (250 kt / 300 kt / M.78)', () => {
  for (const { isaDeviation, weightTonnes } of CLIMB_CASES) {
    it(`ISA+${isaDeviation}, ${weightTonnes} t: FL100-FL300 within 5 % of the FCOM, FL100-FL200 and FL200-FL300 within 8 %`, () => {
      const fcomFl100 = fcomFromBrakeRelease(isaDeviation, weightTonnes, 100);
      const fcomFl200 = fcomFromBrakeRelease(isaDeviation, weightTonnes, 200);
      const fcomFl300 = fcomFromBrakeRelease(isaDeviation, weightTonnes, 300);

      // Weight at FL100 = brake release weight minus the FCOM fuel to FL100.
      const model = simulateClimbFromFl100(isaDeviation, weightTonnes * 1000 - fcomFl100.fuelKg, [200, 300]);

      const segments = [
        {
          name: 'FL100-FL200',
          model: model[200].minutes,
          fcom: fcomFl200.minutes - fcomFl100.minutes,
          tolerance: PART_TOLERANCE,
        },
        {
          name: 'FL200-FL300',
          model: model[300].minutes - model[200].minutes,
          fcom: fcomFl300.minutes - fcomFl200.minutes,
          tolerance: PART_TOLERANCE,
        },
        {
          name: 'FL100-FL300',
          model: model[300].minutes,
          fcom: fcomFl300.minutes - fcomFl100.minutes,
          tolerance: TOTAL_TOLERANCE,
        },
      ];
      for (const segment of segments) {
        expect(
          Math.abs(segment.model / segment.fcom - 1),
          `${segment.name}: model ${segment.model.toFixed(2)} min, FCOM ${segment.fcom.toFixed(2)} min`,
        ).toBeLessThan(segment.tolerance);
      }
    });
  }
});
