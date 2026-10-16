// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The line style of a valve symbol on the BLEED page */
export type ValveLineCss = 'GreenLine' | 'AmberLine';

/**
 * The HP valve symbol of the BLEED page. A320 FCOM DSC-36-20 ECAM BLEED PAGE (a320_fcom.txt l.57754-57758): "Crossline
 * - Green: HP valve normally fully closed", "In line - Green: HP valve not fully closed", "Crossline - Amber: HP valve
 * not in commanded (closed) position". The FCOM has no amber in line state. The BMC finds the valve closed while it
 * should be open (L:A32NX_PNEU_ENG_n_HP_VALVE_FAULT, pneumatic.rs, the AIR ENG 1(2) HP VALVE FAULT condition).
 * @param hpValveOpen L:A32NX_PNEU_ENG_n_HP_VALVE_OPEN
 * @param hpValveFault L:A32NX_PNEU_ENG_n_HP_VALVE_FAULT
 * @returns the line style of the symbol
 */
export function hpValveCss(hpValveOpen: boolean, hpValveFault: boolean): ValveLineCss {
  return !hpValveOpen && hpValveFault ? 'AmberLine' : 'GreenLine';
}

/**
 * The engine bleed valve symbol of the BLEED page. A320 FCOM DSC-36-20 ECAM BLEED PAGE (a320_fcom.txt l.57760-57768):
 * green in line/crossline when normally open/closed, "In line - Amber: BLEED valve not in commanded (open) position",
 * "Crossline - Amber: BLEED valve not in commanded (closed) position". The BMC compares the valve with its command
 * (L:A32NX_PNEU_ENG_n_PR_VALVE_DISAGREE, pneumatic.rs); the symbol keeps showing the actual position.
 * @param positionDisagrees L:A32NX_PNEU_ENG_n_PR_VALVE_DISAGREE
 * @returns the line style of the symbol
 */
export function engineBleedValveCss(positionDisagrees: boolean): ValveLineCss {
  return positionDisagrees ? 'AmberLine' : 'GreenLine';
}
