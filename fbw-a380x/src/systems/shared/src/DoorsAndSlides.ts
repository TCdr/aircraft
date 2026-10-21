// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * What the Doors and Slides Management System (DSMS) and the cockpit door locking system publish for the FWS and the
 * DOOR/OXY SD page. A per-door output is a bit field: bit n is the passenger door at sim interactive point n (0-9 main
 * deck MAIN 1L ... MAIN 5R, 10-15 upper deck UPPER 1L ... UPPER 3R, even = left, odd = right).
 */

export const PASSENGER_DOOR_COUNT = 16;

export const DSMS_CHANNEL_COUNT = 3;

/** The DSMS L:vars. The per-door faults are the ones the DSMS detects: a door that it no longer monitors has none. */
export const DSMS_VARS = {
  /** Bit field: the opening/closing actuator of the door is failed */
  actuatorFault: 'L:A32NX_DSMS_DOOR_ACTUATOR_FAULT',
  /** Bit field: the flight lock actuator is failed, or detected in the wrong position */
  flightLockFault: 'L:A32NX_DSMS_FLIGHT_LOCK_FAULT',
  /** Bit field: the flight lock locks the door handle */
  flightLockEngaged: 'L:A32NX_DSMS_FLIGHT_LOCK_ENGAGED',
  /** Bit field: the local door controller (LDC) can no longer monitor the door latches */
  latchMonitoringFault: 'L:A32NX_DSMS_LATCH_MONITORING_FAULT',
  /** Bit field: the local door controller (LDC) of the door is failed */
  ldcFault: 'L:A32NX_DSMS_LDC_FAULT',
  /** Bit field: the door position is not known (no LDC, or no DSMS channel) */
  positionInvalid: 'L:A32NX_DSMS_DOOR_POSITION_INVALID',
  /** Bit field: the escape slide is not ready or is failed */
  slideFault: 'L:A32NX_DSMS_SLIDE_FAULT',
  /** Bit field (MAIN 1L and 1R only): the sill height sensors are failed, no slide extension */
  slideLengtheningFault: 'L:A32NX_DSMS_SLIDE_LENGTHENING_FAULT',
  /** Number of failed DSMS channels, 0 to 3 */
  channelsFailed: 'L:A32NX_DSMS_CHANNELS_FAILED',
  /** The ASPSU is failed: no detection of the residual cabin differential pressure at the doors */
  residualPressureDetectionFault: 'L:A32NX_DSMS_RESIDUAL_PRESS_DET_FAULT',
} as const;

/** The cockpit door locking system L:vars */
export const COCKPIT_DOOR_VARS = {
  /** 1 when the door is locked; the CKPT DOOR sw sets it (LOCK = 1, UNLOCK = 0) */
  locked: 'L:A32NX_COCKPIT_DOOR_LOCKED',
  /** Counts the CKPT DOOR sw selections to LOCK or UNLOCK (the sw is momentary) */
  switchSelections: 'L:A32NX_COCKPIT_DOOR_SW_SELECTIONS',
  /** 1 from the emergency code entry on the keypad until the crew answers or the door unlocks by itself */
  emerOpeningInProgress: 'L:A32NX_COCKPIT_DOOR_EMER_OPENING_IN_PROGRESS',
} as const;

/**
 * @param flags one flag per door, in interactive point order
 * @returns the bit field of the flags
 */
export function doorBits(flags: readonly boolean[]): number {
  return flags.reduce((bits, flag, door) => (flag ? bits | (1 << door) : bits), 0);
}

/**
 * @param bits a DSMS bit field, as read from its L:var
 * @param door the door's interactive point
 * @returns the flag of the door
 */
export function isDoorBitSet(bits: number, door: number): boolean {
  return ((Math.round(bits) >> door) & 1) === 1;
}

/**
 * @param bits a DSMS bit field, as read from its L:var
 * @param doorCount the number of doors in the field
 * @returns one flag per door
 */
export function doorFlags(bits: number, doorCount = PASSENGER_DOOR_COUNT): boolean[] {
  return Array.from({ length: doorCount }, (_, door) => isDoorBitSet(bits, door));
}
