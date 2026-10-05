// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXLogicConfirmNode, NXLogicMemoryNode, NXLogicPulseNode } from '@flybywiresim/fbw-sdk';

/*
 * A380X FWS engine failure logic (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt): ENG 1(2)(3)(4) FAIL (l.171712-171981),
 * ENG 1(2)(3)(4) SHUT DOWN (l.172693-172806), ENG TWO ENGS OUT ON SAME SIDE (l.175216-175470) and ON OPPOSITE SIDE
 * (l.175471-175635). Pure logic, used by FwsCore for the four engines alike.
 */

/** The engine states of the FADEC (L:A32NX_ENGINE_STATE:n, fadec_a380x EngineControl_A380X.h) */
export enum FadecEngineState {
  Off = 0,
  On = 1,
  Starting = 2,
  Restarting = 3,
  Shutting = 4,
}

/**
 * ENG 1(2)(3)(4) FAIL, l.171718: "The FWS detects that the engine is not running when N2 is below 61 %." That is the N2 of
 * the GP7270 of the FCOM (its HP spool). FBW models the Trent 972, whose HP spool is the N3, and keeps the existing
 * threshold: design choice already in the code, the engine is not running below 50 % N3.
 */
export const ENG_FAIL_CORE_SPEED_PERCENT = 50;

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
 * The ENG FAIL memory of one engine (the FWS logic of FBW, the same for the four engines).
 * - "Was running": the engine ran (FADEC state ON, held 5 s after it stopped). It is cleared by the MASTER ON of a start
 *   or relight attempt, so that an attempt that does not light up gives no new ENG FAIL.
 * - ENG FAIL: set when the engine that was running is below 50 % N3 with its master ON and its ENG FIRE pb not pushed,
 *   cleared when the engine runs again (or is starting above 50 % N3).
 *
 * Before 2026-10-05 the engines 3 and 4 took "master ON and not STARTING" for "was running": a start or relight attempt
 * that had not lit up (master ON, engine not running) raised ENG 3(4) FAIL.
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

export function countEnginesOut(enginesOut: EnginesOut): number {
  return enginesOut.filter((out) => out).length;
}

/**
 * ENG 1(2)(3)(4) FAIL, IF NOT DAMAGED (l.171865-171873): "If less than three engines failed: ENG (AFFECTED) RELIGHT PROC
 * ... CONSIDER"; "If more than two engines failed: ENG (AFFECTED) RELIGHT PROC ... APPLY". Design choice: an engine
 * counts as failed when it is out (ENG FAIL or ENG SHUT DOWN).
 */
export function relightProcMustBeApplied(enginesOut: EnginesOut): boolean {
  return countEnginesOut(enginesOut) > 2;
}

export enum TwoEnginesOut {
  None,
  /** ENG TWO ENGS OUT ON SAME SIDE, l.175224: "triggered when two engines are failed on the same side" */
  SameSide,
  /** ENG TWO ENGS OUT ON OPPOSITE SIDE, l.175477: "triggered when two engines are failed on opposite side" */
  OppositeSide,
}

/**
 * Which TWO ENGS OUT caution applies. Design choice: exactly two engines out (the FCOM has no three engines out alert,
 * three engines out raise the ENG FAIL / SHUT DOWN alerts only); engines 1 and 2 are on the left wing, 3 and 4 on the
 * right wing.
 */
export function twoEnginesOut(enginesOut: EnginesOut): TwoEnginesOut {
  if (countEnginesOut(enginesOut) !== 2) {
    return TwoEnginesOut.None;
  }
  const [eng1, eng2, eng3, eng4] = enginesOut;
  return (eng1 && eng2) || (eng3 && eng4) ? TwoEnginesOut.SameSide : TwoEnginesOut.OppositeSide;
}

/**
 * The ECAM lines of ENG TWO ENGS OUT ON SAME SIDE that depend on the failed engines (l.175263-175271).
 * - "Depending on the failed engines: PACK 1(2) ... OFF". Design choice: the pack of the side of the failed engines (PACK 1
 *   for the engines 1 and 2, PACK 2 for 3 and 4; each pack is supplied from the bleed of its side).
 * - "If ENG 1+2 failed: FOR TAXI : STEER ENDURANCE LIMITED" (the normal nose wheel steering, green hydraulics, is lost).
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
 * ENG 1(2)(3)(4) SHUT DOWN, STATUS (l.172777-172791):
 * - INOP SYS APPR: "BTV (If ENG 2(3) affected)", "CAT 3 DUAL (If APU off)".
 * - INFO: "If APU off: CAT 3 SINGLE ONLY. Only three different generators supply the AC busbars."
 * The other INOP SYS lines (GEN, G/Y ENG PMP A+B, ENG BLEED, ENG 2(3) REVERSER) come from FwsInopSys already.
 */
export function shutDownBtvInop(eng2ShutDown: boolean, eng3ShutDown: boolean): boolean {
  return eng2ShutDown || eng3ShutDown;
}

export function shutDownCat3SingleOnly(anyEngineShutDown: boolean, apuAvailable: boolean): boolean {
  return anyEngineShutDown && !apuAvailable;
}
