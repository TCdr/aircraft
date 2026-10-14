// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The Tire Pressure Indicating System (TPIS) of the A380, shared by the TPIS model (systems-host Misc/Tpis.ts) and the
 * SD WHEEL page (instruments SD Wheel). A380 FCOM DSC-32-10-60 TPIS (a380_fcom.txt l.80813-80826), DSC-32-20-70 TIRE
 * PRESSURE (l.81385-81395) and PRO-ABN-ECAM-10-32 WHEEL TIRE PRESS LO (l.163270-163289).
 *
 * Tires 1 to 20 are the main gear tires, numbered as on the SD WHEEL page (wing gears 1-8, body gears 9-20); tire 21 is
 * the left nose tire and tire 22 the right one. The two tires of an axle are 2n-1 and 2n.
 */

export const TIRE_COUNT = 22;
export const NOSE_LEFT_TIRE = 21;
export const NOSE_RIGHT_TIRE = 22;

/** "The normal tire pressure is 217.5. PSI" (l.163283) */
export const TIRE_NORMAL_PRESSURE_PSI = 217.5;

/** "The TPIS can measure pressures from 0 to 400 PSI by 5 PSI steps." (l.80822) */
export const TPIS_MAX_PRESSURE_PSI = 400;
export const TPIS_STEP_PSI = 5;

/**
 * WHEEL TIRE PRESS LO (l.163276-163289): "Any tire pressure is lower than the minimum value [...] a percentage of the
 * normal tire pressure: - 11 % during flight phases 1 to 5 - 26 % during flight phases 6 to 11", or "The pressures of two
 * tires on the same axle are different [...] minimum difference [...] - 15 % during flight phases 1 to 5 - 21 % during
 * flight phases 6 to 11." Design reading: the minimum value is the normal pressure less that percentage, and the
 * difference is a percentage of the normal pressure too.
 */
export const TIRE_LOW_FRACTION_GROUND = 0.11;
export const TIRE_LOW_FRACTION_FLIGHT = 0.26;
export const AXLE_DIFFERENCE_FRACTION_GROUND = 0.15;
export const AXLE_DIFFERENCE_FRACTION_FLIGHT = 0.21;

/** The L:var of the TPIS pressure of a tire (1 to 22), PSI */
export function tirePressureVar(tire: number): string {
  return `L:A380X_TPIS_TIRE_${tire}_PRESSURE`;
}

/** The other tire of the same axle (1 <-> 2, 3 <-> 4, ..., 21 <-> 22) */
export function axleMate(tire: number): number {
  return tire % 2 === 1 ? tire + 1 : tire - 1;
}

/** The TPIS measurement of a pressure: 0 to 400 PSI by 5 PSI steps */
export function tpisMeasurement(pressurePsi: number): number {
  const clamped = Math.min(Math.max(pressurePsi, 0), TPIS_MAX_PRESSURE_PSI);
  return Math.round(clamped / TPIS_STEP_PSI) * TPIS_STEP_PSI;
}

/** Flight phases 6 to 11 use the flight thresholds (FWS flight phase, L:A32NX_FWC_FLIGHT_PHASE) */
function usesFlightThresholds(flightPhase: number): boolean {
  return flightPhase >= 6 && flightPhase <= 11;
}

/**
 * Whether the pressure of a tire is abnormal: low, or too different from the other tire of its axle. The SD WHEEL page
 * then shows it in amber, whatever the MORE key (l.81391-81395).
 * @param pressuresPsi the TPIS pressures of tires 1 to 22 (index 0 = tire 1)
 * @param tire the tire, 1 to 22
 * @param flightPhase the FWS flight phase
 */
export function isTirePressureAbnormal(pressuresPsi: readonly number[], tire: number, flightPhase: number): boolean {
  const pressure = pressuresPsi[tire - 1];
  const matePressure = pressuresPsi[axleMate(tire) - 1];
  const inFlight = usesFlightThresholds(flightPhase);
  const minimum = TIRE_NORMAL_PRESSURE_PSI * (1 - (inFlight ? TIRE_LOW_FRACTION_FLIGHT : TIRE_LOW_FRACTION_GROUND));
  const maxDifference =
    TIRE_NORMAL_PRESSURE_PSI * (inFlight ? AXLE_DIFFERENCE_FRACTION_FLIGHT : AXLE_DIFFERENCE_FRACTION_GROUND);
  return pressure < minimum || Math.abs(pressure - matePressure) >= maxDifference;
}
