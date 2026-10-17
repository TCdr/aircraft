// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) tank alerts FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL, FUEL FEED TK 1(2)(3)(4) TEMP HI, FUEL
 * TEMP LO, FUEL INR(MID)(OUTR)(TRIM) TK MAN XFR COMPLETED, with their procedure lines, and the transfer lines of FUEL
 * FEED TK 1(2)(3)(4) LEVEL LO and FUEL FEED TKs 1+2(3+4) LEVEL LO.
 *
 * The aircraft quantities are given in lb; they are converted to kg here.
 */

import {
  FEED_TANK_TEMP_HI_C,
  FUEL_TEMP_LO_C,
  isCollectorCellNotFull,
  isTemperatureSensorImmersed,
} from '@shared/FuelTankIndications';

const KG_PER_LB = 0.45359237;

/** FUEL TEMP LO: WHEN ANY FEED TK < 35300 LBS (AUTO RCL), OUTR TK XFR MAN */
export const TEMP_LO_OUTER_XFR_FEED_TANK_KG = 35_300 * KG_PER_LB;

/**
 * Flight phase inhibitions: FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL every phase but 2 and 8; FUEL FEED TK 1(2)(3)(4)
 * TEMP HI phases 3-7, 9, 10; FUEL TEMP LO phases 3-7, 9-12; FUEL INR TKs, MID TKs, OUTR TKs and TRIM TK MAN XFR
 * COMPLETED phases 3-7, 9, 10.
 */
export const FUEL_TANK_PHASE_INHIBITION: {
  collectorCellNotFull: number[];
  feedTankTempHi: number[];
  tempLo: number[];
  manXfrCompleted: number[];
} = {
  collectorCellNotFull: [1, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  feedTankTempHi: [3, 4, 5, 6, 7, 9, 10],
  tempLo: [3, 4, 5, 6, 7, 9, 10, 11, 12],
  manXfrCompleted: [3, 4, 5, 6, 7, 9, 10],
};

/** Four values, one per feed tank (collector cell) 1 to 4 */
export type FeedTankValues<T> = [T, T, T, T];

/** What FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL reads of one feed tank */
export interface CollectorCellAlertInputs {
  /** The collector cell quantity (L:A380X_FUEL_COLLECTOR_CELL_n_QUANTITY), in kg */
  quantityKg: number;
  /** FUEL FEED TK n LEVEL LO is detected */
  feedTankLevelLo: boolean;
  /** The main or the standby pump of the feed tank runs */
  pumpRunning: boolean;
}

/**
 * FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL: below 265 US gal (1 735 lb) in the collector cell, until it is back above
 * 317 US gal (2 076 lb). Inhibited when the feed tank level is low or when both pumps of the feed tank are not running.
 */
export class CollectorCellNotFullMonitor {
  private readonly notFull: boolean[] = [false, false, false, false];

  /** @param cells the four collector cells */
  public update(cells: readonly CollectorCellAlertInputs[]): FeedTankValues<boolean> {
    return cells.map((cell, index) => {
      this.notFull[index] = isCollectorCellNotFull(cell.quantityKg, this.notFull[index]);
      return this.notFull[index] && !cell.feedTankLevelLo && cell.pumpRunning;
    }) as FeedTankValues<boolean>;
  }
}

/** Which procedure lines to show and which are completed */
export interface TankProcedureLines {
  show: boolean[];
  checked: boolean[];
}

/** The pb-sw selections that the fuel procedures sense */
export interface FuelTankProcedureInputs {
  onGround: boolean;
  /** The FEED TK 1-4 MAIN pump pb-sw ON */
  feedMainPbOn: readonly boolean[];
  /** The FEED TK 1-4 STBY pump pb-sw ON */
  feedStbyPbOn: readonly boolean[];
  /** The CROSSFEED 1-4 pb-sw ON */
  crossFeedPbOn: readonly boolean[];
  /** The OUTR / MID / INR TK XFR pb-sw in MAN, the TRIM TK XFR pb-sw in FWD */
  outerXfrMan: boolean;
  midXfrMan: boolean;
  innerXfrMan: boolean;
  trimXfrFwd: boolean;
  /** The TRIM TK FEED selector in AUTO */
  trimTankFeedAuto: boolean;
  /** The EMER OUTR TK XFR pb-sw ON */
  emerOuterXfrOn: boolean;
}

/**
 * FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL lines (ata28 281800010-13). The opposite feed tank of 1(2)(3)(4) is
 * 4(3)(2)(1).
 * Items: 0 IF NO FUEL LEAK, 1-2 own MAIN / STBY PMP ON, 3-4 opposite MAIN / STBY PMP ON, 5 own CROSSFEED ON, 6 opposite
 * CROSSFEED ON; cells 2 and 3: 7 FEED TK n : 2000 KG MAX NOT USABLE.
 * @param cell the collector cell index, 0 to 3
 * @param inputs the pb-sw selections
 */
export function collectorCellNotFullLines(cell: number, inputs: FuelTankProcedureInputs): TankProcedureLines {
  const opposite = 3 - cell;
  const innerCell = cell === 1 || cell === 2;
  const show = [true, true, true, true, true, true, true];
  const checked = [
    false,
    inputs.feedMainPbOn[cell],
    inputs.feedStbyPbOn[cell],
    inputs.feedMainPbOn[opposite],
    inputs.feedStbyPbOn[opposite],
    inputs.crossFeedPbOn[cell],
    inputs.crossFeedPbOn[opposite],
  ];
  if (innerCell) {
    show.push(true);
    checked.push(false);
  }
  return { show, checked };
}

/** FUEL FEED TK 1(2)(3)(4) TEMP HI: the fuel temperature in the feed tank is above 53 °C */
export function isFeedTankTempHi(temperatureC: number): boolean {
  return temperatureC > FEED_TANK_TEMP_HI_C;
}

/**
 * FUEL FEED TK 1(2)(3)(4) TEMP HI lines (ata28 281800039-42): on ground item 0, in flight items 1 to 3.
 * Items: 0 DELAY T.O, 1 ENG n PARAMETERS MONITOR, 2 IF ABNORMAL, 3 THR LEVER n IDLE.
 */
export function feedTankTempHiLines(onGround: boolean): TankProcedureLines {
  return { show: [onGround, !onGround, !onGround, !onGround], checked: [false, false, false, false] };
}

/** The fuel temperature and quantity of the tanks that FUEL TEMP LO monitors */
export interface TempLoTankInputs {
  /** The left and right outer tanks: temperature °C, quantity kg */
  outer: readonly { temperatureC: number; quantityKg: number }[];
  /** The trim tank */
  trim: { temperatureC: number; quantityKg: number };
  /** Feed tanks 1-4 */
  feed: readonly { temperatureC: number; quantityKg: number }[];
}

/** Which tanks are below -40 °C, for FUEL TEMP LO and its lines */
export interface TempLoState {
  active: boolean;
  outerTankLo: boolean;
  trimTankLo: boolean;
  feedTankLo: boolean;
}

/**
 * FUEL TEMP LO: a fuel temperature below -40 °C in an outer tank, the trim tank or a feed tank. A temperature is
 * detected only by an immersed sensor. The other trigger, TAT below -40 °C for 60 min with both FQMS or the temperature
 * sensors failed, is not simulated (no FQMS or sensor failure).
 */
export function fuelTempLoState(tanks: TempLoTankInputs): TempLoState {
  const isLo = (tank: 'LEFT_OUTER' | 'TRIM' | 'FEED_1', inputs: { temperatureC: number; quantityKg: number }) =>
    isTemperatureSensorImmersed(tank, inputs.quantityKg) && inputs.temperatureC < FUEL_TEMP_LO_C;
  const outerTankLo = tanks.outer.some((outer) => isLo('LEFT_OUTER', outer));
  const trimTankLo = isLo('TRIM', tanks.trim);
  const feedTankLo = tanks.feed.some((feed) => isLo('FEED_1', feed));
  return { active: outerTankLo || trimTankLo || feedTankLo, outerTankLo, trimTankLo, feedTankLo };
}

/**
 * FUEL TEMP LO lines (ata28 281800086): on ground DELAY T.O; in flight INR(MID) TK XFR AUTO after a manual transfer of
 * those tanks, the OUTR TK XFR lines for a cold outer tank, TRIM TK XFR FWD for a cold trim tank, FUEL FREEZE POINT
 * CHECK and TAT INCREASE for a cold feed tank. 35 300 lb = 16 000 kg.
 * Items: 0 DELAY T.O, 1 INR TK XFR AUTO, 2 MID TK XFR AUTO, 3 WHEN ANY FEED TK < 16000 KG (sensed condition: the
 * OUTR TK XFR line under it becomes active then), 4 OUTR TK XFR MAN, 5 TRIM TK XFR FWD, 6 FUEL FREEZE POINT CHECK, 7 TAT
 * INCREASE.
 * @param state which tanks are below -40 °C
 * @param inputs the pb-sw selections
 * @param anyFeedTankBelow16000Kg any feed tank holds less than 35 300 lb
 */
export function fuelTempLoLines(
  state: TempLoState,
  inputs: FuelTankProcedureInputs,
  anyFeedTankBelow16000Kg: boolean,
): TankProcedureLines {
  const inFlight = !inputs.onGround;
  return {
    show: [
      inputs.onGround,
      inFlight && inputs.innerXfrMan,
      inFlight && inputs.midXfrMan,
      inFlight && state.outerTankLo,
      inFlight && state.outerTankLo,
      inFlight && state.trimTankLo,
      inFlight && state.feedTankLo,
      inFlight && state.feedTankLo,
    ],
    checked: [
      false,
      !inputs.innerXfrMan,
      !inputs.midXfrMan,
      anyFeedTankBelow16000Kg,
      inputs.outerXfrMan,
      inputs.trimXfrFwd,
      false,
      false,
    ],
  };
}

/** The transfer tanks holding fuel, and the manual transfer selections, for the MAN XFR COMPLETED alerts */
export interface ManualTransferCompletedInputs {
  innerTanksHoldFuel: boolean;
  midTanksHoldFuel: boolean;
  outerTanksHoldFuel: boolean;
  trimTankHoldsFuel: boolean;
  outerXfrMan: boolean;
  midXfrMan: boolean;
  innerXfrMan: boolean;
  trimXfrFwd: boolean;
}

/** FUEL INR TKs, MID TKs, OUTR TKs and TRIM TK MAN XFR COMPLETED */
export interface ManualTransferCompleted {
  inner: boolean;
  mid: boolean;
  outer: boolean;
  trim: boolean;
}

/**
 * The MAN XFR COMPLETED alerts: the manual transfer from the inner, mid or outer tanks to the feed tanks, or from the
 * trim tank to the inner tanks, is completed. Design choice: a manual transfer is completed when its pb-sw is in MAN
 * (FWD) and both tanks it empties are empty (less than 1 gal, the FWS "holds fuel" quantity); the procedure, setting
 * the pb-sw back to AUTO, clears it.
 */
export function manualTransferCompleted(inputs: ManualTransferCompletedInputs): ManualTransferCompleted {
  return {
    inner: inputs.innerXfrMan && !inputs.innerTanksHoldFuel,
    mid: inputs.midXfrMan && !inputs.midTanksHoldFuel,
    outer: inputs.outerXfrMan && !inputs.outerTanksHoldFuel,
    trim: inputs.trimXfrFwd && !inputs.trimTankHoldsFuel,
  };
}

/**
 * The MAN XFR COMPLETED lines:
 * - INR TKs (ata28 281800050): items 0 INR TK XFR AUTO. The L(R) INR TK AFT PMP ON line is for a pump turned off during
 *   the FUEL MAN XFR PROCEDURE, which is not simulated.
 * - MID TKs (281800075): items 0 MID TK XFR AUTO.
 * - OUTR TKs (281800080): items 0 OUTR TK XFR AUTO, 1 EMER OUTR TK XFR OFF (when the outer tank emergency transfer
 *   valves are open).
 * - TRIM TK (281800092): items 0 TRIM TK XFR AUTO, 1 TRIM TK FEED AUTO.
 */
export function manualTransferCompletedLines(
  tank: keyof ManualTransferCompleted,
  inputs: FuelTankProcedureInputs,
): TankProcedureLines {
  switch (tank) {
    case 'inner':
      return { show: [true], checked: [!inputs.innerXfrMan] };
    case 'mid':
      return { show: [true], checked: [!inputs.midXfrMan] };
    case 'outer':
      return { show: [true, inputs.emerOuterXfrOn], checked: [!inputs.outerXfrMan, !inputs.emerOuterXfrOn] };
    case 'trim':
      return { show: [true, true], checked: [!inputs.trimXfrFwd, inputs.trimTankFeedAuto] };
  }
}

/** What the transfer lines of FUEL FEED TK(s) LEVEL LO read */
export interface FeedTankLevelLoTransferInputs {
  /** The trim tank fuel flows by gravity into the inner tanks (L:A380X_FUEL_TRIM_TK_GRAVITY_XFR_IN_PROGRESS) */
  trimTankGravityXfrInProgress: boolean;
  outerTanksHoldFuel: boolean;
  trimTankHoldsFuel: boolean;
  innerTanksHoldFuel: boolean;
  midTanksHoldFuel: boolean;
  /** At least one trim tank pump is running: design choice, its pb-sw ON and no FAULT */
  trimTankPumpRunning: boolean;
}

/**
 * The transfer lines of FUEL FEED TK 1(2)(3)(4) LEVEL LO and FUEL FEED TKs 1+2(3+4) LEVEL LO, under IF NO FUEL LEAK:
 * TRIM TK FEED AUTO while a gravity transfer from the trim tank is in progress, then a MAN (trim: FWD, only with a
 * trim tank pump running) line for each transfer tank holding fuel.
 * Lines, in this order: TRIM TK FEED AUTO, OUTR TK XFR MAN, TRIM TK XFR FWD, INR TK XFR MAN, MID TK XFR MAN.
 */
export function feedTankLevelLoTransferLines(
  tanks: FeedTankLevelLoTransferInputs,
  inputs: FuelTankProcedureInputs,
): TankProcedureLines {
  return {
    show: [
      tanks.trimTankGravityXfrInProgress,
      tanks.outerTanksHoldFuel,
      tanks.trimTankHoldsFuel && tanks.trimTankPumpRunning,
      tanks.innerTanksHoldFuel,
      tanks.midTanksHoldFuel,
    ],
    checked: [inputs.trimTankFeedAuto, inputs.outerXfrMan, inputs.trimXfrFwd, inputs.innerXfrMan, inputs.midXfrMan],
  };
}
