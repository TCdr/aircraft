// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The N1 and N2 vibrations of the ENGINE SD page: green in the normal range, pulsing green when excessive, from the VIB
 * advisory of the high engine vibration procedure (N1 6 units, N2 4.3 units). The values come from the systems WASM
 * (L:A32NX_ENGINE_n_N1_VIBRATION, L:A32NX_ENGINE_n_N2_VIBRATION, a320_systems engine_malfunction.rs), so that N1 and N2
 * each have their own value.
 */

export const N1_VIBRATION_ADVISORY_UNITS = 6;
export const N2_VIBRATION_ADVISORY_UNITS = 4.3;

export function vibrationClassName(vibrationUnits: number, advisoryUnits: number): string {
  return vibrationUnits >= advisoryUnits ? 'FillPulse' : 'FillGreen';
}
