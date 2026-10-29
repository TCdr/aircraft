// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Cabin altitude above which the CAB ALT indication is abnormal (red) */
export const CABIN_ALTITUDE_ABNORMAL_FT = 9550;

/**
 * CSS class of the CAB ALT needle of the SD PRESS page: abnormal above 9 550 ft, as the digital value.
 * @param cabinAltitudeFt the displayed cabin altitude in feet (50 ft steps)
 * @returns the needle class
 */
export function cabinAltitudeNeedleClass(cabinAltitudeFt: number): 'GaugeIndicator' | 'RedGaugeIndicator' {
  return cabinAltitudeFt >= CABIN_ALTITUDE_ABNORMAL_FT ? 'RedGaugeIndicator' : 'GaugeIndicator';
}
