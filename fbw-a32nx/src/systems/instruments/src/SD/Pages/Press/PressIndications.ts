// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * CAB PRESS page colours and pulses:
 * - V/S: the digital value pulses above 1 750 ft/min (resets at 1 650 ft/min).
 * - CAB ALT: red above 9 550 ft; the digital value pulses at or above 8 800 ft (resets at 8 600 ft).
 * Only the digital presentations pulse: the analog needles stay steady.
 * The values compared are the displayed ones (rounded to 50 ft, 50 ft/min), so that the colour matches the digits.
 */

/** Cabin altitude from which the digital value pulses, ft */
const CABIN_ALTITUDE_PULSE_FT = 8800;
/** Cabin altitude at which the pulse resets, ft */
const CABIN_ALTITUDE_PULSE_RESET_FT = 8600;
/** Cabin altitude from which the digital and analog presentations are red, ft */
const CABIN_ALTITUDE_RED_FT = 9550;
/** Cabin vertical speed above which the digital value pulses, ft/min */
const CABIN_VS_PULSE_FT_MIN = 1750;
/** Cabin vertical speed at which the pulse resets, ft/min */
const CABIN_VS_PULSE_RESET_FT_MIN = 1650;

/**
 * Whether the CAB ALT digital value pulses: at or above 8800 ft, until it is back down to 8600 ft.
 * @param displayedCabinAltitudeFt the displayed cabin altitude, ft
 * @param wasPulsing whether the value pulsed at the previous update (hysteresis)
 * @returns true when the value pulses
 */
export function cabinAltitudePulses(displayedCabinAltitudeFt: number, wasPulsing: boolean): boolean {
  return wasPulsing
    ? displayedCabinAltitudeFt > CABIN_ALTITUDE_PULSE_RESET_FT
    : displayedCabinAltitudeFt >= CABIN_ALTITUDE_PULSE_FT;
}

/**
 * CSS class of the CAB ALT digital value: red from 9550 ft, pulsing green while cabinAltitudePulses, green otherwise.
 * @param displayedCabinAltitudeFt the displayed cabin altitude, ft
 * @param pulsing whether the value pulses (see cabinAltitudePulses)
 * @returns the class
 */
export function cabinAltitudeTextClass(displayedCabinAltitudeFt: number, pulsing: boolean): string {
  if (displayedCabinAltitudeFt >= CABIN_ALTITUDE_RED_FT) {
    return 'Red';
  }
  return pulsing ? 'GreenTextPulse' : 'Green';
}

/**
 * CSS class of the CAB ALT needle: red from 9550 ft, steady green otherwise (only the digits pulse).
 * @param displayedCabinAltitudeFt the displayed cabin altitude, ft
 * @returns the class
 */
export function cabinAltitudeNeedleClass(displayedCabinAltitudeFt: number): string {
  return displayedCabinAltitudeFt >= CABIN_ALTITUDE_RED_FT ? 'Red' : 'Green';
}

/**
 * Whether the V/S digital value pulses: above 1750 ft/min, until it is back down to 1650 ft/min.
 * Design choice: climb and descent rates both count (absolute value).
 * @param displayedCabinVsFtMin the displayed cabin vertical speed, ft/min
 * @param wasPulsing whether the value pulsed at the previous update (hysteresis)
 * @returns true when the value pulses
 */
export function cabinVsPulses(displayedCabinVsFtMin: number, wasPulsing: boolean): boolean {
  return Math.abs(displayedCabinVsFtMin) > (wasPulsing ? CABIN_VS_PULSE_RESET_FT_MIN : CABIN_VS_PULSE_FT_MIN);
}
