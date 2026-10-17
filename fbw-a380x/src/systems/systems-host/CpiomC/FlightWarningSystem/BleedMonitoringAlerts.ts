// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AVOID_ICING_LIMITATION, WING_ANTI_ICE_INOP_SYS } from './AntiIceValveAlerts';

/*
 * AIR ENG 1(2)(3)(4) BLEED FAULT and the bleed leak alerts of the A380X FWS, on the CPIOM-A bleed monitoring of the
 * systems WASM (a380_systems pneumatic.rs: overtemperature, overpressure and leak detections, held while the ENG BLEED
 * pb-sw is in AUTO).
 * - AIR ENG 1(2)(3)(4) BLEED FAULT. Simulated triggers: the bleed overtemperature and overpressure.
 *   Not simulated: the HP stage pressure too low, the HP valve abnormally open (no failure, so the "HP VLV NOT CLOSED"
 *   line is not shown), the bleed controller failed and the reverse flow protection lost.
 * - AIR L(R) INR WING LEAK / ENG 2(3) BLEED LEAK and AIR L(R) OUTR WING LEAK / ENG 1(4) BLEED LEAK. The engine (pylon)
 *   duct leak and the wing leak have a title each (the ENG BLEED pb-sw lists them as separate alerts) and the same
 *   lines.
 * Engines 1 to 4 at index 0 to 3; the wing zone of engine n is the wing section of that engine (1 left outer, 2 left
 * inner, 3 right inner, 4 right outer).
 */

/** The aircraft state that the bleed fault and leak alerts read. Engines 1 to 4 at index 0 to 3. */
export interface BleedMonitoringInputs {
  /** CPIOM-A bleed overtemperature (L:A32NX_PNEU_ENG_n_OVERHEAT) */
  readonly overheat: readonly boolean[];
  /** CPIOM-A bleed overpressure (L:A32NX_PNEU_ENG_n_OVERPRESSURE) */
  readonly overpressure: readonly boolean[];
  /** A leak of the engine duct in the pylon (L:A32NX_PNEU_ENG_n_BLEED_LEAK) */
  readonly pylonLeak: readonly boolean[];
  /** A leak in the wing zone of the engine (L:A32NX_PNEU_L_OUTR/L_INR/R_INR/R_OUTR_WING_LEAK) */
  readonly wingLeak: readonly boolean[];
  /** The engine bleed valve is open (L:A32NX_PNEU_ENG_n_PR_VALVE_OPEN) */
  readonly bleedValveOpen: readonly boolean[];
  /** The ENG BLEED pb-sw is in AUTO */
  readonly bleedPbAuto: readonly boolean[];
  readonly engineRunning: readonly boolean[];
  /** The left, center and right crossbleed valves are open (L:A32NX_PNEU_XBLEED_VALVE_L/C/R_OPEN) */
  readonly xbleedValveOpen: readonly boolean[];
  readonly pack1On: boolean;
  readonly pack2On: boolean;
  readonly apuBleedOn: boolean;
  readonly wingAntiIceOn: boolean;
  readonly onGround: boolean;
}

/** The AIR ENG n BLEED FAULT alert keys (ata35-36-42.ts), engine 1 first */
export const ENG_BLEED_FAULT_ALERT_IDS = [361800001, 361800002, 361800003, 361800004];
/** The AIR ENG n BLEED LEAK alert keys (ata35-36-42.ts), engine 1 first */
export const ENG_BLEED_LEAK_ALERT_IDS = [361800005, 361800006, 361800007, 361800008];
/** The AIR L OUTR / L INR / R INR / R OUTR WING LEAK alert keys (ata35-36-42.ts), in the order of the engines */
export const WING_LEAK_ALERT_IDS = [361800009, 361800010, 361800011, 361800012];

/**
 * The flight phase inhibition of these alerts. Design choice: their own inhibition is not known, the phases of the
 * other AIR bleed cautions (ENG n BLEED OFF, APU BLEED FAULT) are used.
 */
export const BLEED_ALERTS_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];
/** Amber caution, as the other AIR bleed cautions */
export const BLEED_ALERTS_LEVEL = 2;

/** INOP SYS ENG n BLEED (EcamInopSys), engine 1 first */
export const ENG_BLEED_INOP_SYS = ['260300002', '260300003', '260300004', '260300005'];
/** INOP SYS ENG n STARTER (EcamInopSys), engine 1 first */
const ENG_STARTER_INOP_SYS = ['800300001', '800300002', '800300003', '800300004'];
export const APU_BLEED_INOP_SYS = '260300006';
const PACK_INOP_SYS = ['210300009', '210300010'];

const LEFT_ENGINES = [0, 1];
const RIGHT_ENGINES = [2, 3];

/**
 * @param engine the engine index (0 to 3)
 * @returns whether the engine is an outer one (1 or 4)
 */
function isOuterEngine(engine: number): boolean {
  return engine === 0 || engine === 3;
}

/**
 * @param engine the engine index (0 to 3)
 * @returns the engine indexes on the side of the engine
 */
function sideEngines(engine: number): number[] {
  return engine < 2 ? LEFT_ENGINES : RIGHT_ENGINES;
}

/**
 * The engine bleed supply is lost by a bleed overtemperature or overpressure.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether AIR ENG n BLEED FAULT is triggered
 */
export function isEngineBleedFault(inputs: BleedMonitoringInputs, engine: number): boolean {
  return inputs.overheat[engine] || inputs.overpressure[engine];
}

/**
 * An engine bleed is inoperative: its bleed valve is closed (failure, leak, ENG BLEED pb-sw OFF, engine stopped).
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether the bleed of the engine is lost
 */
function isBleedLost(inputs: BleedMonitoringInputs, engine: number): boolean {
  return !inputs.bleedValveOpen[engine];
}

/**
 * The line ENG n BLEED OFF for a bleed valve that does not close automatically: shown while the valve is still open,
 * and kept (ticked) once the crew has set the pb-sw OFF.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether the line is shown
 */
function showBleedOffLine(inputs: BleedMonitoringInputs, engine: number): boolean {
  return inputs.bleedValveOpen[engine] || !inputs.bleedPbAuto[engine];
}

/**
 * The pack of the STATUS INOP SYS PACK 1(2) line, shown with two or more engine bleed supplies failed.
 * Design choice, as AIR ABNORM BLEED CONFIG (AbnormBleedConfig.ts): the pack of the side with more lost bleeds (PACK 1
 * on a tie).
 * @param inputs the aircraft state
 * @returns the INOP SYS codes
 */
function packInopSysForLostBleeds(inputs: BleedMonitoringInputs): string[] {
  const failed = [0, 1, 2, 3].map((engine) => isEngineBleedFault(inputs, engine) || !inputs.bleedPbAuto[engine]);
  const leftFailed = LEFT_ENGINES.filter((engine) => failed[engine]).length;
  const rightFailed = RIGHT_ENGINES.filter((engine) => failed[engine]).length;
  if (leftFailed + rightFailed < 2) {
    return [];
  }
  return [leftFailed >= rightFailed ? PACK_INOP_SYS[0] : PACK_INOP_SYS[1]];
}

/**
 * The lines of AIR ENG n BLEED FAULT (ata35-36-42.ts): 0 ENG n BLEED OFF, if the bleed valve does not close
 * automatically. The procedure's reference to AIR ABNORM BLEED CONFIG when the XBLEED valves do not open automatically
 * is the AIR ABNORM BLEED CONFIG alert itself (AbnormBleedConfig.ts, bleedFault trigger).
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns which lines are shown and which are done
 */
export function engineBleedFaultItems(
  inputs: BleedMonitoringInputs,
  engine: number,
): { show: boolean[]; checked: boolean[] } {
  return { show: [showBleedOffLine(inputs, engine)], checked: [!inputs.bleedPbAuto[engine]] };
}

/**
 * STATUS INOP SYS of AIR ENG n BLEED FAULT: ENG n BLEED, and PACK 1(2) with two or more bleeds
 * failed. Not simulated: XBLEED AUTO CTL and WING A-ICE (no crossbleed auto control failure, no wing anti-ice supply
 * monitoring).
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns the INOP SYS codes
 */
export function engineBleedFaultInopSys(inputs: BleedMonitoringInputs, engine: number): string[] {
  return [ENG_BLEED_INOP_SYS[engine], ...packInopSysForLostBleeds(inputs)];
}

/**
 * The crossbleed valves that the leak of the zone of the engine must close: the valve of its side, and the center one
 * for an outer engine or outer wing.
 * @param engine the engine index (0 to 3)
 * @returns the indexes of the valves (0 left, 1 center, 2 right)
 */
function crossBleedValvesToClose(engine: number): number[] {
  const sideValve = engine < 2 ? 0 : 2;
  return isOuterEngine(engine) ? [sideValve, 1] : [sideValve];
}

/**
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether the leak is isolated: the bleed valve and the appropriate crossbleed valves are closed
 */
function isLeakIsolated(inputs: BleedMonitoringInputs, engine: number): boolean {
  return (
    !inputs.bleedValveOpen[engine] && crossBleedValvesToClose(engine).every((valve) => !inputs.xbleedValveOpen[valve])
  );
}

/**
 * In flight, the condition of the WING A-ICE OFF lines and of the AVOID ICING CONDs limitation: always for an outer
 * leak, with two bleeds on the same side inoperative for an inner leak.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether the wing anti ice lines apply
 */
function wingAntiIceLinesApply(inputs: BleedMonitoringInputs, engine: number): boolean {
  if (inputs.onGround) {
    return false;
  }
  return isOuterEngine(engine) || sideEngines(engine).every((sideEngine) => isBleedLost(inputs, sideEngine));
}

/**
 * The bleed leak alert of the zone of the engine (the pylon duct leak or the wing leak) is triggered.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @param wing true for the wing zone leak, false for the engine (pylon) duct leak
 * @returns whether the alert is triggered
 */
export function isBleedLeak(inputs: BleedMonitoringInputs, engine: number, wing: boolean): boolean {
  return wing ? inputs.wingLeak[engine] : inputs.pylonLeak[engine];
}

/**
 * The lines of the bleed leak alerts (ata35-36-42.ts bleedLeakItems): 0-3 ENG 1-4 MASTER : KEEP OFF, 4 ENG n BLEED
 * OFF, 5 PACK 1(2) OFF, 6 XBLEED CLOSE, 7 APU BLEED OFF, 8 WING A-ICE OFF, 9 ENGs A-ICE AS RQRD, 10 AVOID ICING CONDs,
 * 11 AIR LEAK ISOLATED.
 * - On ground before any engine start: the four KEEP OFF lines.
 * - With at least one engine started and the bleed valve not closed automatically: ENG n BLEED OFF.
 * - With two or more bleeds off: PACK 1(2) OFF, the pack of the side of the leak. Design choice: with an engine
 *   running (the bleeds of stopped engines are off before the start).
 * - When the appropriate XBLEED valves did not close automatically: XBLEED CLOSE; for the left outer wing leak, APU
 *   BLEED OFF under it (the APU bleed feeds the left side).
 * - In flight (outer), in flight with two bleeds of the side inoperative (inner): WING A-ICE OFF, ENGs A-ICE, AVOID
 *   ICING CONDs.
 * - Once the leak is isolated: AIR LEAK ISOLATED, the bleed valve and the appropriate crossbleed valves closed.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @param wing true for the wing zone leak, false for the engine (pylon) duct leak
 * @returns which lines are shown and which are done
 */
export function bleedLeakItems(
  inputs: BleedMonitoringInputs,
  engine: number,
  wing: boolean,
): { show: boolean[]; checked: boolean[] } {
  const anyEngineRunning = inputs.engineRunning.some((v) => v);
  const beforeEngineStart = inputs.onGround && !anyEngineRunning;
  const bleedsOff = [0, 1, 2, 3].filter((e) => isBleedLost(inputs, e)).length;
  const packOn = engine < 2 ? inputs.pack1On : inputs.pack2On;
  const xbleedNotClosed = crossBleedValvesToClose(engine).some((valve) => inputs.xbleedValveOpen[valve]);
  const showXbleedClose = xbleedNotClosed;
  const leftOuterWingLeak = wing && engine === 0;
  const wingAntiIce = wingAntiIceLinesApply(inputs, engine);

  const show = [
    beforeEngineStart,
    beforeEngineStart,
    beforeEngineStart,
    beforeEngineStart,
    anyEngineRunning && showBleedOffLine(inputs, engine),
    anyEngineRunning && bleedsOff >= 2,
    showXbleedClose,
    showXbleedClose && leftOuterWingLeak,
    wingAntiIce,
    wingAntiIce,
    wingAntiIce,
    isLeakIsolated(inputs, engine),
  ];
  const checked = [
    false,
    false,
    false,
    false,
    !inputs.bleedPbAuto[engine],
    !packOn,
    !xbleedNotClosed,
    !inputs.apuBleedOn,
    !inputs.wingAntiIceOn,
    false,
    false,
    false,
  ];
  return { show, checked };
}

/**
 * STATUS INOP SYS of the bleed leak alerts: ENG n BLEED, ENG n STARTER, PACK 1(2) (inner: two bleeds or more lost;
 * outer: PACK 1(2) set OFF), APU BLEED (left outer wing leak), WING A-ICE (in flight; inner: two bleeds of the side
 * lost). None of them is shown when the alert comes on ground before any engine start. Not simulated: XBLEED AUTO CTL.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @param wing true for the wing zone leak, false for the engine (pylon) duct leak
 * @returns the INOP SYS codes
 */
export function bleedLeakInopSys(inputs: BleedMonitoringInputs, engine: number, wing: boolean): string[] {
  const anyEngineRunning = inputs.engineRunning.some((v) => v);
  if (inputs.onGround && !anyEngineRunning) {
    return [];
  }
  const packInop = isOuterEngine(engine)
    ? !(engine < 2 ? inputs.pack1On : inputs.pack2On)
    : [0, 1, 2, 3].filter((e) => isBleedLost(inputs, e)).length >= 2;
  const codes = [ENG_BLEED_INOP_SYS[engine]];
  if (wing && engine === 0) {
    codes.push(APU_BLEED_INOP_SYS);
  }
  if (packInop) {
    codes.push(engine < 2 ? PACK_INOP_SYS[0] : PACK_INOP_SYS[1]);
  }
  codes.push(ENG_STARTER_INOP_SYS[engine]);
  if (wingAntiIceLinesApply(inputs, engine)) {
    codes.push(WING_ANTI_ICE_INOP_SYS);
  }
  return codes;
}

/**
 * The STATUS INOP SYS ENG n BLEED line of the FWS (FwsInopSys 260300002-005), whichever alert is shown: the engine is out
 * (ENG FAIL, ENG SHUT DOWN), or the bleed is lost by
 * - AIR ENG n BLEED FAULT (INOP SYS ALL PHASES ENG 1(2)(3)(4) BLEED),
 * - AIR ENG n BLEED OFF, the ENG BLEED pb-sw abnormally set to OFF: as the alert, with the engine running (FwsCore
 *   eng1BleedAbnormalOff),
 * - the leak of the pylon duct or of the wing zone of the engine (AIR ENG n BLEED LEAK, AIR L(R) INR / OUTR WING LEAK,
 *   bleedLeakInopSys: not on ground before any engine start).
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @param engineOut the engine is out (FwsCore engNOut)
 * @returns whether ENG n BLEED is inoperative
 */
export function isEngineBleedInoperative(inputs: BleedMonitoringInputs, engine: number, engineOut: boolean): boolean {
  const leakMakesBleedInop = (wing: boolean) =>
    isBleedLeak(inputs, engine, wing) &&
    bleedLeakInopSys(inputs, engine, wing).indexOf(ENG_BLEED_INOP_SYS[engine]) !== -1;
  return (
    engineOut ||
    isEngineBleedFault(inputs, engine) ||
    (!inputs.bleedPbAuto[engine] && inputs.engineRunning[engine]) ||
    leakMakesBleedInop(false) ||
    leakMakesBleedInop(true)
  );
}

/**
 * LIMITATIONS ALL PHASES and on PFD of both leak alerts: AVOID ICING CONDs in flight with two bleeds of the same side
 * lost.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns the limitation codes
 */
export function bleedLeakLimitations(inputs: BleedMonitoringInputs, engine: number): string[] {
  const twoBleedsOfTheSideLost = sideEngines(engine).every((sideEngine) => isBleedLost(inputs, sideEngine));
  return !inputs.onGround && twoBleedsOfTheSideLost ? [AVOID_ICING_LIMITATION] : [];
}
