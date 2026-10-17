// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The rotor vibrations of the ENGINE SD page: a rotor vibration above 5 units pulses green. The values come from the
 * systems WASM (L:A32NX_ENGINE_n_N1_VIBRATION, _N2_VIBRATION, _N3_VIBRATION, a380_systems engine_malfunction.rs), so that
 * each rotor has its own value; MSFS has a single vibration per engine.
 */

// The aircraft's N2 (GP7270 HP rotor) red limit, applied to the FBW N3: one value for the EWD and the ENGINE SD page
import { N3_RED_LIMIT_PERCENT } from '../../../../EWD/elements/EgtLimits';

const VIBRATION_ADVISORY_UNITS = 5;

/** The colour class of a vibration value: pulsing green above the advisory */
export function vibrationClassName(vibrationUnits: number): string {
  return vibrationUnits > VIBRATION_ADVISORY_UNITS ? 'FillPulse' : 'Green';
}

/** The colour class of the N3: red above the red limit */
export function n3ClassName(n3Percent: number): string {
  return n3Percent > N3_RED_LIMIT_PERCENT ? 'Red' : 'Green';
}

/**
 * The red cross next to the N3 (the aircraft's N2), drawn after the value. It comes when the value exceeds the 118.7 %
 * red limit and stays after the N3 is back below the limit, until the next start of that engine on the ground.
 * @param shownBefore the cross was shown at the previous update
 * @param n3Percent the N3 in percent
 * @param groundStart that engine is starting on the ground (ENGINE_STATE starting or restarting, on ground)
 * @param n3Valid the N3 is shown (the FADEC is powered, no XX). "If a parameter value on any SD page is not available for
 *   display, XX appears, instead of the value" (a380_fcom.txt l.73512-73516): an N3 that is not shown, or that is not a
 *   finite number, is no exceedance.
 * @returns whether the red cross shows
 */
export function n3RedCrossShown(
  shownBefore: boolean,
  n3Percent: number,
  groundStart: boolean,
  n3Valid: boolean,
): boolean {
  const exceeds = n3Valid && Number.isFinite(n3Percent) && n3Percent > N3_RED_LIMIT_PERCENT;
  return (shownBefore && !groundStart) || exceeds;
}
