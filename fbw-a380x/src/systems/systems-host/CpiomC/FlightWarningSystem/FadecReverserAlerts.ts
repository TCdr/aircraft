// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The FADEC, thrust lever and thrust reverser alerts of the A380 (engine failures stage B5): ENG 1(2)(3)(4) FADEC FAULT,
 * FADEC SYS FAULT, FADEC TEMP HI, THR LEVER FAULT, ENG 2(3) REVERSER CTL FAULT, ENERGIZED, FAULT, LOCKED, UNLOCKED and
 * ENG REVERSER SELECTED (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt l.171542-171693, 173303-173335, 173440-173700,
 * 175028-175039). All are amber cautions with a single chime (SC). Their triggers come from systems.wasm (a380_systems
 * engine_control_failure.rs and reverser), which writes the FADEC status:
 * - L:A32NX_ENGINE_n_FADEC_FAULT / _FADEC_SYS_FAULT / _FADEC_HI_TEMP / _THR_LEVER_FAULT / _THR_LEVER_RATING
 * - L:A32NX_REVERSER_n_FAULT / _CTL_FAULT / _LOCKED / _UNLOCKED / _ENERGIZED (n = 2, 3)
 *
 * The ENG 2(3) REVERSER INHIBITED (maintenance action) and REVERSER MINOR FAULT (after landing, no effect) alerts have no
 * flyPad failure and are not wired.
 */

/**
 * Flight phase inhibitions, read on the A380 FCOM PDF figures (airbus-a380-fcom_compress.pdf pages 5771, 5774, 5775,
 * 5820, 5824, 5825, 5826, 5829, 5831, 5856).
 */
export const FADEC_FAULT_PHASE_INHIBITION = [4, 5, 6, 7, 9, 10];
export const FADEC_SYS_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];
export const FADEC_TEMP_HI_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];
export const THR_LEVER_FAULT_PHASE_INHIBITION = [5, 6];
export const REVERSER_CTL_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7];
export const REVERSER_ENERGIZED_PHASE_INHIBITION = [4, 5, 6, 7, 9, 10];
export const REVERSER_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7];
export const REVERSER_LOCKED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9];
export const REVERSER_UNLOCKED_PHASE_INHIBITION = [5, 6];
export const REVERSER_SELECTED_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 10, 11, 12];

/**
 * ENG 1(2)(3)(4) FADEC FAULT items (ata70 701800013-016): 0 THR LEVER n MAN ADJUST, 1 ENG n PARAMETERS MONITOR,
 * 2 .IF ABNORMAL, 3 THR LEVER n IDLE, 4 ENG n MASTER OFF.
 * l.171571-171584: "If A/THR engaged: THR LEVER 1(2)(3)(4) MAN ADJUST", ENG PARAMETERS MONITOR, "IF ABNORMAL: THR LEVER
 * IDLE, ENG MASTER OFF".
 */
export function fadecFaultItemsShown(athrEngaged: boolean): boolean[] {
  return [athrEngaged, true, true, true, true];
}

export function fadecFaultItemsChecked(thrLeverIdle: boolean, masterOff: boolean): boolean[] {
  return [false, false, false, thrLeverIdle, masterOff];
}

/**
 * ENG 1(2)(3)(4) THR LEVER FAULT items (ata70 701800129-132): 0 ENG n IDLE ONLY, 1 THR LEVER n IDLE, 2 ENG n CLB ONLY,
 * 3 THR LEVER n CLB, and for the engines 2 and 3, 4 LDG DIST IMPACT ON WET/CONTAM RWY ONLY.
 * l.173316-173326: "On ground: ENG IDLE ONLY, THR LEVER IDLE. In flight: ENG CLB ONLY, THR LEVER CLB. If THR LEVER 2 (3)
 * is affected: LDG DIST IMPACT ON WET/CONTAM RWY ONLY".
 */
export function thrLeverFaultItemsShown(onGround: boolean, engineWithReverser: boolean): boolean[] {
  return [onGround, onGround, !onGround, !onGround, ...(engineWithReverser ? [true] : [])];
}

export function thrLeverFaultItemsChecked(
  thrLeverIdle: boolean,
  thrLeverInClimbDetent: boolean,
  engineWithReverser: boolean,
): boolean[] {
  return [false, thrLeverIdle, false, thrLeverInClimbDetent, ...(engineWithReverser ? [false] : [])];
}

/** The CL detent of the thrust lever (TLA 25 degrees) */
export function isThrLeverInClimbDetent(tlaDeg: number): boolean {
  return Math.abs(tlaDeg - 25) < 0.5;
}

/**
 * ENG 2(3) REVERSER CTL FAULT, REVERSER FAULT and REVERSER LOCKED items: 0 T.O PERF CHECK, 1 LDG DIST IMPACT ON
 * WET/CONTAM RWY ONLY. "Before takeoff" (CTL FAULT, LOCKED, l.173459, 173606) or "On ground" (FAULT, l.173527): T.O PERF
 * CHECK. Design choice: before takeoff = on the ground.
 */
export function reverserInopItemsShown(onGround: boolean): boolean[] {
  return [onGround, true];
}

/**
 * ENG 2(3) REVERSER UNLOCKED items (ata70 701800149-150): 0 ENG n IDLE ONLY, 1 THR LEVER n IDLE, 2 ENG n MASTER OFF
 * (on ground), 3 .IF BUFFET, 4 ENG n MASTER OFF (in flight).
 * l.173678-173692: "ENG 2(3) IDLE ONLY. On ground: THR LEVER IDLE, ENG MASTER OFF. In flight: THR LEVER IDLE, IF BUFFET:
 * ENG MASTER OFF".
 */
export function reverserUnlockedItemsShown(onGround: boolean): boolean[] {
  return [true, true, onGround, !onGround, !onGround];
}

export function reverserUnlockedItemsChecked(thrLeverIdle: boolean, masterOff: boolean): boolean[] {
  return [false, thrLeverIdle, masterOff, false, masterOff];
}

/** ENG REVERSER SELECTED, l.175033: "Any thrust reverser is selected in flight" (the lever of engine 2 or 3 in reverse) */
export function isReverserSelectedInFlight(tlaDeg: number, onGround: boolean): boolean {
  return !onGround && tlaDeg < 0;
}

/**
 * ENG REVERSER SELECTED items (ata70 701800154): 0 THR LEVER 2 FWD THR, 1 THR LEVER 3 FWD THR, 2 THR LEVERS 2+3 FWD THR
 * (l.175039: "THR LEVER 2(3)(2+3) FWD THR").
 */
export function reverserSelectedItemsShown(reverser2Selected: boolean, reverser3Selected: boolean): boolean[] {
  return [
    reverser2Selected && !reverser3Selected,
    reverser3Selected && !reverser2Selected,
    reverser2Selected && reverser3Selected,
  ];
}

/** The STATUS INFO of a failed thrust lever: ENG n IDLE ONLY on ground, ENG n CLB ONLY in flight (l.173332-173335) */
export function thrLeverFaultInfo(thrLeverFault: boolean, onGround: boolean): { idleOnly: boolean; clbOnly: boolean } {
  return { idleOnly: thrLeverFault && onGround, clbOnly: thrLeverFault && !onGround };
}

/**
 * INOP SYS ENG 2(3) REVERSER and BTV (APPR): the reverser cannot deploy, from REVERSER CTL FAULT, REVERSER FAULT,
 * REVERSER LOCKED (l.173469-173471, 173535-173537, 173615-173617) or THR LEVER 2(3) FAULT (l.173327-173329).
 */
export function isReverserInoperative(
  reverserFault: boolean,
  reverserCtlFault: boolean,
  reverserLocked: boolean,
  thrLeverFault: boolean,
): boolean {
  return reverserFault || reverserCtlFault || reverserLocked || thrLeverFault;
}
