// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** L:A32NX_FLAPS_CONF_INDEX of CONF 1+F (the SFCC FlapsConf order: 0, 1, 1+F, 2, 2S, 3, FULL) */
const CONF_1_PLUS_F_INDEX = 2;

/**
 * Whether the aileron droop symbol (white circle) is shown on the SD F/CTL page. A380 FCOM DSC-27-10-20 F/CTL page
 * (a380_fcom.txt l.55743-55746): "When the flaps are extended (CONF 1+F, 2, 3, and FULL), the neutral position of the
 * ailerons is 5 ° down. The neutral position in high-lift configurations (aileron droop) is represented by a white round
 * symbol." It was always shown. CONF 2S is a CONF 2 with the flaps extended, so it shows the symbol too.
 * @param flapsConfIndex L:A32NX_FLAPS_CONF_INDEX
 * @returns true when the symbol is shown
 */
export function isAileronDroopSymbolShown(flapsConfIndex: number): boolean {
  return flapsConfIndex >= CONF_1_PLUS_F_INDEX;
}
