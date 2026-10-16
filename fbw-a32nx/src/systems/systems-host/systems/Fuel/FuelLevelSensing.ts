// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320Failure } from '@failures';

/*
 * The fuel level sensing of the A320 and the outer tank transfer valves it controls (A320 FCOM DSC-28-10-80 FUEL LEVEL
 * SENSING CONTROL UNIT (FLSCU), a320_fcom.txt l.42603-42614): "The FLSCU comprises: - fuel level sensors in the tanks
 * to sense high, low, and overflow levels. [...] When fuel quantity in one wing tank goes below 750 kg (1 650 lb), the
 * low-level sensor triggers the LO LVL warning on ECAM." Driven by Fuel/FuelPumpsAndValves.
 */

/** A wing of the fuel system */
export type FuelSide = 'L' | 'R';

/**
 * The outer tank transfer valves of a wing (DSC-28-10-30, l.42119-42120: "The transfer valves automatically open, when
 * the inner tank fuel reaches the low level (about 750 kg/1 650 lb), thus enabling the fuel to drain from the outer to
 * inner tanks"). Two MSFS valves per wing (flight_model.cfg Valve.4-7, LeftTransferValve1/2, RightTransferValve1/2),
 * opened by the MSFS triggers of the inner tank low level (Trigger.5/6) and closed when the outer tank is full again
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
   * FUEL L (R) OUTER XFR CLOSED (A320 FCOM PRO-ABN-FUEL, l.86104-86105): "This alert triggers when both transfer valves
   * remain closed after inner tank reaches the low level."
   */
  closed: boolean;
  /**
   * FUEL L (R) OUTER XFR OPEN (l.86142): "This alert triggers when either transfer valve opens before inner tank reaches
   * low level."
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
 * The low level sensor of each wing tank (l.42612-42614). A failed sensor no longer gives the L (R) WING TK LO LVL
 * warning of its wing; FUEL LO LVL DET FAULT (l.86683-86696): "This alert triggers when both low level sensors are
 * failed." Design choice: one sensor per wing tank.
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
 * (flight_model.cfg Trigger.3/4 StopCenterTankXfer, threshold 1 815 gal; the tank holds 1 816 gal). DSC-28-10-30
 * (l.42110-42111): "The FLSCU automatically closes the associated center tank transfer valve when the inner tank is full."
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
  /** A tank pump of the wing runs: the motive flow of the centre tank jet pump (DSC-28-10-30, l.42104-42106) */
  wingTankPumpRunning: boolean;
}

/**
 * Whether the wing tank overflows: the jet pump keeps transferring centre tank fuel into a full inner tank. That happens
 * with the MODE SEL at MAN (DSC-28-10-30, l.42113-42115: "With the MODE SEL in MAN position, the center tank transfer
 * valves will open. Inner tank overflow must be prevented by selecting the CTR TK XFR pb-sw OFF when the inner tanks are
 * full") or with a transfer valve jammed open. FUEL L (R) WING TK OVERFLOW (PRO-ABN-FUEL, l.86638): "This alert
 * triggers when an overflow of the tank is detected." Not modelled: the overflow of a full outer cell by the IDG
 * cooling fuel return (FCOM gap row 28 A32NX #2).
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
 * pb-sw (DSC-28-20, l.42837-42838: "Amber light and associated ECAM caution come on, if the associated wing tank
 * overflows") and the amber inner tank quantity on the SD (l.43239-43241)
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
