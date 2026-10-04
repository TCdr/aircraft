// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** BRAKES HOT threshold: "At least one brake temperature is equal to, or higher than 300 °C" (A380 FCOM BRAKES HOT) */
export const BRAKES_HOT_TEMPERATURE_C = 300;

/** Number of brakes with a temperature sensor (L:A32NX_REPORTED_BRAKE_TEMPERATURE_1..16, written by the Rust systems) */
export const BRAKE_COUNT = 16;

/**
 * Reads the 16 reported brake temperatures. The A380X has no brake fan panel writing L:A32NX_BRAKES_HOT (an A32NX
 * variable), so the FWS works from the temperatures.
 * @param read reads one L:var in degrees Celsius (SimVar.GetSimVarValue in the sim)
 * @returns the brake temperatures in degrees Celsius
 */
export function readReportedBrakeTemperaturesC(read: (name: string) => number): number[] {
  const temperatures: number[] = [];
  for (let i = 1; i <= BRAKE_COUNT; i++) {
    temperatures.push(read(`L:A32NX_REPORTED_BRAKE_TEMPERATURE_${i}`));
  }
  return temperatures;
}

/**
 * BRAKES HOT (A380 FCOM PRO-ABN BRAKES HOT, triggering condition) and the T.O CONFIG brake temperature check.
 * @param temperaturesC the brake temperatures in degrees Celsius
 * @returns true if at least one brake is at or above 300 °C
 */
export function isAnyBrakeHot(temperaturesC: readonly number[]): boolean {
  return temperaturesC.some((t) => t >= BRAKES_HOT_TEMPERATURE_C);
}
