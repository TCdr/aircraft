// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type ValveLineCss = 'GreenLine' | 'AmberLine';

/**
 * The HP valve symbol of the BLEED page: green crossline when normally fully closed, green in line when not fully
 * closed, amber crossline when not in the commanded position; there is no amber in line state. The BMC finds the valve
 * closed while it should be open (L:A32NX_PNEU_ENG_n_HP_VALVE_FAULT, pneumatic.rs, the AIR ENG 1(2) HP VALVE FAULT
 * condition).
 * @param hpValveOpen L:A32NX_PNEU_ENG_n_HP_VALVE_OPEN
 * @param hpValveFault L:A32NX_PNEU_ENG_n_HP_VALVE_FAULT
 * @returns the line style of the symbol
 */
export function hpValveCss(hpValveOpen: boolean, hpValveFault: boolean): ValveLineCss {
  return !hpValveOpen && hpValveFault ? 'AmberLine' : 'GreenLine';
}

/**
 * The engine bleed valve symbol of the BLEED page: green in line or crossline when open or closed as commanded, amber
 * when not in the commanded position. The BMC compares the valve with its command
 * (L:A32NX_PNEU_ENG_n_PR_VALVE_DISAGREE, pneumatic.rs); the symbol keeps showing the actual position.
 * @param positionDisagrees L:A32NX_PNEU_ENG_n_PR_VALVE_DISAGREE
 * @returns the line style of the symbol
 */
export function engineBleedValveCss(positionDisagrees: boolean): ValveLineCss {
  return positionDisagrees ? 'AmberLine' : 'GreenLine';
}
