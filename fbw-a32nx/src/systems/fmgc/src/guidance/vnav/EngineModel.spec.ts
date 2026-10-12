// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';

// The predictions find the corrected N1 that gives a thrust with EngineModel.reverseTableInterpolation on table 1506
// (the engines.cfg n1_and_mach_on_thrust_table). The sim engine reads that table forwards, bilinear in N1 and Mach, so
// the N1 the predictions use must be the one at which the forward reading gives the thrust.

const MACHS_BETWEEN_COLUMNS = [0.25, 0.45, 0.62, 0.75, 0.78, 0.82, 0.85, 0.88];

describe('EngineModel.reverseTableInterpolation', () => {
  for (const [name, table] of [
    ['A380X', A380AircraftConfig.engineModelParameters.table1506],
    ['A32NX', A320AircraftConfig.engineModelParameters.table1506],
  ] as const) {
    it(`is the inverse of tableInterpolation on the ${name} thrust table, also between the Mach columns`, () => {
      for (const mach of MACHS_BETWEEN_COLUMNS) {
        // Up to the maximum thrust of the table at that Mach (beyond it, the result is clamped to the last row)
        const maximumRatio = Math.max(
          ...table.slice(1).map((row) => EngineModel.tableInterpolation(table, row[0], mach)),
        );
        for (let thrustRatio = 0.2; thrustRatio <= Math.min(0.6, maximumRatio); thrustRatio += 0.01) {
          const correctedN1 = EngineModel.reverseTableInterpolation(table, mach, thrustRatio);
          expect(EngineModel.tableInterpolation(table, correctedN1, mach)).toBeCloseTo(thrustRatio, 6);
        }
      }
    });
  }

  it('gives the A380X cruise N1 at M.85 that the engine needs (FL340, 350 t: 89.0 %, not 87.5 %)', () => {
    // Thrust ratio of the drag at FL340, M.85, 771.6 klb (FMS drag polar), per engine
    const table = A380AircraftConfig.engineModelParameters.table1506;
    expect(EngineModel.reverseTableInterpolation(table, 0.85, 0.434)).toBeCloseTo(89.0, 1);
  });

  it('keeps the plain row inversion on a Mach column', () => {
    const table = A380AircraftConfig.engineModelParameters.table1506;
    // M.8 column: N1 80 -> 0.38, N1 85 -> 0.44
    expect(EngineModel.reverseTableInterpolation(table, 0.8, 0.42)).toBeCloseTo(80 + (5 * 0.04) / 0.06, 6);
  });

  it('takes the lowest N1 where the thrust curve is not monotonic', () => {
    const table = [
      [0, 0, 1],
      [0, 0, 0],
      [10, 0.5, 0.5],
      [20, 0.3, 0.3],
      [30, 0.9, 0.9],
    ];
    expect(EngineModel.reverseTableInterpolation(table, 0.5, 0.4)).toBeCloseTo(8, 6);
    expect(EngineModel.reverseTableInterpolation(table, 0.5, 0.6)).toBeCloseTo(20 + 10 / 2, 6);
  });

  it('clamps beyond the table to the first and last rows, as tableInterpolation does', () => {
    const table = A380AircraftConfig.engineModelParameters.table1506;
    expect(EngineModel.reverseTableInterpolation(table, 0.85, 5)).toBe(110);
    expect(EngineModel.reverseTableInterpolation(table, 0.85, -1)).toBe(0);
  });
});
