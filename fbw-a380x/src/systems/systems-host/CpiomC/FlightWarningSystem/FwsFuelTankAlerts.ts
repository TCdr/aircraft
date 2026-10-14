// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) tank alerts of the FCOM gap batch T2-16: FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL, FUEL FEED TK
 * 1(2)(3)(4) TEMP HI, FUEL TEMP LO, FUEL INR(MID)(OUTR)(TRIM) TK MAN XFR COMPLETED, with their procedure lines, and the
 * transfer lines of FUEL FEED TK 1(2)(3)(4) LEVEL LO and FUEL FEED TKs 1+2(3+4) LEVEL LO.
 *
 * Source: A380 FCOM PRO-ABN-ECAM-10-28 "FUEL" (KAL fleet, 25 JUL 11). "l." = line of the text copy
 * references/manuals/a380_fcom.txt; the flight phase inhibitions, master lights and audio are figures, read from
 * airbus-a380-fcom_compress.pdf ("PDF p."). The FCOM gives the quantities in lb; they are converted to kg here.
 */

import {
  FEED_TANK_TEMP_HI_C,
  FUEL_TEMP_LO_C,
  isCollectorCellNotFull,
  isTemperatureSensorImmersed,
} from '@shared/FuelTankIndications';

const KG_PER_LB = 0.45359237;

/** l.153489: FUEL TEMP LO "WHEN ANY FEED TK < 35300 LBS (AUTO RCL): OUTR TK XFR ... MAN" */
export const TEMP_LO_OUTER_XFR_FEED_TANK_KG = 35_300 * KG_PER_LB;

/**
 * Flight phase inhibitions (FCOM figures): FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL every phase but 2 and 8 (PDF
 * p.5158); FUEL FEED TK 1(2)(3)(4) TEMP HI phases 3-7, 9, 10 (PDF p.5179); FUEL TEMP LO phases 3-7, 9-12 (PDF p.5258);
 * FUEL INR TKs, MID TKs, OUTR TKs and TRIM TK MAN XFR COMPLETED phases 3-7, 9, 10 (PDF p.5198, p.5241, p.5251,
 * p.5269).
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
 * FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL, l.149560-149568: "There is less than 265 US Gal (1 735 lb) in the collector
 * cell. The alert no longer appears, when the fuel quantity exceeds 317 US Gal (2 076 lb). [...] The alert is inhibited
 * in the case the associated feed tank level is low, or if both associated feed tank pumps are not running."
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
 * FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL lines (ata28 281800010-13), l.149597-149607: "IF NO FUEL LEAK: FEED TK
 * 1(2)(3)(4) MAIN PMP ... ON, FEED TK 1(2)(3)(4) STBY PMP ... ON, FEED TK 4(3)(2)(1) MAIN PMP ... ON, FEED TK 4(3)(2)(1)
 * STBY PMP ... ON, CROSSFEED 1(2) ... ON, CROSSFEED 4(3) ... ON. If COLLECTOR CELL 2(3) NOT FULL: FEED TK 2(3) : 2000 KG
 * MAX NOT USABLE".
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

/** FUEL FEED TK 1(2)(3)(4) TEMP HI, l.150383: "The fuel temperature in feed tank 1(2)(3)(4) is above 53 °C." */
export function isFeedTankTempHi(temperatureC: number): boolean {
  return temperatureC > FEED_TANK_TEMP_HI_C;
}

/**
 * FUEL FEED TK 1(2)(3)(4) TEMP HI lines (ata28 281800039-42), l.150410-150426: "On ground: DELAY TO. In flight: ENG
 * 1(2)(3)(4) PARAMETERS ... MONITOR, IF ABNORMAL: THR LEVER 1(2)(3)(4) ... IDLE".
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
 * FUEL TEMP LO, l.153448: "A low fuel temperature (-40 °C ) is detected in any outer tank, the trim tank, or in any
 * feed tank." A temperature is detected only by an immersed sensor (l.58698-58704, isTemperatureSensorImmersed). The
 * TAT below -40 °C for 60 min trigger "If both FQMS are failed, or if the temperature sensors are failed"
 * (l.153449-153451) is not simulated (no FQMS or sensor failure).
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
 * FUEL TEMP LO lines (ata28 281800086), l.153475-153502: "On ground: DELAY TO. In flight: If the flight crew selected a
 * manual transfer of the inner (mid) tanks: INR(MID) TK XFR ... AUTO. If the fuel temperature in one or both outer tank
 * is below -40 °C: WHEN ANY FEED TK < 35300 LBS (AUTO RCL): OUTR TK XFR ... MAN. If the fuel temperature in the trim tank
 * is below -40 °C: TRIM TK XFR ... FWD. If the fuel temperature in any feed tank is below -40 °C: FUEL FREEZE POINT ...
 * CHECK, TAT ... INCREASE". 35 300 lb = 16 000 kg.
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
 * The MAN XFR COMPLETED alerts: "The manual transfer of fuel from the inner tanks to the feed tanks is completed"
 * (l.151086), "The manual transfer from the mid tanks to the feed tanks is completed" (l.152837), "The manual transfer
 * from the outer tanks to the feed tanks is completed" (l.153233), "The manual transfer from the trim tank to the inner
 * tanks is completed" (l.153832). Design choice: a manual transfer is completed when its pb-sw is in MAN (FWD) and both
 * tanks it empties are empty (less than 1 gal, the FWS "holds fuel" quantity); the procedure, setting the pb-sw back to
 * AUTO, clears it.
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
 * - INR TKs (ata28 281800050), l.151103: "INR TK XFR ... AUTO" (the L(R) INR TK AFT PMP ON line of l.151095-151097 is for
 *   a pump turned off during the FUEL MAN XFR PROCEDURE, which is not simulated). Items: 0 INR TK XFR AUTO.
 * - MID TKs (281800075), l.152846: "MID TK XFR ... AUTO". Items: 0 MID TK XFR AUTO.
 * - OUTR TKs (281800080), PDF p.5252: "OUTR TK XFR ... AUTO. If the outer tank emergency transfer valves are open: EMER
 *   OUTR TK XFR ... OFF". Items: 0 OUTR TK XFR AUTO, 1 EMER OUTR TK XFR OFF.
 * - TRIM TK (281800092), l.153841-153847: "TRIM TK XFR ... AUTO, TRIM TK FEED ... AUTO". Items: 0 TRIM TK XFR AUTO, 1
 *   TRIM TK FEED AUTO.
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
 * The transfer lines of FUEL FEED TK 1(2)(3)(4) LEVEL LO (l.149913-149923) and FUEL FEED TKs 1+2(3+4) LEVEL LO
 * (l.150493-150503), under IF NO FUEL LEAK: "If gravity transfer from the trim tank is in progress: TRIM TK FEED ...
 * AUTO. For transfer tanks containing fuel: OUTR TK XFR ... MAN, If at least one trim tank pump is running: TRIM TK XFR
 * ... FWD, INR TK XFR ... MAN, MID TK XFR ... MAN".
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
