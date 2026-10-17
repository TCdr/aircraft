// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The FADEC, thrust lever and thrust reverser alerts of the A380: ENG 1(2)(3)(4) FADEC FAULT, FADEC SYS FAULT, FADEC
 * TEMP HI, THR LEVER FAULT, ENG 2(3) REVERSER CTL FAULT, ENERGIZED, FAULT, LOCKED, UNLOCKED and ENG REVERSER SELECTED.
 * All are amber cautions with a single chime (SC). Their triggers come from systems.wasm (a380_systems
 * engine_control_failure.rs and reverser), which writes the FADEC status:
 * - L:A32NX_ENGINE_n_FADEC_FAULT / _FADEC_SYS_FAULT / _FADEC_HI_TEMP / _THR_LEVER_FAULT / _THR_LEVER_RATING
 * - L:A32NX_REVERSER_n_FAULT / _CTL_FAULT / _LOCKED / _UNLOCKED / _ENERGIZED (n = 2, 3)
 *
 * ENG 2(3) REVERSER INHIBITED (maintenance action) and REVERSER MINOR FAULT (after landing, no effect) come from
 * L:A32NX_REVERSER_n_INHIBITED / _MINOR_FAULT (a380_systems reverser, flyPad failures 78061/78062 and 78051/78052).
 * Neither has an audio, a master light or an SD page: FwsAbnormalSensed level 1.
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
export const REVERSER_INHIBITED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];
/** ENG 2(3) REVERSER MINOR FAULT shows only after landing: a FADEC failure that does not impair the reverser */
export const REVERSER_MINOR_FAULT_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** REVERSER INHIBITED and REVERSER MINOR FAULT: no audio, no master light (see the file comment) */
export const REVERSER_MAINTENANCE_ALERTS_LEVEL = 1;

/**
 * ENG 1(2)(3)(4) FADEC FAULT items: 0 THR LEVER n MAN ADJUST (only with the A/THR engaged), 1 ENG n PARAMETERS MONITOR,
 * 2 .IF ABNORMAL, 3 THR LEVER n IDLE, 4 ENG n MASTER OFF.
 */
export function fadecFaultItemsShown(athrEngaged: boolean): boolean[] {
  return [athrEngaged, true, true, true, true];
}

export function fadecFaultItemsChecked(thrLeverIdle: boolean, masterOff: boolean): boolean[] {
  return [false, false, false, thrLeverIdle, masterOff];
}

/**
 * ENG 1(2)(3)(4) THR LEVER FAULT items: 0 ENG n IDLE ONLY, 1 THR LEVER n IDLE (both on ground), 2 ENG n CLB ONLY,
 * 3 THR LEVER n CLB (both in flight), and for the engines 2 and 3, 4 LDG DIST IMPACT ON WET/CONTAM RWY ONLY.
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
 * ENG 2(3) REVERSER CTL FAULT, REVERSER FAULT, REVERSER INHIBITED and REVERSER LOCKED items: 0 T.O PERF CHECK, 1 LDG
 * DIST IMPACT ON WET/CONTAM RWY ONLY. T.O PERF CHECK shows before takeoff (CTL FAULT, INHIBITED, LOCKED) or on ground
 * (FAULT). Design choice: before takeoff = on the ground.
 */
export function reverserInopItemsShown(onGround: boolean): boolean[] {
  return [onGround, true];
}

/**
 * ENG 2(3) REVERSER UNLOCKED items: 0 ENG n IDLE ONLY, 1 THR LEVER n IDLE, 2 ENG n MASTER OFF (on ground), 3 .IF
 * BUFFET, 4 ENG n MASTER OFF (in flight).
 */
export function reverserUnlockedItemsShown(onGround: boolean): boolean[] {
  return [true, true, onGround, !onGround, !onGround];
}

export function reverserUnlockedItemsChecked(thrLeverIdle: boolean, masterOff: boolean): boolean[] {
  return [false, thrLeverIdle, masterOff, false, masterOff];
}

/** ENG REVERSER SELECTED: a thrust reverser is selected in flight (the lever of engine 2 or 3 in reverse) */
export function isReverserSelectedInFlight(tlaDeg: number, onGround: boolean): boolean {
  return !onGround && tlaDeg < 0;
}

/** ENG REVERSER SELECTED items: 0 THR LEVER 2 FWD THR, 1 THR LEVER 3 FWD THR, 2 THR LEVERS 2+3 FWD THR */
export function reverserSelectedItemsShown(reverser2Selected: boolean, reverser3Selected: boolean): boolean[] {
  return [
    reverser2Selected && !reverser3Selected,
    reverser3Selected && !reverser2Selected,
    reverser2Selected && reverser3Selected,
  ];
}

/** The STATUS INFO of a failed thrust lever: ENG n IDLE ONLY on ground, ENG n CLB ONLY in flight */
export function thrLeverFaultInfo(thrLeverFault: boolean, onGround: boolean): { idleOnly: boolean; clbOnly: boolean } {
  return { idleOnly: thrLeverFault && onGround, clbOnly: thrLeverFault && !onGround };
}

/**
 * INOP SYS ENG 2(3) REVERSER and BTV (APPR): the reverser cannot deploy, from REVERSER CTL FAULT, REVERSER FAULT,
 * REVERSER LOCKED, REVERSER INHIBITED or THR LEVER 2(3) FAULT.
 */
export function isReverserInoperative(
  reverserFault: boolean,
  reverserCtlFault: boolean,
  reverserLocked: boolean,
  thrLeverFault: boolean,
  reverserInhibited: boolean,
): boolean {
  return reverserFault || reverserCtlFault || reverserLocked || thrLeverFault || reverserInhibited;
}
