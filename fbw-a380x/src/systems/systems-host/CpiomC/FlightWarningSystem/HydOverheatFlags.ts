// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether turning off an engine's two hydraulic pumps was not successful: a pump pb-sw is OFF but its section still
 * has pressure (pressure switch not below 2 500 PSI, the ENG PMP PRESS LO threshold of l.155038).
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

/**
 * HYD G (Y) SYS OVHT trigger. A380 FCOM PRO-ABN (a380_fcom.txt l.155436-155437): "The temperature of the green (yellow)
 * hydraulic reservoir is above 95 C, or an engine pump case drain temperature is above 120 C".
 * The hydraulic model has no fluid temperature: the reservoir overheat (HYD_<color>_RESERVOIR_OVHT) stands for the
 * reservoir term and the overheat of each engine pump (HYD_<color>_<n><A|B>_EDPUMP_OVHT) for its case drain term.
 * @param reservoirOverheat the reservoir of the system overheats
 * @param enginePumpOverheats the overheat of each of the 4 engine pumps of the system
 * @returns true when HYD G (Y) SYS OVHT is raised
 */
export function isHydSystemOverheat(reservoirOverheat: boolean, enginePumpOverheats: readonly boolean[]): boolean {
  return reservoirOverheat || enginePumpOverheats.some((overheat) => overheat);
}
