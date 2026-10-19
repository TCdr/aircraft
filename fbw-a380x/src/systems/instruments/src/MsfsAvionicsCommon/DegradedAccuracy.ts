// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The degraded accuracy of an engine value with ENG 1(2)(3)(4) CTL SYS FAULT (an N1 or N2 sensor or the fuel regulation
 * failed): two amber horizontal lines strike out the last digits of the value, the decimal digit of the N1 and N2, the last
 * three digits of the fuel flow.
 *
 * Design choice: the fuel flow strike also follows CTL SYS FAULT (fuel regulation failure); the N2 strike is on the N2 and N3
 * of the three-spool engine (the core speed of a two-spool engine is its N2).
 */

export const ROTOR_SPEED_STRUCK_DIGITS = 1;
export const FUEL_FLOW_STRUCK_DIGITS = 3;

/**
 * @param rightX the right end of the struck digits
 * @param baselineY the text baseline
 * @param digitWidth the width of one digit
 * @param digitHeight the height of a digit
 * @param struckDigits how many digits, from the right
 * @returns the SVG path of the two lines, at one and two thirds of the digit height
 */
export function degradedAccuracyStrikePath(
  rightX: number,
  baselineY: number,
  digitWidth: number,
  digitHeight: number,
  struckDigits: number,
): string {
  const leftX = rightX - digitWidth * struckDigits;
  const lowerY = baselineY - digitHeight / 3;
  const upperY = baselineY - (2 * digitHeight) / 3;
  return `M ${leftX} ${lowerY} H ${rightX} M ${leftX} ${upperY} H ${rightX}`;
}

/** The strike shows on a value that is shown (not XX) of an engine with CTL SYS FAULT */
export function degradedAccuracyShown(ctlSysFault: boolean, valueShown: boolean): boolean {
  return ctlSysFault && valueShown;
}
