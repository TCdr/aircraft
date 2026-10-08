// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The ENG MODE selector positions (L:XMLVAR_ENG_MODE_SEL) */
const ENG_MODE_SEL_NORM = 1;

/**
 * The starting sequence indications of the SD ENG page (igniters, start valve, starter inlet pressure, A320 FCOM DSC-70-90-40
 * l.64584-64616) show with the ENG MODE selector at IGN/START or at CRANK. A320 FCOM DSC-31-15 (a320_fcom.txt l.46152): "The
 * ENGINE page appears at the beginning of start sequence or when a pilot selects CRANK": a dry crank shows its start valve.
 * They showed at IGN/START only before.
 */
export function isStartIndicationShown(engModeSelectorPosition: number): boolean {
  return engModeSelectorPosition !== ENG_MODE_SEL_NORM;
}
