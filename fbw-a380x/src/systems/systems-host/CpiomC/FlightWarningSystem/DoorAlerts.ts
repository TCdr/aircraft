// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Door alerts of the A380X FWS: DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) NOT CLOSED, DOOR FWD(AFT) CARGO NOT
 * CLOSED and the door input of CAB PRESS INHIBITED BY DOORS.
 */

/**
 * The 16 passenger doors, in sim interactive point order: the index of a door in this list is its
 * `INTERACTIVE POINT OPEN:<index>` (flight_model.cfg [INTERACTIVE POINTS]: 0-9 main deck, 10-15 upper deck, even =
 * left, odd = right; the DOOR/OXY SD page reads the same points). Points 16-19 are the cargo door requests, fuel and
 * GPU.
 */
export const CABIN_DOORS = [
  'MAIN 1L',
  'MAIN 1R',
  'MAIN 2L',
  'MAIN 2R',
  'MAIN 3L',
  'MAIN 3R',
  'MAIN 4L',
  'MAIN 4R',
  'MAIN 5L',
  'MAIN 5R',
  'UPPER 1L',
  'UPPER 1R',
  'UPPER 2L',
  'UPPER 2R',
  'UPPER 3L',
  'UPPER 3R',
] as const;

export type CabinDoor = (typeof CABIN_DOORS)[number];

/**
 * The cargo doors that exist in the sim: the Rust hydraulic cargo doors FWD and AFT. Design choice: no BULK, the model
 * has no bulk cargo door (no interactive point, no Rust door), so DOOR BULK CARGO NOT CLOSED cannot trigger.
 */
export const CARGO_DOORS = ['FWD', 'AFT'] as const;

export type CargoDoor = (typeof CARGO_DOORS)[number];

/** The ECAM alert id of DOOR <door> NOT CLOSED (texts in EcamMessages/AbnormalSensed/ata46-49-52-56.ts) */
export function cabinDoorNotClosedAlertId(doorIndex: number): string {
  // MAIN 1L is 520800017, then one id per door in CABIN_DOORS order up to UPPER 3R = 520800032
  return (520800017 + doorIndex).toString();
}

/** The ECAM alert id of DOOR FWD(AFT) CARGO NOT CLOSED: FWD = 520800033, AFT = 520800034 */
export function cargoDoorNotClosedAlertId(doorIndex: number): string {
  return (520800033 + doorIndex).toString();
}

/** The L:var of a Rust hydraulic cargo door that is 1 when the door is closed and locked (as the DOOR/OXY SD page) */
export function cargoDoorLockedVariable(door: CargoDoor): string {
  return `L:A32NX_${door}_DOOR_CARGO_LOCKED`;
}

/**
 * Trigger of DOOR ... NOT CLOSED: the door is not closed and not locked. The sim passenger doors have no separate latch
 * or lock, so any opening counts (the Rust air conditioning reads the same points as open above 0).
 * @param openRatio INTERACTIVE POINT OPEN of the door, in percent over 100 (0 = closed, 1 = fully open)
 * @returns true if the door is not closed
 */
export function isCabinDoorNotClosed(openRatio: number): boolean {
  return openRatio > 0;
}

/**
 * @param lockedValue the cargo door's locked L:var (1 = closed and locked)
 * @returns true if the cargo door is not closed and locked
 */
export function isCargoDoorNotClosed(lockedValue: number): boolean {
  // `> 0` rather than a truthiness test: the L:var is read as a number
  return !(lockedValue > 0);
}

/**
 * Door input of CAB PRESS INHIBITED BY DOORS (at least one door not closed and locked when takeoff power is applied).
 * Every door counts: the 10 main deck and 6 upper deck passenger doors and the cargo doors.
 * @param cabinDoorsNotClosed NOT CLOSED state of each passenger door, in CABIN_DOORS order
 * @param cargoDoorsNotClosed NOT CLOSED state of each cargo door, in CARGO_DOORS order
 * @returns true if at least one door is not closed and locked
 */
export function isAnyDoorNotClosed(
  cabinDoorsNotClosed: readonly boolean[],
  cargoDoorsNotClosed: readonly boolean[],
): boolean {
  return cabinDoorsNotClosed.some((notClosed) => notClosed) || cargoDoorsNotClosed.some((notClosed) => notClosed);
}

/**
 * Door part of the takeoff configuration test (T.O CONFIG pb, T.O CONFIG NORMAL). The test can trigger DOOR MAIN
 * 1(2)(3)(4)(5) R(L) NOT CLOSED, DOOR UPPER 1(2)(3)(4) R(L) NOT CLOSED, DOOR FWD(AFT)(MAIN)(UPPER)(BULK) CARGO NOT
 * CLOSED and DOOR CKPT SLIDING WINDOW NOT CLOSED. So every passenger door, every cargo door and both cockpit sliding
 * windows must be closed for T.O CONFIG NORMAL.
 * @param cabinDoorsNotClosed NOT CLOSED state of each passenger door, in CABIN_DOORS order
 * @param cargoDoorsNotClosed NOT CLOSED state of each cargo door, in CARGO_DOORS order
 * @param cockpitSlidingWindowOpen true if the CAPT or F/O sliding window is open
 * @returns true if the doors and windows do not prevent T.O CONFIG NORMAL
 */
export function areDoorsInTakeoffConfig(
  cabinDoorsNotClosed: readonly boolean[],
  cargoDoorsNotClosed: readonly boolean[],
  cockpitSlidingWindowOpen: boolean,
): boolean {
  return !isAnyDoorNotClosed(cabinDoorsNotClosed, cargoDoorsNotClosed) && !cockpitSlidingWindowOpen;
}
