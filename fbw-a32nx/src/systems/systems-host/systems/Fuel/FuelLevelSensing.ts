// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320Failure } from '@failures';

/*
 * The fuel level sensing of the A320 and the outer tank transfer valves it controls: the FLSCU has fuel level sensors
 * in the tanks for the high, low and overflow levels; when a wing tank goes below 750 kg (1 650 lb), the low-level
 * sensor triggers the LO LVL warning on ECAM. Driven by Fuel/FuelPumpsAndValves.
 */

/** A wing of the fuel system */
export type FuelSide = 'L' | 'R';

/**
 * The outer tank transfer valves of a wing: they open automatically when the inner tank reaches the low level (about
 * 750 kg/1 650 lb), so that the outer tank fuel drains into the inner tank. Two MSFS valves per wing (flight_model.cfg
 * Valve.4-7, LeftTransferValve1/2, RightTransferValve1/2), opened by the MSFS triggers of the inner tank low level (Trigger.5/6) and closed when the outer tank is full again
 * (Trigger.7/8, refuelling). The FADEC moves the outer tank fuel into the inner tank while one of them is open.
 */
export interface A320OuterTransferValves {
  side: FuelSide;
  /** The failure that jams both valves where they are */
  failure: number;
  /** The MSFS valves (Valve.N): transfer valve 1, transfer valve 2 */
  valves: readonly [number, number];
}

export const A320_OUTER_TRANSFER_VALVES: readonly A320OuterTransferValves[] = [
  // Valve.6 LeftTransferValve1, Valve.4 LeftTransferValve2
  { side: 'L', failure: A320Failure.LeftOuterTankTransferValvesJammed, valves: [6, 4] },
  // Valve.7 RightTransferValve1, Valve.5 RightTransferValve2
  { side: 'R', failure: A320Failure.RightOuterTankTransferValvesJammed, valves: [7, 5] },
];

/** The outer tank transfer valves of a wing that disagree with the low level command */
export interface OuterTransferDisagreement {
  /**
   * FUEL L (R) OUTER XFR CLOSED: both transfer valves stay closed after the inner tank reaches the low level.
   */
  closed: boolean;
  /**
   * FUEL L (R) OUTER XFR OPEN: a transfer valve opens before the inner tank reaches the low level.
   */
  open: boolean;
}

/**
 * @param commandedOpen whether the low level commands the valves open (the MSFS triggers, as the switch selection)
 * @param positions how far each valve of the wing is open, 0 to 1
 */
export function outerTransferDisagreement(
  commandedOpen: boolean,
  positions: readonly number[],
): OuterTransferDisagreement {
  return {
    closed: commandedOpen && positions.every((position) => position <= 0),
    open: !commandedOpen && positions.some((position) => position > 0),
  };
}

/**
 * Design choice: the MSFS transfer valves have no travel time, a disagreement is confirmed after this, in seconds (as the
 * centre tank transfer valves, FuelPumpsAndValves.CTR_TK_XFR_DISAGREE_CONFIRM_S)
 */
export const OUTER_XFR_DISAGREE_CONFIRM_S = 5;

/** The L:var of FUEL L (R) OUTER XFR CLOSED (confirmed) */
export function outerXfrClosedVar(side: FuelSide): string {
  return `L:A32NX_FUEL_${side}_OUTER_XFR_CLOSED`;
}

/** The L:var of FUEL L (R) OUTER XFR OPEN (confirmed) */
export function outerXfrOpenVar(side: FuelSide): string {
  return `L:A32NX_FUEL_${side}_OUTER_XFR_OPEN`;
}

/**
 * The low level sensor of each wing tank. A failed sensor no longer gives the L (R) WING TK LO LVL warning of its wing;
 * FUEL LO LVL DET FAULT triggers when both low level sensors are failed. Design choice: one sensor per wing tank.
 */
export const A320_WING_LOW_LEVEL_SENSORS: readonly { side: FuelSide; failure: number }[] = [
  { side: 'L', failure: A320Failure.LeftWingTankLowLevelSensor },
  { side: 'R', failure: A320Failure.RightWingTankLowLevelSensor },
];

/** The L:var that tells the FWC that the low level sensor of a wing tank is failed */
export function wingLowLevelSensorFaultVar(side: FuelSide): string {
  return `L:A32NX_FUEL_${side}_WING_TK_LO_LVL_SENSOR_FAULT`;
}

/**
 * The inner tank is full: the FLSCU full level at which it closes the centre tank transfer valve in AUTO mode, in gallons
 * (flight_model.cfg Trigger.3/4 StopCenterTankXfer, threshold 1 815 gal; the tank holds 1 816 gal): the FLSCU closes
 * the centre tank transfer valve of a full inner tank.
 */
export const INNER_TANK_FULL_GALLONS = 1815;

/** What the overflow detection of a wing reads */
export interface WingOverflowInputs {
  /** The inner tank quantity, in gallons */
  innerTankGallons: number;
  /** The centre tank quantity, in gallons */
  centreTankGallons: number;
  /** How far the centre tank transfer valve of the wing is open, 0 to 1 */
  centreTransferValveOpenRatio: number;
  /** A tank pump of the wing runs: the motive flow of the centre tank jet pump */
  wingTankPumpRunning: boolean;
}

/**
 * Whether the wing tank overflows: the jet pump keeps transferring centre tank fuel into a full inner tank. That happens
 * with the MODE SEL at MAN (the centre tank transfer valves open, and the crew must select the CTR TK XFR pb-sw OFF
 * when the inner tanks are full) or with a transfer valve jammed open. Not modelled: the overflow of a full outer cell
 * by the IDG cooling fuel return.
 */
export function isWingTankOverflowing(inputs: WingOverflowInputs): boolean {
  return (
    inputs.innerTankGallons >= INNER_TANK_FULL_GALLONS &&
    inputs.centreTankGallons > 0 &&
    inputs.centreTransferValveOpenRatio > 0 &&
    inputs.wingTankPumpRunning
  );
}

/** Design choice: the fuel takes this long to reach the overflow sensor of the vent surge tank, in seconds */
export const WING_OVERFLOW_CONFIRM_S = 10;

/**
 * The L:var of a wing tank overflow (confirmed): FUEL L (R) WING TK OVERFLOW, the FAULT light of the CTR TK L (R) XFR
 * pb-sw (the amber light and the caution come on when its wing tank overflows) and the amber inner tank quantity on
 * the SD
 */
export function wingTankOverflowVar(side: FuelSide): string {
  return `L:A32NX_FUEL_${side}_WING_TK_OVERFLOW`;
}

/** The wing tank leak failures, read by the FADEC (CrossFeedBurn_A32NX.hpp wingTankLeakPounds) */
export const A320_WING_TANK_LEAKS: readonly { side: FuelSide; failure: number }[] = [
  { side: 'L', failure: A320Failure.LeftWingTankLeak },
  { side: 'R', failure: A320Failure.RightWingTankLeak },
];

/** The L:var that tells the FADEC that a wing tank leaks */
export function wingTankLeakVar(side: FuelSide): string {
  return `L:A32NX_FUEL_${side}_WING_TK_LEAK`;
}
