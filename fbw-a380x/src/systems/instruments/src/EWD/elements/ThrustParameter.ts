// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The THR parameter of the NORMAL mode: the thrust the engine delivers, in percent of the engine thrust at the TOGA detent with
 * the engine bleed off. The FADEC computes it from the N1 and the air data (P0, PT and TAT: the corrected N1 and the Mach).
 *
 * The engine thrust is the thrust model of the sim engine: n1_and_mach_on_thrust_table of the A380X engines.cfg
 * (common/config/engines.cfg), the thrust at a corrected N1 and a Mach number. Keep THRUST_TABLE in step with engines.cfg.
 *
 * Design choices:
 * - the table dips in places (more N1, less thrust at M 0.7 to 0.9); THR follows its running maximum along the N1 so that it
 *   never goes down while the N1 goes up,
 * - the EGT, also an input of the real FADEC, is not used,
 * - THR is not below 0 (windmilling drag).
 */

const MACH_COLUMNS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/** corrected N1 (percent), then the thrust (fraction of the static thrust) at each Mach of MACH_COLUMNS */
const THRUST_TABLE: readonly (readonly number[])[] = [
  [0, 0.015, -0.15, 0, 0, 0, 0, 0, 0, 0, 0],
  [20, 0.1286, -0.008, 0.015, 0.008, -0.023, -0.061, -0.081, -0.135, -0.21, -0.3],
  [25, 0.155, 0.0236, 0.018, 0.021, -0.0145, -0.038, -0.08, -0.106, -0.15, -0.17],
  [30, 0.16, 0.16, 0.11, 0.1, 0.08, 0.03, -0.01, -0.044, -0.064, -0.088],
  [35, 0.315, 0.151, 0.123, 0.115, 0.1, 0.053, 0.028, 0.006, -0.008, -0.046],
  [40, 0.396, 0.195, 0.149, 0.07, 0.065, 0.051, 0.042, 0.021, 0.015, -0.038],
  [45, 0.472, 0.3, 0.188, 0.114, 0.08, 0.076, 0.07, 0.032, 0.021, -0.021],
  [50, 0.543, 0.373, 0.254, 0.14, 0.109, 0.16, 0.11, 0.033, 0.026, -0.015],
  [55, 0.611, 0.448, 0.324, 0.18, 0.145, 0.19, 0.175, 0.085, 0.055, 0.011],
  [60, 0.714, 0.528, 0.402, 0.25, 0.182, 0.225, 0.22, 0.12, 0.124, 0.024],
  [65, 0.792, 0.615, 0.489, 0.32, 0.218, 0.236, 0.275, 0.195, 0.13, 0.03],
  [70, 0.88, 0.712, 0.586, 0.38, 0.28, 0.25, 0.32, 0.285, 0.17, 0.1],
  [75, 0.982, 0.821, 0.695, 0.43, 0.39, 0.3, 0.33, 0.39, 0.32, 0.19],
  [80, 1.092, 0.941, 0.811, 0.55, 0.45, 0.4, 0.405, 0.46, 0.38, 0.28],
  [85, 1.23, 1.07, 0.932, 0.66, 0.57, 0.48, 0.5, 0.43, 0.44, 0.38],
  [90, 1.388, 1.206, 1.049, 0.75, 0.68, 0.56, 0.54, 0.5, 0.48, 0.4],
  [95, 1.538, 1.34, 1.153, 0.875, 0.75, 0.6, 0.57, 0.56, 0.66, 0.69],
  [100, 1.603, 1.465, 1.229, 0.95, 0.8, 0.7, 0.74, 0.74, 0.68, 0.75],
  [105, 1.655, 1.488, 1.258, 1.03, 0.859, 0.8, 0.82, 0.77, 0.69, 0.77],
  [110, 1.671, 1.503, 1.283, 1.1, 0.935, 0.9, 0.92, 0.8, 0.71, 0.78],
];

const CORRECTED_N1 = THRUST_TABLE.map((row) => row[0]);

/** Each Mach column as its running maximum along the corrected N1 */
const MONOTONE_COLUMNS: number[][] = MACH_COLUMNS.map((_, column) => {
  let max = -Infinity;
  return THRUST_TABLE.map((row) => {
    max = Math.max(max, row[column + 1]);
    return max;
  });
});

const ISA_SEA_LEVEL_TEMPERATURE_K = 288.15;

function interpolate(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]) {
    return ys[0];
  }
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

/** The N1 corrected to the engine inlet total temperature (the TAT) */
export function correctedN1(n1: number, tatDegC: number): number {
  return n1 / Math.sqrt((tatDegC + 273.15) / ISA_SEA_LEVEL_TEMPERATURE_K);
}

/** The engine thrust (fraction of the static thrust) at a corrected N1 and a Mach number */
export function engineThrust(correctedN1Percent: number, mach: number): number {
  const thrustPerColumn = MONOTONE_COLUMNS.map((column) => interpolate(correctedN1Percent, CORRECTED_N1, column));
  return interpolate(mach, MACH_COLUMNS, thrustPerColumn);
}

/**
 * @param n1 the N1 (percent)
 * @param togaBleedOffN1 the N1 of the TOGA detent with the engine bleed off (percent)
 * @param mach the Mach number
 * @param tatDegC the total air temperature
 * @returns THR in percent, 0 when no thrust at TOGA can be computed
 */
export function thrustParameterPercent(n1: number, togaBleedOffN1: number, mach: number, tatDegC: number): number {
  const togaThrust = engineThrust(correctedN1(togaBleedOffN1, tatDegC), mach);
  if (togaThrust <= 0) {
    return 0;
  }
  const thrust = engineThrust(correctedN1(n1, tatDegC), mach);
  return Math.max(0, (100 * thrust) / togaThrust);
}

/** The air data of the THR: the first ADR with a valid word, else the engine sensors (the sim air) */
export function thrustParameterAirData(
  adrMach: readonly (number | null)[],
  adrTatDegC: readonly (number | null)[],
  engineMach: number,
  engineTatDegC: number,
): { mach: number; tatDegC: number } {
  const mach = adrMach.find((value) => value !== null) ?? engineMach;
  const tatDegC = adrTatDegC.find((value) => value !== null) ?? engineTatDegC;
  return { mach, tatDegC };
}
