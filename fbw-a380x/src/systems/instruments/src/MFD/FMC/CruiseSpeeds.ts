// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { A380AircraftConfig, A380EconParameters } from '@fmgc/flightplanning/A380AircraftConfig';
import { EconSpeeds, ISA_TROPOPAUSE_ALTITUDE, KG_PER_LB } from '@fmgc/guidance/vnav/EconSpeeds';
import { SpeedsLookupTables } from '@shared/OperatingSpeeds';

/**
 * MAX TURB speed, 300 kt / M.85: the speed for severe turbulence in cruise. The CRZ panel of the PERF page displays it.
 */
export const maxTurbulenceSpeedKnots = 300;

export const maxTurbulenceMach = 0.85;

/**
 * Green dot speed, the lowest ECON speed
 * @param altitude in feet
 * @param weightTonnes gross weight
 * @returns knots CAS
 */
export function a380GreenDotSpeed(altitude: number, weightTonnes: number): number {
  return SpeedsLookupTables.GREEN_DOT.get(altitude, weightTonnes * 1000);
}

/**
 * Long range cruise Mach: the Mach for which the specific range is 99 % of the maximum specific range, at the given
 * weight, altitude and temperature, above the Mach of maximum range. Computed with the ECON speed model of the FMS.
 * @param weightKg gross weight
 * @param altitudeFeet cruise altitude
 * @param isaDeviation ISA deviation in °C
 * @param tropopause tropopause altitude in feet
 * @returns the LRC Mach, or null if it cannot be computed
 */
export function longRangeCruiseMach(
  weightKg: number,
  altitudeFeet: number,
  isaDeviation = 0,
  tropopause = ISA_TROPOPAUSE_ALTITUDE,
): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(altitudeFeet) || weightKg <= 0) {
    return null;
  }
  return EconSpeeds.longRangeCruiseMach(
    A380AircraftConfig,
    A380EconParameters,
    {
      altitude: altitudeFeet,
      weight: weightKg / KG_PER_LB,
      isaDeviation,
      headwind: 0,
      tropopause,
    },
    a380GreenDotSpeed(altitudeFeet, weightKg / 1000),
  );
}
