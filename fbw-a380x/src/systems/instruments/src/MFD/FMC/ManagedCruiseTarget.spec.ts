// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { cruisePredictionSpeedOrMach, managedCruiseTarget, ManagedCruiseTargetInputs } from './ManagedCruiseTarget';

/** CAS at FL392 (ISA) of M.87 and M.85 */
const casAtFl392 = (mach: number) => (mach === 0.87 ? 271.2 : 264.1);

const fl390: ManagedCruiseTargetInputs = {
  econSpeed: 270,
  econMach: 0.87,
  cruiseFlightLevel: 390,
  constantMach: null,
  speedLimit: null,
  vmo: 340,
  machToCas: casAtFl392,
};

describe('Managed cruise target', () => {
  it('above FL200: the ECON Mach, even when the ECON speed is a few knots below its CAS', () => {
    expect(managedCruiseTarget(fl390)).toEqual({ cas: 271.2, mach: 0.87, speedLimitApplied: false });
  });

  it('above FL200: the ECON Mach when the ECON speed is above its CAS too', () => {
    expect(managedCruiseTarget({ ...fl390, econSpeed: 273 })).toEqual({
      cas: 271.2,
      mach: 0.87,
      speedLimitApplied: false,
    });
  });

  it('at and below FL200: the ECON speed', () => {
    const fl150 = { ...fl390, cruiseFlightLevel: 150, econSpeed: 300, econMach: 0.7, machToCas: () => 360 };
    expect(managedCruiseTarget(fl150)).toEqual({ cas: 300, mach: null, speedLimitApplied: false });
    const fl150MachBelow = { ...fl150, machToCas: () => 290 };
    expect(managedCruiseTarget(fl150MachBelow)).toEqual({ cas: 300, mach: null, speedLimitApplied: false });
    expect(managedCruiseTarget({ ...fl150MachBelow, cruiseFlightLevel: 200 }).mach).toBeNull();
  });

  it('a CMS is a Mach target at any level', () => {
    expect(managedCruiseTarget({ ...fl390, constantMach: 0.85 })).toEqual({
      cas: 264.1,
      mach: 0.85,
      speedLimitApplied: false,
    });
    expect(managedCruiseTarget({ ...fl390, cruiseFlightLevel: 150, constantMach: 0.85 }).mach).toBe(0.85);
  });

  it('the climb speed limit is a speed target when it is below the target', () => {
    const lowCruise = { ...fl390, cruiseFlightLevel: 90, econSpeed: 290 };
    expect(managedCruiseTarget({ ...lowCruise, speedLimit: 250 })).toEqual({
      cas: 250,
      mach: null,
      speedLimitApplied: true,
    });
    expect(managedCruiseTarget({ ...lowCruise, econSpeed: 240, speedLimit: 250 }).speedLimitApplied).toBe(false);
  });

  it('the climb speed limit has priority over a Mach target and a CMS', () => {
    const limited = { cas: 250, mach: null, speedLimitApplied: true };
    expect(managedCruiseTarget({ ...fl390, speedLimit: 250 })).toEqual(limited);
    expect(managedCruiseTarget({ ...fl390, constantMach: 0.85, speedLimit: 250 })).toEqual(limited);
  });

  it('without a cruise level: the lower of the ECON speed and the CAS of the ECON Mach', () => {
    const noCruiseLevel = { ...fl390, cruiseFlightLevel: null };
    expect(managedCruiseTarget({ ...noCruiseLevel, econSpeed: 280 })).toEqual({
      cas: 271.2,
      mach: 0.87,
      speedLimitApplied: false,
    });
    expect(managedCruiseTarget({ ...noCruiseLevel, econSpeed: 260 })).toEqual({
      cas: 260,
      mach: null,
      speedLimitApplied: false,
    });
  });

  it('VMO caps a Mach whose CAS exceeds it (a CMS at M.87 flown at FL250)', () => {
    expect(managedCruiseTarget({ ...fl390, cruiseFlightLevel: 250, constantMach: 0.87, machToCas: () => 377 })).toEqual(
      {
        cas: 340,
        mach: null,
        speedLimitApplied: false,
      },
    );
  });

  it('without air data: the ECON speed, in a CMS too', () => {
    const econSpeedTarget = { cas: 270, mach: null, speedLimitApplied: false };
    expect(managedCruiseTarget({ ...fl390, machToCas: () => null })).toEqual(econSpeedTarget);
    expect(managedCruiseTarget({ ...fl390, constantMach: 0.85, machToCas: () => null })).toEqual(econSpeedTarget);
  });
});

describe('Cruise waypoint prediction, F-PLN SPD column', () => {
  it('above FL200: the Mach, whichever of the CAS and the Mach CAS is lower', () => {
    // M.87 at FL390 is 272.4 kt: an ECON speed of 272 kt must not show as a speed
    expect(cruisePredictionSpeedOrMach(272, 0.87, 272.4, 390, 340)).toBe(0.87);
    expect(cruisePredictionSpeedOrMach(273, 0.87, 272.4, 390, 340)).toBe(0.87);
  });

  it('at and below FL200: the speed', () => {
    expect(cruisePredictionSpeedOrMach(300, 0.7, 290, 150, 340)).toBe(300);
    expect(cruisePredictionSpeedOrMach(300, 0.7, 310, 150, 340)).toBe(300);
    expect(cruisePredictionSpeedOrMach(300, 0.7, 290, 200, 340)).toBe(300);
  });
});
