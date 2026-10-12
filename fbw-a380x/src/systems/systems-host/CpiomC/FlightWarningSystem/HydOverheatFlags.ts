// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether turning off an engine's two hydraulic pumps was not successful: a pump pb-sw is OFF but its section still
 * has pressure (pressure switch above 2 900 PSI).
 * A380 FCOM PRO-ABN HYD G (Y) SYS OVHT (a380_fcom.txt l.155460-155470): "If turning off G (Y) ENG 1 (3) PMP A or B is
 * not successful: G(Y) ENG 1(3) PMP A+B ... DISC", same for ENG 2 (4); DSC-29-20 ENG PMP A+B DISC pb (l.61325):
 * "HYD G(Y) SYS OVHT (If pump depressurization failed)". The two DISC lines were always shown, asking the crew to
 * disconnect four pumps for a recoverable overheat.
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
