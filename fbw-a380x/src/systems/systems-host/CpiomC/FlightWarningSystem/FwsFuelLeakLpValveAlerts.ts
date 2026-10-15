// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) alerts of the FCOM gap batch P16: FUEL ENG 1(2)(3)(4) LP VLV FAULT, FUEL LEAK DET FAULT and FUEL
 * LEAK DETECTED, with their procedure lines.
 *
 * Source: A380 FCOM PRO-ABN-ECAM-10-28 "FUEL" (KAL fleet, 25 JUL 11). "l." = line of the text copy
 * references/manuals/a380_fcom.txt; the flight phase inhibitions, master lights and audio are figures, read from
 * airbus-a380-fcom_compress.pdf ("PDF p.").
 */

import { FwcFlightPhase } from './FwsFlightPhases';

/**
 * Flight phase inhibitions (FCOM figures): FUEL ENG 1(2)(3)(4) LP VLV FAULT phases 4-10 (PDF p.5162); FUEL LEAK DET
 * FAULT every phase but 8 (PDF p.5222); FUEL LEAK DETECTED every phase but 2 and 8 (PDF p.5224).
 */
export const FUEL_LEAK_LP_VALVE_PHASE_INHIBITION: {
  engLpValveFault: number[];
  leakDetFault: number[];
  leakDetected: number[];
} = {
  engLpValveFault: [4, 5, 6, 7, 8, 9, 10],
  leakDetFault: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  leakDetected: [1, 3, 4, 5, 6, 7, 9, 10, 11, 12],
};

/** Four values, one per engine 1 to 4 */
export type Engines<T> = [T, T, T, T];

/** What the FWS reads of the LP valves (fuel/engine_lp_valve.rs) and the FQMS leak detection (CpiomF/FuelLeak) */
export interface FuelLeakLpValveFlags {
  /** The LP valve remains open while it is commanded closed (L:A32NX_FUEL_ENG_n_LP_VALVE_ABNORMALLY_OPEN) */
  lpValveAbnormallyOpen: Engines<boolean>;
  /** The LP valve remains closed while it is commanded open (L:A32NX_FUEL_ENG_n_LP_VALVE_ABNORMALLY_CLOSED) */
  lpValveAbnormallyClosed: Engines<boolean>;
  /** The FQMS has detected a fuel leak (L:A380X_FUEL_LEAK_DETECTED) */
  leakDetected: boolean;
  /** The FQMS fuel system leak detection is inhibited (L:A380X_FUEL_LEAK_DET_FAULT) */
  leakDetectionFault: boolean;
}

/**
 * Reads the flags as real booleans (SimVar Bool reads return 1).
 * @param read reads a simvar as a number
 */
export function readFuelLeakLpValveFlags(read: (name: string) => number): FuelLeakLpValveFlags {
  const engines = (name: (engine: number) => string): Engines<boolean> => [
    read(name(1)) > 0,
    read(name(2)) > 0,
    read(name(3)) > 0,
    read(name(4)) > 0,
  ];
  return {
    lpValveAbnormallyOpen: engines((engine) => `L:A32NX_FUEL_ENG_${engine}_LP_VALVE_ABNORMALLY_OPEN`),
    lpValveAbnormallyClosed: engines((engine) => `L:A32NX_FUEL_ENG_${engine}_LP_VALVE_ABNORMALLY_CLOSED`),
    leakDetected: read('L:A380X_FUEL_LEAK_DETECTED') > 0,
    leakDetectionFault: read('L:A380X_FUEL_LEAK_DET_FAULT') > 0,
  };
}

/**
 * FUEL ENG 1(2)(3)(4) LP VLV FAULT, l.149688-149694: "Engine 1(2)(3)(4) LP valve is: - Abnormally closed on ground,
 * during engine start, or - Abnormally open on ground, during engine shutdown." The LP valve is commanded open by the
 * ENG MASTER ON (engine start) and closed by the ENG MASTER OFF or the ENG FIRE pb (engine shutdown): a valve
 * abnormally closed is one that stays closed while commanded open, a valve abnormally open one that stays open while
 * commanded closed. @param onGround whether the aircraft is on ground
 * @param abnormallyOpen the LP valve remains open while commanded closed
 * @param abnormallyClosed the LP valve remains closed while commanded open
 */
export function isEngLpValveFault(onGround: boolean, abnormallyOpen: boolean, abnormallyClosed: boolean): boolean {
  return onGround && (abnormallyOpen || abnormallyClosed);
}

/** Which procedure lines to show and which are completed */
export interface LpValveFaultLines {
  show: boolean[];
  checked: boolean[];
}

/**
 * The lines of FUEL ENG 1(2)(3)(4) LP VLV FAULT, l.149722-149732: "Before takeoff: ENG 1(2)(3)(4) MASTER....OFF" ("When
 * the LP valve is failed in the closed position, it is not possible to start the associated engine"); "After landing:
 * Crew awareness" (no line). After landing = from the touchdown (flight phases 10-12).
 * @param flightPhase the FWS flight phase
 * @param masterOn whether the ENG MASTER of the engine is ON
 */
export function engLpValveFaultLines(flightPhase: number, masterOn: boolean): LpValveFaultLines {
  const afterLanding =
    flightPhase === FwcFlightPhase.TouchDown ||
    flightPhase === FwcFlightPhase.AtOrBelowEightyKnots ||
    flightPhase === FwcFlightPhase.EnginesShutdown;
  return { show: [!afterLanding], checked: [!masterOn] };
}

/** STATUS INOP SYS ALL PHASES of FUEL ENG n LP VLV FAULT (l.149734-149739): ENG 1(2)(3)(4) LP VLV */
export const ENG_LP_VALVE_FAULT_INOP_SYS: Engines<string> = ['280300051', '280300052', '280300053', '280300054'];

/** STATUS INOP SYS ALL PHASES of FUEL LEAK DET FAULT (l.152003-152007): FUEL LEAK DET */
export const FUEL_LEAK_DET_FAULT_INOP_SYS = '280300050';
