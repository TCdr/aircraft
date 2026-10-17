// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether turning off an engine's two hydraulic pumps was not successful: a pump pb-sw is OFF but its section still
 * has pressure (pressure switch not below 2 500 PSI, the ENG PMP PRESS LO threshold).
 * In HYD G (Y) SYS OVHT the G (Y) ENG 1 (3) PMP A+B DISC line, same for ENG 2 (4), shows only when turning off pump A
 * or B did not depressurise it; showing it always would ask the crew to disconnect four pumps for a recoverable
 * overheat.
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
 * HYD G (Y) SYS OVHT trigger: the green (yellow) reservoir is above 95 C, or an engine pump case drain is above 120 C.
 * The hydraulic model has no fluid temperature: the reservoir overheat (HYD_<color>_RESERVOIR_OVHT) stands for the
 * reservoir term and the overheat of each engine pump (HYD_<color>_<n><A|B>_EDPUMP_OVHT) for its case drain term.
 * @param reservoirOverheat the reservoir of the system overheats
 * @param enginePumpOverheats the overheat of each of the 4 engine pumps of the system
 * @returns true when HYD G (Y) SYS OVHT is raised
 */
export function isHydSystemOverheat(reservoirOverheat: boolean, enginePumpOverheats: readonly boolean[]): boolean {
  return reservoirOverheat || enginePumpOverheats.some((overheat) => overheat);
}
