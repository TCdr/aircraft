// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * CAB PRESS page colours and pulses. A320 FCOM DSC-21-20-40 Controls and indicators, CAB PRESS page:
 * (3) V/S FT/MIN: "The digital presentation pulses when V/S > 1 750 ft/min (resets at 1 650 ft/min)."
 * (5) CAB ALT FT: "They appear in red if the cabin altitude goes above 9 550 ft. The digital presentation pulses if the
 *     cabin altitude is at or above 8 800 ft (resets at 8 600 ft)."
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
 * Design choice (kept from the previous code): climb and descent rates both count (absolute value).
 * @param displayedCabinVsFtMin the displayed cabin vertical speed, ft/min
 * @param wasPulsing whether the value pulsed at the previous update (hysteresis)
 * @returns true when the value pulses
 */
export function cabinVsPulses(displayedCabinVsFtMin: number, wasPulsing: boolean): boolean {
  return Math.abs(displayedCabinVsFtMin) > (wasPulsing ? CABIN_VS_PULSE_RESET_FT_MIN : CABIN_VS_PULSE_FT_MIN);
}

/** The VENT, BLOWER and EXTRACT legends of the CAB PRESS page */
export interface VentilationIndication {
  /** VENT in amber (white otherwise) */
  readonly ventAmber: boolean;
  /** BLOWER shown (in amber) */
  readonly blowerShown: boolean;
  /** EXTRACT shown (in amber) */
  readonly extractShown: boolean;
}

/**
 * The avionics ventilation legends of the CAB PRESS page, A320 FCOM DSC-21-30-60 ECAM CAB PRESS PAGE (a320_fcom.txt
 * l.9587-9591): "VENT message normally appears in white. It becomes amber, if there is a BLOWER FAULT, EXTRACT FAULT, or
 * AVNCS SYS FAULT. BLOWER message appears in amber if there is a BLOWER FAULT. EXTRACT message appears in amber if
 * there is an EXTRACT FAULT."
 * The BLOWER and EXTRACT FAULTs are the signals of the overhead FAULT lights, which also come on with the avionics smoke
 * (DSC-21-30-20 l.9560-9566: "smoke warning is activated"). Not simulated: the avionics equipment ventilation computer,
 * so no AVNCS SYS FAULT.
 * @param blowerFault L:A32NX_VENTILATION_BLOWER_FAULT, or the avionics smoke
 * @param extractFault L:A32NX_VENTILATION_EXTRACT_FAULT, or the avionics smoke
 */
export function ventilationIndication(blowerFault: boolean, extractFault: boolean): VentilationIndication {
  return {
    ventAmber: blowerFault || extractFault,
    blowerShown: blowerFault,
    extractShown: extractFault,
  };
}
