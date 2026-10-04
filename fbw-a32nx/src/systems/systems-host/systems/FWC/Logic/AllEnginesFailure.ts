// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The APU start of the ALL ENGINES FAILURE procedure applies below FL 250 */
export const APU_START_MAX_PRESSURE_ALTITUDE_FT = 25_000;

/**
 * Whether the "-APU ... START" line of ENG ALL ENGINES FAILURE is shown. A320 FCOM PRO-ABN-ENG ALL ENGINES FAILURE:
 * "APU (BELOW FL 250) ..... START". The line was gated on a radio altitude below 2 500 ft, which hid it for most of an
 * all engines failure in flight. The 24-character ECAM line has no room for "(BELOW FL 250)", so the condition gates
 * the line, as the FWC does with the other conditional lines.
 * @param apuMasterOn the APU MASTER SW is ON
 * @param apuAvail the APU is available
 * @param pressureAltitudeFt the ADR pressure altitude, null when no ADR is valid
 * @returns true when the line is shown
 */
export function isApuStartLineShown(
  apuMasterOn: boolean,
  apuAvail: boolean,
  pressureAltitudeFt: number | null,
): boolean {
  return !(apuMasterOn || apuAvail) && (pressureAltitudeFt ?? 0) < APU_START_MAX_PRESSURE_ALTITUDE_FT;
}
