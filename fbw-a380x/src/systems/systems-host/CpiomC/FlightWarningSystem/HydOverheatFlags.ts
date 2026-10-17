// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether turning off an engine's two hydraulic pumps was not successful: a pump pb-sw is OFF but its section still
 * has pressure (pressure switch above 2 900 PSI).
 * HYD G (Y) SYS OVHT: the ENG PMP A+B DISC line of an engine is shown only if turning off its pumps was not
 * successful (pump depressurization failed), so that the crew does not disconnect pumps for a recoverable overheat.
 * Design choice: "not successful" is read from the pump section pressure switch, the only pump output the FWS has.
 * @param pumpAAuto the ENG PMP A pb-sw is at AUTO
 * @param pumpAPressurised the pump A section pressure switch is pressurised
 * @param pumpBAuto the ENG PMP B pb-sw is at AUTO
 * @param pumpBPressurised the pump B section pressure switch is pressurised
 * @returns true when the ENG PMP A+B DISC line is shown
 */
export function isEnginePumpsTurnOffUnsuccessful(
  pumpAAuto: boolean,
  pumpAPressurised: boolean,
  pumpBAuto: boolean,
  pumpBPressurised: boolean,
): boolean {
  return (!pumpAAuto && pumpAPressurised) || (!pumpBAuto && pumpBPressurised);
}
