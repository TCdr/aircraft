// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The cabin vertical speed advisory: above it the V/S value and needle of the CAB PRESS page pulse green. A380 FCOM
 * DSC-31-40-10 ADVISORY, Pressurization (a380_fcom.txt l.72294-72296): "The cabin vertical speed needle pulses in green,
 * if: The cabin vertical speed is above 1 800 ft/min".
 */
export const CABIN_VS_ADVISORY_FT_MIN = 1800;

/**
 * Whether the cabin vertical speed pulses on the CAB PRESS page, on the displayed value (rounded to 50 ft/min). Also the
 * advisory condition of the FWS (FwsAdvisories), so that the SD page and the advisory agree. The FCOM hysteresis
 * (l.72297-72298: stops pulsing below 1 600 ft/min) and the 6 350 ft/min upper limit are not applied (unchanged page
 * behaviour).
 * @param cabinVsFtMin the cabin vertical speed, ft/min
 */
export function cabinVsPulses(cabinVsFtMin: number): boolean {
  return Math.abs(Math.round(cabinVsFtMin / 50) * 50) > CABIN_VS_ADVISORY_FT_MIN;
}
