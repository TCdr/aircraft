// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { UnitType } from '@microsoft/msfs-sdk';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { CostIndex } from '@fmgc/guidance/vnav/CostIndex';

/**
 * MAX TURB speed (A380 FCOM PRO-SUP-91-40 and MISC SEVERE TURBULENCE IN CRUISE: "MAX TURB SPEED : 300 / .85").
 * The CRZ panel of the PERF page displays it (FCOM DSC-22-FMS-20-30 P 252).
 */
export const maxTurbulenceSpeedKnots = 300;

export const maxTurbulenceMach = 0.85;

/** MMO of the A380 */
const maxMach = 0.89;

/**
 * Long range cruise Mach (A380 FCOM PER-IFT "LONG RANGE CRUISE SPEED"): the Mach for which the specific range is 99 %
 * of the maximum specific range, at the given weight, altitude and temperature, above the Mach of maximum range.
 * Computed with the flight and engine models of the FMS.
 * @param weightKg gross weight
 * @param altitudeFeet cruise altitude
 * @param isaDeviation ISA deviation in °C
 * @returns the LRC Mach, or null if it cannot be computed
 */
export function longRangeCruiseMach(weightKg: number, altitudeFeet: number, isaDeviation = 0): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(altitudeFeet) || weightKg <= 0) {
    return null;
  }
  const weightPounds = UnitType.POUND.convertFrom(weightKg, UnitType.KILOGRAM);

  const machs: number[] = [];
  const ranges: number[] = [];
  for (let mach = 0.6; mach <= maxMach + 1e-6; mach += 0.005) {
    const sr = CostIndex.calculateSpecificRange(A380AircraftConfig, mach, altitudeFeet, weightPounds, isaDeviation);
    if (Number.isFinite(sr) && sr > 0) {
      machs.push(mach);
      ranges.push(sr);
    }
  }
  if (ranges.length === 0) {
    return null;
  }

  const maxIndex = ranges.indexOf(Math.max(...ranges));
  const target = 0.99 * ranges[maxIndex];
  let lrc = machs[maxIndex];
  for (let i = maxIndex; i < machs.length && ranges[i] >= target; i++) {
    lrc = machs[i];
  }
  return Math.round(lrc * 100) / 100;
}
