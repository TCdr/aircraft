// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { correctedN1, engineThrust, thrustParameterAirData, thrustParameterPercent } from './ThrustParameter';

describe('E/WD THR parameter', () => {
  it('is 100 % at the TOGA thrust with the bleed off', () => {
    expect(thrustParameterPercent(86, 86, 0, 15)).toBeCloseTo(100, 6);
    expect(thrustParameterPercent(95, 95, 0.85, -26)).toBeCloseTo(100, 6);
  });

  it('is the share of the TOGA thrust, not of the N1 range', () => {
    // sea level static: idle N1 20 % gives 0.1286 of the static thrust, TOGA at N1 85 % gives 1.23
    expect(thrustParameterPercent(20, 85, 0, 15)).toBeCloseTo((100 * 0.1286) / 1.23, 3);
    // CLB N1 80 %: 1.092 / 1.23
    expect(thrustParameterPercent(80, 85, 0, 15)).toBeCloseTo((100 * 1.092) / 1.23, 3);
    // a linear N1 map gave 92.3 % here: (80 - 20) / (85 - 20)
    expect(thrustParameterPercent(80, 85, 0, 15)).toBeLessThan(90);
  });

  it('uses the corrected N1 of the TAT and the Mach', () => {
    expect(correctedN1(80, 15)).toBeCloseTo(80, 6);
    expect(correctedN1(80, -26)).toBeCloseTo(80 / Math.sqrt(247.15 / 288.15), 6);
    // the same N1 pair gives another THR in cruise than on the ground
    expect(thrustParameterPercent(86, 95, 0.85, -26)).not.toBeCloseTo(thrustParameterPercent(86, 95, 0, 15), 0);
  });

  it('never goes down while the N1 goes up, never below 0', () => {
    for (const mach of [0, 0.3, 0.7, 0.85]) {
      let previous = -1;
      for (let n1 = 20; n1 <= 100; n1 += 0.5) {
        const thr = thrustParameterPercent(n1, 100, mach, -20);
        expect(thr).toBeGreaterThanOrEqual(previous - 1e-9);
        expect(thr).toBeGreaterThanOrEqual(0);
        previous = thr;
      }
    }
    // M 0.7: the table gives less thrust at corrected N1 85 % (0.43) than at 80 % (0.46)
    expect(engineThrust(85, 0.7)).toBeCloseTo(0.46, 6);
  });

  it('takes the first valid ADR, else the engine sensors', () => {
    expect(thrustParameterAirData([null, 0.78, 0.79], [null, -30, -31], 0.8, -29)).toEqual({
      mach: 0.78,
      tatDegC: -30,
    });
    expect(thrustParameterAirData([null, null, null], [null, null, null], 0.05, 20)).toEqual({
      mach: 0.05,
      tatDegC: 20,
    });
  });
});
