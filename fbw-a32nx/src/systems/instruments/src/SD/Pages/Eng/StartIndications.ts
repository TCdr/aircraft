// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The NORM position of the ENG MODE selector (L:XMLVAR_ENG_MODE_SEL) */
const ENG_MODE_SEL_NORM = 1;

/**
 * The starting sequence indications of the SD ENG page (igniters, start valve, starter inlet pressure) show with the
 * ENG MODE selector at IGN/START or at CRANK: the ENGINE page also comes up when the crew selects CRANK, so a dry crank
 * shows its start valve.
 */
export function isStartIndicationShown(engModeSelectorPosition: number): boolean {
  return engModeSelectorPosition !== ENG_MODE_SEL_NORM;
}
