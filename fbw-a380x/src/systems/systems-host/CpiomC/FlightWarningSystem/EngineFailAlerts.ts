// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXLogicConfirmNode, NXLogicMemoryNode, NXLogicPulseNode } from '@flybywiresim/fbw-sdk';
import { FadecShutdownReason } from './EngineMonitoringAlerts';

/*
 * A380X FWS engine failure logic: ENG 1(2)(3)(4) FAIL, ENG 1(2)(3)(4) SHUT DOWN, ENG TWO ENGS OUT ON SAME SIDE and ON
 * OPPOSITE SIDE. Pure logic, used by FwsCore for the four engines alike.
 */

/** L:A32NX_ENGINE_STATE:n, as fadec_a380x EngineControl_A380X.h writes it */
export enum FadecEngineState {
  Off = 0,
  On = 1,
  Starting = 2,
  Restarting = 3,
  Shutting = 4,
}

/**
 * The aircraft FWS sees the engine as not running below 61 % N2, the HP spool of the GP7270. FBW models the Trent 972,
 * whose HP spool is the N3. Design choice: keep the threshold the FBW logic already used, not running below 50 % N3.
 */
const ENG_FAIL_CORE_SPEED_PERCENT = 50;

/** The engine counts as having run for 5 s after it stopped running (the confirmation node of the existing logic) */
const WAS_RUNNING_HOLD_SECONDS = 5;

export interface EngineFailInputs {
  masterOn: boolean;
  firePbPushed: boolean;
  engineState: FadecEngineState;
  /** The core (HP spool) speed, the FADEC N3, in percent */
  coreSpeedPercent: number;
}

/**
 * The ENG FAIL memory of one engine.
 * - "Was running": the engine ran (FADEC state ON, held 5 s after it stopped). The MASTER ON of a start or relight
 *   attempt clears it, so that an attempt that does not light up gives no new ENG FAIL.
 * - ENG FAIL: set when the engine that was running is below 50 % N3 with its master ON and its ENG FIRE pb not pushed,
 *   cleared when the engine runs again (or is starting above 50 % N3).
 */
export class EngineFailMonitor {
  private readonly runningConfirmNode = new NXLogicConfirmNode(WAS_RUNNING_HOLD_SECONDS, false);

  private readonly masterOnPulseNode = new NXLogicPulseNode();

  private readonly wasRunningMemoryNode = new NXLogicMemoryNode();

  private readonly failMemoryNode = new NXLogicMemoryNode();

  /**
   * @param inputs the engine inputs of this frame
   * @param deltaTimeMs the frame time in milliseconds (as the NXLogic nodes take it)
   */
  update(inputs: EngineFailInputs, deltaTimeMs: number): void {
    const running = inputs.engineState === FadecEngineState.On;
    this.wasRunningMemoryNode.write(
      this.runningConfirmNode.write(running, deltaTimeMs),
      this.masterOnPulseNode.write(inputs.masterOn),
    );

    const coreBelowRunning = inputs.coreSpeedPercent < ENG_FAIL_CORE_SPEED_PERCENT;
    this.failMemoryNode.write(
      inputs.masterOn && this.wasRunningMemoryNode.read() && !inputs.firePbPushed && coreBelowRunning,
      running || (!coreBelowRunning && inputs.engineState === FadecEngineState.Starting),
    );
  }

  /** The ENG FAIL memory (the alert itself is not shown while ALL ENG FLAME OUT is) */
  get failed(): boolean {
    return this.failMemoryNode.read();
  }

  get wasRunning(): boolean {
    return this.wasRunningMemoryNode.read();
  }
}

/** The engines failed or shut down, engine 1 first */
export type EnginesOut = readonly [boolean, boolean, boolean, boolean];

function countEnginesOut(enginesOut: EnginesOut): number {
  return enginesOut.filter((out) => out).length;
}

/**
 * ENG 1(2)(3)(4) FAIL, IF NOT DAMAGED: with less than three engines failed the ENG RELIGHT PROC line says CONSIDER,
 * with more than two it says APPLY. Design choice: an engine counts as failed when it is out (ENG FAIL or ENG SHUT
 * DOWN).
 */
export function relightProcMustBeApplied(enginesOut: EnginesOut): boolean {
  return countEnginesOut(enginesOut) > 2;
}

export enum TwoEnginesOut {
  None,
  SameSide,
  OppositeSide,
}

/**
 * Which TWO ENGS OUT caution applies. Design choice: exactly two engines out (the aircraft has no three engines out
 * alert, three engines out raise the ENG FAIL / SHUT DOWN alerts only); engines 1 and 2 are on the left wing, 3 and 4
 * on the right wing.
 */
export function twoEnginesOut(enginesOut: EnginesOut): TwoEnginesOut {
  if (countEnginesOut(enginesOut) !== 2) {
    return TwoEnginesOut.None;
  }
  const [eng1, eng2, eng3, eng4] = enginesOut;
  return (eng1 && eng2) || (eng3 && eng4) ? TwoEnginesOut.SameSide : TwoEnginesOut.OppositeSide;
}

/**
 * The ECAM lines of ENG TWO ENGS OUT ON SAME SIDE that depend on the failed engines.
 * - PACK 1(2) OFF: the pack of the side of the failed engines, PACK 1 for the engines 1 and 2, PACK 2 for 3 and 4 (each
 *   pack is supplied from the bleed of its side; ENG START VLV FAULT pairs them the same way).
 * - FOR TAXI : STEER ENDURANCE LIMITED with ENG 1+2 failed (the normal nose wheel steering, green hydraulics, is lost).
 */
export function sameSideLines(enginesOut: EnginesOut): {
  pack1Off: boolean;
  pack2Off: boolean;
  steerEnduranceLimited: boolean;
} {
  const [eng1, eng2, eng3, eng4] = enginesOut;
  return {
    pack1Off: eng1 && eng2,
    pack2Off: eng3 && eng4,
    steerEnduranceLimited: eng1 && eng2,
  };
}

/**
 * The hydraulic system lost with the two engines of its side out: the engine 1 and 2 pumps pressurize GREEN, the engine
 * 3 and 4 pumps YELLOW, and the electric pumps work on ground only.
 *
 * ENG TWO ENGS OUT ON SAME SIDE lists PART SPLRs and G(Y) HYD SYS in INOP SYS. The FWS low pressure monitoring of a
 * system needs an engine of its side running, so these lines come from the failed engines.
 */
export function hydraulicSystemsLostByEnginesOut(enginesOut: EnginesOut): { green: boolean; yellow: boolean } {
  const [eng1, eng2, eng3, eng4] = enginesOut;
  return { green: eng1 && eng2, yellow: eng3 && eng4 };
}

/** Generator 1 first */
export type GeneratorsInop = readonly [boolean, boolean, boolean, boolean];

/**
 * The GEN 1+4(1+3)(2+3)(2+4) INOP SYS line of ENG TWO ENGS OUT ON OPPOSITE SIDE: one line for the two generators lost,
 * when exactly two generators are lost and they are on opposite sides (the generators 1 and 2 are on the left wing, 3
 * and 4 on the right wing; the same side pairs have their own GEN 1+2 and GEN 3+4 lines).
 *
 * @returns the generator numbers of the pair, or null
 */
export function oppositeSideGeneratorPair(gensInop: GeneratorsInop): readonly [number, number] | null {
  const lost = [1, 2, 3, 4].filter((_, index) => gensInop[index]);
  if (lost.length !== 2) {
    return null;
  }
  const [first, second] = lost;
  const sameSide = (first === 1 && second === 2) || (first === 3 && second === 4);
  return sameSide ? null : [first, second];
}

/**
 * ENG 1(2)(3)(4) SHUT DOWN, STATUS:
 * - INOP SYS APPR: BTV when ENG 2 or 3 is affected, CAT 3 DUAL when the APU is off.
 * - INFO, APU off: CAT 3 SINGLE ONLY, because only three different generators supply the AC busbars.
 * The other INOP SYS lines (GEN, G/Y ENG PMP A+B, ENG BLEED, ENG 2(3) REVERSER) come from FwsInopSys already.
 */
export function shutDownBtvInop(eng2ShutDown: boolean, eng3ShutDown: boolean): boolean {
  return eng2ShutDown || eng3ShutDown;
}

export function shutDownCat3SingleOnly(anyEngineShutDown: boolean, apuAvailable: boolean): boolean {
  return anyEngineShutDown && !apuAvailable;
}

export const ALL_ENG_FLAME_OUT_INHIBITED_PHASES: number[] = [1, 2, 3, 4, 5, 6, 10, 11, 12];

/**
 * ALL ENG FLAME OUT inhibits the ELEC EMER CONFIG alert, but only while ALL ENG FLAME OUT is shown or about to be: it
 * is already on the E/WD, or the flight phase lets it come up. The FWS phase inhibition only holds back a new alert,
 * so an ALL ENG FLAME OUT already shown stays when a phase that inhibits it begins. Otherwise, e.g. all engines out
 * between 400 ft and 1500 ft (phase 6), ELEC EMER CONFIG shows: one of the two alerts is always there.
 */
export function allEngFlameOutInhibitsElecEmerConfig(
  allEnginesFailure: boolean,
  allEngFlameOutPresented: boolean,
  flightPhase: number,
): boolean {
  return allEnginesFailure && (allEngFlameOutPresented || !ALL_ENG_FLAME_OUT_INHIBITED_PHASES.includes(flightPhase));
}

/** ENG 1(2)(3)(4) FAIL is inhibited in no flight phase */
export const ENG_FAIL_FLIGHT_PHASE_INHIBITION: number[] = [];

export interface AutoRelightInputs {
  inFlight: boolean;
  /** L:A32NX_FADEC_IGNITER_A_ACTIVE_ENGn (fadec_a380x IgniterSelection_A380X) */
  igniterAActive: boolean;
  /** L:A32NX_FADEC_IGNITER_B_ACTIVE_ENGn */
  igniterBActive: boolean;
  /** L:A32NX_ENGINE_n_RELIGHT_ATTEMPT: the crew relight (ENG MASTER OFF then ON), up to 30 s */
  relightAttempt: boolean;
  /** L:A32NX_ENGINE_n_RELIGHT_IGNITION: a relight lighting up (crew relight or quick relight) */
  relightIgnition: boolean;
}

/**
 * ENG FAIL AUTO RELIGHT IN PROGRESS: in flight, when the FADEC does not identify the failure, it attempts a restart
 * itself. The line is shown only while the FADEC really does it: both FADEC igniters on (the auto relight of
 * fadec_a380x EngineIgnition_A380X selects A + B) outside a relight the crew started with the ENG MASTER lever (the
 * systems WASM selects the igniters of that relight itself).
 * Design choice: the FBW flyPad flameout and seizure failures and the LP valve starvation cut the fuel, and the FADEC
 * makes no auto relight on a cut engine (the engine relights only through the crew ENG RELIGHT procedure), so the line
 * stays hidden for them.
 */
export function autoRelightInProgress(inputs: AutoRelightInputs): boolean {
  return (
    inputs.inFlight &&
    inputs.igniterAActive &&
    inputs.igniterBActive &&
    !inputs.relightAttempt &&
    !inputs.relightIgnition
  );
}

/**
 * The ENG n FAIL items of ata70 (701800029-032): 24 lines of the branches where the FADEC does not identify the
 * failure (0 L/G UP to 23 RELIGHT PROC CONSIDER on ground), then 4 lines of the branches where it does: 24 FADEC OVHT,
 * 25 THRUST CTL LOST, 26 THR LEVER n IDLE, 27 ENG n MASTER OFF.
 */
export const ENG_FAIL_NOT_IDENTIFIED_ITEM_COUNT = 24;
export const ENG_FAIL_ITEM_COUNT = 28;

/**
 * The ENG n FAIL lines shown, with the reason of a FADEC shutdown (after a FADEC overheat or an overthrust protection
 * activation the FADEC gives the reason of the failure):
 * - FADEC OVHT and THRUST CTL LOST: THR LEVER IDLE and ENG MASTER OFF, then the ENG SHUTDOWN procedure only: no AUTO
 *   RELIGHT, no IF DAMAGED / NOT DAMAGED lines, which belong to the branches where the FADEC does not identify the
 *   failure.
 * - The L/G UP line (item 0, when the gear is down in the takeoff and initial climb phases) stays.
 * Design choice: the reason is a white line of its own, named after the case ("FADEC OVHT", "THRUST CTL LOST").
 * @param reason the FADEC shutdown reason (L:A32NX_ENGINE_n_FADEC_SHUTDOWN)
 * @param notIdentifiedShown the 24 lines of the other branches, as FwsAbnormalSensed computes them
 */
export function engineFailItemsShown(reason: FadecShutdownReason, notIdentifiedShown: boolean[]): boolean[] {
  if (reason === FadecShutdownReason.None) {
    return notIdentifiedShown.concat([false, false, false, false]);
  }
  const shown: boolean[] = [notIdentifiedShown[0]];
  for (let index = 1; index < ENG_FAIL_NOT_IDENTIFIED_ITEM_COUNT; index++) {
    shown.push(false);
  }
  return shown.concat([
    reason === FadecShutdownReason.FadecOverheat,
    reason === FadecShutdownReason.ThrustControlLost,
    true,
    true,
  ]);
}

/** The ENG n FAIL lines done: the 24 lines of the other branches, then the 4 lines of the FADEC shutdown branches */
export function engineFailItemsChecked(
  notIdentifiedChecked: boolean[],
  thrLeverIdle: boolean,
  masterOff: boolean,
): boolean[] {
  return notIdentifiedChecked.concat([false, false, thrLeverIdle, masterOff]);
}

/** The aircraft state that the TWO ENGS OUT deferred procedures sense */
export interface TwoEnginesOutDeferredInputs {
  jettisonArmPbOn: boolean;
  jettisonActivePbOn: boolean;
  /** ENG 1+2 lost (the left side; ENG TWO ENGS OUT ON SAME SIDE only) */
  engines1And2Out: boolean;
  /** L:A32NX_FLAPS_HANDLE_INDEX: 0 (0), 1, 2, 3, 4 (FULL) */
  flapsHandleIndex: number;
  gearLeverDown: boolean;
  /** L:A32NX_LG_GRVTY_SWITCH_POS at 2 (DOWN) */
  gravityExtensionDown: boolean;
  athrEngaged: boolean;
  groundSpoilersArmed: boolean;
}

/**
 * The items of the ENG TWO ENGS OUT deferred procedure ALL PHASES (ata70 700700002): IF GW DECREASE RQRD: JETTISON ARM
 * ON, JETTISON ACTIVE ON.
 */
export const TWO_ENGS_OUT_ALL_PHASES_ITEM_COUNT = 3;

/** The lines shown and the lines done of a deferred procedure */
export interface DeferredProcedureItems {
  show: boolean[];
  checked: boolean[];
}

export function twoEnginesOutAllPhasesItems(inputs: TwoEnginesOutDeferredInputs): DeferredProcedureItems {
  return {
    show: [true, true, true],
    checked: [false, inputs.jettisonArmPbOn, inputs.jettisonActivePbOn],
  };
}

/** A FLAP LVR CONF n line is done once the lever is at CONF n or further (the next line asks for the next position) */
const flapLeverAtOrBeyond = (inputs: TwoEnginesOutDeferredInputs, conf: number) => inputs.flapsHandleIndex >= conf;

/**
 * The items of ENG TWO ENGS OUT ON SAME SIDE DEFERRED PROC FOR APPROACH (ata70 700700003), by
 * index: 0 IF JETTISON ACTIVE, 1 JETTISON ACTIVE OFF, 2 JETTISON ARM OFF, 3 LDG PERF COMPUTATION CONFIRM,
 * 4 DISREGARD NORM APPR & C/Ls, 5 LONG APPROACH PLAN, 6 FLAPS SLOW, 7 SLATS SLOW (if ENG 1+2 are lost), 8 BARO REF SET,
 * 9 MINIMA SET, 10 CABIN CREW ADVISE, 11 SIGNS ON, 12 INITIAL APPROACH, 13 FLAP LVR CONF 1, 14 GA PERF MAY NOT BE
 * ACHIEVED IF L/G DN, 15 FOR L/G EXTN, 16 FOR L/G GRVTY EXTN : MAX SPD 220 KT, 17 L/G LEVER UP, 18 L/G GRVTY DOWN,
 * 19 WHEN L/G LOCKED DOWN OR AFTER 120S, 20 L/G LEVER DOWN, 21 INTERCEPTING G/S, 22 FLAP LVR CONF 2, 23 PACK 1+2 OFF OR
 * ON APU, 24 FOR GO AROUND : FLAP LVR 1, 25 FINAL APPROACH, 26 FLAP LVR CONF 3, 27 A/THR DISCONNECT, 28 GND SPLRs ARM,
 * 29 AT COMMIT ALTITUDE (500 FT AGL), 30 REDUCE SPEED TO VAPP, 31 DO NOT ATTEMPT GO AROUND.
 * The L/G lines are those of the L/G GRVTY EXTN deferred procedure (ata31-32-33 320700001).
 */
export const SAME_SIDE_APPROACH_ITEM_COUNT = 32;

export function sameSideApproachItems(inputs: TwoEnginesOutDeferredInputs): DeferredProcedureItems {
  const show = new Array<boolean>(SAME_SIDE_APPROACH_ITEM_COUNT).fill(true);
  show[7] = inputs.engines1And2Out;
  const checked = new Array<boolean>(SAME_SIDE_APPROACH_ITEM_COUNT).fill(false);
  checked[1] = !inputs.jettisonActivePbOn;
  checked[2] = !inputs.jettisonArmPbOn;
  checked[13] = flapLeverAtOrBeyond(inputs, 1);
  checked[17] = !inputs.gearLeverDown;
  checked[18] = inputs.gravityExtensionDown;
  checked[20] = inputs.gearLeverDown;
  checked[22] = flapLeverAtOrBeyond(inputs, 2);
  checked[26] = flapLeverAtOrBeyond(inputs, 3);
  checked[27] = !inputs.athrEngaged;
  checked[28] = inputs.groundSpoilersArmed;
  return { show, checked };
}

/**
 * The items of ENG TWO ENGS OUT ON OPPOSITE SIDE DEFERRED PROC APPR & LDG (ata70 700700004), by
 * index: 0 IF JETTISON ACTIVE, 1 JETTISON ACTIVE OFF, 2 JETTISON ARM OFF, 3 LDG PERF COMPUTATION CONFIRM,
 * 4 DISREGARD NORM APPR & C/Ls, 5 LONG APPROACH PLAN, 6 BARO REF SET, 7 MINIMA SET, 8 CABIN CREW ADVISE, 9 SIGNS ON,
 * 10 INITIAL APPROACH, 11 FLAP LVR CONF 1, 12 L/G LEVER DOWN, 13 INTERCEPTING G/S, 14 FLAP LVR CONF 2, 15 PACK 1+2 OFF
 * OR ON APU, 16 FINAL APPROACH, 17 FLAP LVR CONF 3, 18 GND SPLRs ARM, 19 FOR GO AROUND : FLAP LEVER 1.
 */
export const OPPOSITE_SIDE_APPROACH_ITEM_COUNT = 20;

export function oppositeSideApproachItems(inputs: TwoEnginesOutDeferredInputs): DeferredProcedureItems {
  const show = new Array<boolean>(OPPOSITE_SIDE_APPROACH_ITEM_COUNT).fill(true);
  const checked = new Array<boolean>(OPPOSITE_SIDE_APPROACH_ITEM_COUNT).fill(false);
  checked[1] = !inputs.jettisonActivePbOn;
  checked[2] = !inputs.jettisonArmPbOn;
  checked[11] = flapLeverAtOrBeyond(inputs, 1);
  checked[12] = inputs.gearLeverDown;
  checked[14] = flapLeverAtOrBeyond(inputs, 2);
  checked[17] = flapLeverAtOrBeyond(inputs, 3);
  checked[18] = inputs.groundSpoilersArmed;
  return { show, checked };
}
