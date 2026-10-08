// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The N1 and N2 vibrations of the ENGINE SD page. FCOM DSC-70-90-40 (a320_fcom.txt l.64577-64579): "Green: The vibration
 * of the LP(HP) rotor is in normal range. Pulses green: The level of LP(HP) rotor vibration is excessive." The QRH HIGH
 * ENGINE VIBRATION (l.78936) gives the VIB advisory: N1 6 units, N2 4.3 units. The values come from the systems WASM
 * (L:A32NX_ENGINE_n_N1_VIBRATION, L:A32NX_ENGINE_n_N2_VIBRATION, a320_systems engine_malfunction.rs), so that N1 and N2
 * each have their own value.
 */

export const N1_VIBRATION_ADVISORY_UNITS = 6;
export const N2_VIBRATION_ADVISORY_UNITS = 4.3;

/** The vibration pulses green at or above its advisory */
export function vibrationClassName(vibrationUnits: number, advisoryUnits: number): string {
  return vibrationUnits >= advisoryUnits ? 'FillPulse' : 'FillGreen';
}
