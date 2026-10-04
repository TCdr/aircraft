// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FwcFlightPhase } from './FwsFlightPhases';

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
