// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The three FMCs of the A380 (FCOM DSC-22-FMS-30: FMC-A on FMS 1, FMC-B on FMS 2, FMC-C in standby) */
const FMC_LETTERS = ['A', 'B', 'C'] as const;

/** Reads a boolean simvar, e.g. (name) => SimVar.GetSimVarValue(name, SimVarValueType.Bool) */
export type BoolSimVarReader = (name: string) => boolean | number;

/**
 * Whether the overhead reset panel buttons of all three FMCs (L:A32NX_RESET_PANEL_FMC_A/B/C) are pulled.
 * The FMS is only lost when FMC-A, FMC-B and FMC-C are all lost (FCOM PRO-ABN-ECAM-10-22-FMS AUTO FLT FMS 1+2 FAULT),
 * so one FMC still in keeps it running.
 * @param readBool reads a boolean simvar
 * @returns true when every FMC reset button is pulled
 */
export function allFmcResetsPulled(readBool: BoolSimVarReader): boolean {
  return FMC_LETTERS.every((fmc) => !!readBool(`L:A32NX_RESET_PANEL_FMC_${fmc}`));
}

/**
 * Whether all three FMCs report themselves unhealthy (L:A32NX_FMC_A/B/C_IS_HEALTHY false).
 * @param readBool reads a boolean simvar
 * @returns true when no FMC is healthy
 */
export function allFmcInop(readBool: BoolSimVarReader): boolean {
  return FMC_LETTERS.every((fmc) => !readBool(`L:A32NX_FMC_${fmc}_IS_HEALTHY`));
}
