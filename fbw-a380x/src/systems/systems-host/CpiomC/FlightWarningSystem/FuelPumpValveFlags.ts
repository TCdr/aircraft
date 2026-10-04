// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { FwcFlightPhase } from './FwsFlightPhases';

/**
 * A feed tank holding less than this is at low level: "There is less than 3 030 lb of fuel in feed tank 1(2)(3)(4)"
 * (A380 FCOM PRO-ABN-ECAM-10-28 FUEL FEED TK 1(2)(3)(4) LEVEL LO, a380_fcom.txt l.149878), in kg
 */
export const FEED_TANK_LEVEL_LO_KG = 1375;

/**
 * The low level of the feed tanks 1 to 4 (FUEL FEED TK 1(2)(3)(4) LEVEL LO and the alerts of several feed tanks),
 * confirmed for 30 s, with one confirmation per tank: a confirmation shared by the four tanks restarts at every tank that
 * is not low, so a single low tank was never confirmed.
 */
export class FeedTankLevelLoMonitor {
  public static readonly CONFIRM_S = 30;

  private readonly confirms = [1, 2, 3, 4].map(() => new NXLogicConfirmNode(FeedTankLevelLoMonitor.CONFIRM_S, true));

  /**
   * @param feedTankWeightsKg the fuel in the feed tanks 1 to 4 (FUELSYSTEM TANK WEIGHT:2, 5, 6, 9), in kg
   * @param deltaTime the time since the last update, in milliseconds
   * @returns whether each feed tank is at low level
   */
  public update(feedTankWeightsKg: readonly number[], deltaTime: number): boolean[] {
    return this.confirms.map((confirm, tank) =>
      confirm.write(feedTankWeightsKg[tank] < FEED_TANK_LEVEL_LO_KG, deltaTime),
    );
  }
}

/** The circuits (circuit.N) of the feed tank main and standby pumps, connected to the bus by their pb-sw */
const FEED_PUMP_CIRCUITS: readonly (readonly [number, number])[] = [
  [2, 3],
  [64, 65],
  [66, 67],
  [68, 69],
];

/** The pumps of one feed tank, as the FWS reads them */
export interface FeedTankPumpFlags {
  mainPbOn: boolean;
  stbyPbOn: boolean;
  /** The pump is ON and running at low pressure or failed (CPIOM-F fuel monitoring, CpiomF/FuelPumpsAndValves) */
  mainLowPressure: boolean;
  stbyLowPressure: boolean;
}

/** One crossfeed valve, as the FWS reads it */
export interface CrossFeedValveFlags {
  /** The valve is abnormally closed or open (CPIOM-F fuel monitoring, CpiomF/FuelPumpsAndValves) */
  abnormal: boolean;
  /** The valve is closed */
  closed: boolean;
}

/**
 * Reads the feed tank pumps 1 to 4 with `read` (SimVar.GetSimVarValue(name, Bool) in the sim) as real booleans: a Bool
 * reads as the NUMBER 1, which SubscribableMapFunctions.or()/and() do not count as true.
 */
export function readFeedTankPumpFlags(read: (name: string) => number): FeedTankPumpFlags[] {
  const isOn = (name: string): boolean => read(name) > 0;
  return FEED_PUMP_CIRCUITS.map(([mainCircuit, stbyCircuit], index) => ({
    mainPbOn: isOn(`A:CIRCUIT CONNECTION ON:${mainCircuit}`),
    stbyPbOn: isOn(`A:CIRCUIT CONNECTION ON:${stbyCircuit}`),
    mainLowPressure: isOn(`L:A380X_FUEL_FEED_TK_${index + 1}_MAIN_PMP_LO_PR`),
    stbyLowPressure: isOn(`L:A380X_FUEL_FEED_TK_${index + 1}_STBY_PMP_LO_PR`),
  }));
}

/**
 * Reads the crossfeed valves 1 to 4 (MSFS valves 46 to 49).
 * @param read reads a Bool L:var, as readFeedTankPumpFlags
 * @param readOpenRatio reads the position of an MSFS valve, 0 (closed) to 1 (open)
 */
export function readCrossFeedValveFlags(
  read: (name: string) => number,
  readOpenRatio: (valve: number) => number,
): CrossFeedValveFlags[] {
  return [1, 2, 3, 4].map((number) => ({
    abnormal: read(`L:A380X_FUEL_CROSSFEED_VLV_${number}_ABNORMAL`) > 0,
    closed: readOpenRatio(45 + number) < 0.1,
  }));
}

/** The FUEL FEED TK n pump alerts of one feed tank */
export interface FeedTankPumpAlerts {
  /** FUEL FEED TK n MAIN PMP FAULT */
  mainFault: boolean;
  /** FUEL FEED TK n STBY PMP FAULT */
  stbyFault: boolean;
  /** FUEL FEED TK n MAIN + STBY PMPs FAULT, which replaces the two single pump alerts */
  mainAndStbyFault: boolean;
}

/**
 * The pump alerts of one feed tank (A380 FCOM PRO-ABN-ECAM-10-28, a380_fcom.txt l.149935-149960, l.150267-150275 and
 * l.150328-150336). A pump is faulty when it is "operating at low pressure, or abnormally not running, or turned off by
 * the flight crew (except in flight phase 1 and 12 ...)". The exception "if required by another ECAM procedure (e.g. FUEL
 * WINGS NOT BALANCED)" is not simulated, and the pumps are never unpowered in the simulation.
 * @param flags the pumps of the feed tank
 * @param flightPhase the FWS flight phase
 */
export function feedTankPumpAlerts(flags: FeedTankPumpFlags, flightPhase: FwcFlightPhase): FeedTankPumpAlerts {
  const turnedOffCounts = flightPhase !== FwcFlightPhase.ElecPwr && flightPhase !== FwcFlightPhase.EnginesShutdown;
  const mainFaulty = flags.mainLowPressure || (!flags.mainPbOn && turnedOffCounts);
  const stbyFaulty = flags.stbyLowPressure || (!flags.stbyPbOn && turnedOffCounts);
  const both = mainFaulty && stbyFaulty;
  return {
    mainFault: mainFaulty && !both,
    stbyFault: stbyFaulty && !both,
    mainAndStbyFault: both,
  };
}

/**
 * Reads the CROSSFEED 1 to 4 pb-sw selections (the crew action: the pb-sw sets the selection L:var, which
 * CpiomF/FuelPumpsAndValves copies to the valve unless it is jammed), for the sensed CROSSFEED ... ON items of the ECAM
 * procedures. A jammed valve does not open, but the item is done once the pb-sw is ON.
 * @param read reads a Bool L:var, as readFeedTankPumpFlags
 */
export function readCrossFeedPbSelections(read: (name: string) => number): boolean[] {
  return [1, 2, 3, 4].map((number) => read(`L:A380X_OVHD_FUEL_CROSSFEED_${number}_PB_IS_ON`) > 0);
}

/** A transfer pump, as the FWS reads it */
export interface TransferPumpFlags {
  /** Its pb-sw is ON (its circuit connected to the bus) */
  pbOn: boolean;
  /**
   * It is failed, or running in an empty tank, with its pb-sw ON (CPIOM-F fuel monitoring, CpiomF/FuelPumpsAndValves
   * isTransferPumpFaulty: the FAULT light). Always false for the aft gallery pumps, which never run in the simulation.
   */
  fault: boolean;
}

/** The circuit of the pb-sw of each transfer pump (systems.cfg), and the FAULT L:var of the pumps that can fail */
const TRANSFER_PUMPS = {
  leftOuter: { circuit: 70, faultVar: 'L:A380X_FUEL_L_OUTR_TK_PMP_FAULT' },
  rightOuter: { circuit: 75, faultVar: 'L:A380X_FUEL_R_OUTR_TK_PMP_FAULT' },
  leftMidFwd: { circuit: 71, faultVar: 'L:A380X_FUEL_L_MID_TK_FWD_PMP_FAULT' },
  leftMidAft: { circuit: 72, faultVar: null },
  rightMidFwd: { circuit: 76, faultVar: 'L:A380X_FUEL_R_MID_TK_FWD_PMP_FAULT' },
  rightMidAft: { circuit: 77, faultVar: null },
  leftInnerFwd: { circuit: 73, faultVar: 'L:A380X_FUEL_L_INR_TK_FWD_PMP_FAULT' },
  leftInnerAft: { circuit: 74, faultVar: null },
  rightInnerFwd: { circuit: 78, faultVar: 'L:A380X_FUEL_R_INR_TK_FWD_PMP_FAULT' },
  rightInnerAft: { circuit: 79, faultVar: null },
  trimLeft: { circuit: 80, faultVar: 'L:A380X_FUEL_TRIM_TK_L_PMP_FAULT' },
  trimRight: { circuit: 81, faultVar: 'L:A380X_FUEL_TRIM_TK_R_PMP_FAULT' },
} as const;

export type TransferPumpName = keyof typeof TRANSFER_PUMPS;

export type TransferPumpsFlags = Record<TransferPumpName, TransferPumpFlags>;

/**
 * Reads the transfer pumps (outer, mid fwd/aft, inner fwd/aft, trim tank) as real booleans.
 * @param read reads a Bool simvar, as readFeedTankPumpFlags
 */
export function readTransferPumpFlags(read: (name: string) => number): TransferPumpsFlags {
  const flags = {} as TransferPumpsFlags;
  for (const [name, { circuit, faultVar }] of Object.entries(TRANSFER_PUMPS) as [
    TransferPumpName,
    { circuit: number; faultVar: string | null },
  ][]) {
    flags[name] = {
      pbOn: read(`A:CIRCUIT CONNECTION ON:${circuit}`) > 0,
      fault: faultVar !== null && read(faultVar) > 0,
    };
  }
  return flags;
}

/**
 * Whether a transfer pump is faulty for its FUEL ... PMP FAULT alert: "Failed, or Running, when the associated tank is
 * empty, or Turned off by the flight crew (except in flight phase 1 and 12)" (A380 FCOM PRO-ABN-ECAM-10-28 triggering
 * conditions, a380_fcom.txt l.151343-151346, l.151418-151421, l.151497-151500, l.151562-151565, l.151635-151638,
 * l.153695-153698, l.153745-153748).
 * @param flags the pump
 * @param flightPhase the FWS flight phase
 */
export function isTransferPumpAlertFaulty(flags: TransferPumpFlags, flightPhase: FwcFlightPhase): boolean {
  const turnedOffCounts = flightPhase !== FwcFlightPhase.ElecPwr && flightPhase !== FwcFlightPhase.EnginesShutdown;
  return flags.fault || (!flags.pbOn && turnedOffCounts);
}

/** The alerts of two pumps whose double fault has its own alert (FWD + AFT pumps of a tank, TRIM TK L + R pumps) */
export interface PumpPairAlerts {
  /** The alert of the first pump alone (FWD, L) */
  first: boolean;
  /** The alert of the second pump alone (AFT, R) */
  second: boolean;
  /** The alert of both pumps (FWD+AFT PMPs, L+R PMPs), which replaces the two single alerts */
  both: boolean;
}

/** The two single alerts, or the double alert of a pair of pumps */
export function pumpPairAlerts(firstFaulty: boolean, secondFaulty: boolean): PumpPairAlerts {
  const both = firstFaulty && secondFaulty;
  return { first: firstFaulty && !both, second: secondFaulty && !both, both };
}

/** The transfer pump alerts (A380 FCOM PRO-ABN-ECAM-10-28) */
export interface TransferPumpAlerts {
  /** FUEL L (R) OUTR TK PMP FAULT */
  leftOuter: boolean;
  rightOuter: boolean;
  /** FUEL L (R) INR TK FWD PMP FAULT, INR TK AFT PMP FAULT, INR TK FWD+AFT PMPs FAULT */
  leftInner: PumpPairAlerts;
  rightInner: PumpPairAlerts;
  /** FUEL L (R) MID TK FWD PMP FAULT, MID TK AFT PMP FAULT, MID TK FWD+AFT PMPs FAULT */
  leftMid: PumpPairAlerts;
  rightMid: PumpPairAlerts;
  /** FUEL TRIM TK L PMP FAULT, TRIM TK R PMP FAULT, TRIM TK L+R PMPs FAULT */
  trim: PumpPairAlerts;
}

/**
 * The transfer pump alerts.
 * @param flags the transfer pumps
 * @param flightPhase the FWS flight phase
 */
export function transferPumpAlerts(flags: TransferPumpsFlags, flightPhase: FwcFlightPhase): TransferPumpAlerts {
  const faulty = (name: TransferPumpName) => isTransferPumpAlertFaulty(flags[name], flightPhase);
  return {
    leftOuter: faulty('leftOuter'),
    rightOuter: faulty('rightOuter'),
    leftInner: pumpPairAlerts(faulty('leftInnerFwd'), faulty('leftInnerAft')),
    rightInner: pumpPairAlerts(faulty('rightInnerFwd'), faulty('rightInnerAft')),
    leftMid: pumpPairAlerts(faulty('leftMidFwd'), faulty('leftMidAft')),
    rightMid: pumpPairAlerts(faulty('rightMidFwd'), faulty('rightMidAft')),
    trim: pumpPairAlerts(faulty('trimLeft'), faulty('trimRight')),
  };
}
