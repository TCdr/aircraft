// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The rotor vibrations of the ENGINE SD page. A380 FCOM DSC-70-90 (a380_fcom.txt l.113393-113397): "N1(N2) VIBRATIONS ...
 * If the rotor vibration level is above 5 units, the rotor vibration indication pulses green." The values come from the
 * systems WASM (L:A32NX_ENGINE_n_N1_VIBRATION, _N2_VIBRATION, _N3_VIBRATION, a380_systems engine_malfunction.rs), so that
 * each rotor has its own value; MSFS has a single vibration per engine.
 */

export const VIBRATION_ADVISORY_UNITS = 5;

/** The A380 FCOM N2 (GP7270 HP rotor) red limit, applied to the FBW N3 (DSC-70-90, l.113301) */
export const N3_RED_LIMIT_PERCENT = 118.7;

/** The colour class of a vibration value: pulsing green above the advisory */
export function vibrationClassName(vibrationUnits: number): string {
  return vibrationUnits > VIBRATION_ADVISORY_UNITS ? 'FillPulse' : 'Green';
}

/** The colour class of the N3: red above the red limit */
export function n3ClassName(n3Percent: number): string {
  return n3Percent > N3_RED_LIMIT_PERCENT ? 'Red' : 'Green';
}

/**
 * The red cross next to the N3 (the FCOM N2). A380 FCOM DSC-70-90 N2 (a380_fcom.txt l.113300-113302, figure "119.8 +"
 * on PDF page 4109): "N2 value is above the red limit. N2 red limit value is 118.7 %. The red cross no longer appears
 * after a subsequent engine start on ground." The cross comes with the exceedance and stays after the N3 is back below
 * the limit, until the next start of that engine on the ground.
 * @param shownBefore the cross was shown at the previous update
 * @param n3Percent the N3 in percent
 * @param groundStart that engine is starting on the ground (ENGINE_STATE starting or restarting, on ground)
 * @returns whether the red cross shows
 */
export function n3RedCrossShown(shownBefore: boolean, n3Percent: number, groundStart: boolean): boolean {
  return (shownBefore && !groundStart) || n3Percent > N3_RED_LIMIT_PERCENT;
}
