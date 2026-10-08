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
 * - "Depending on the failed engines: PACK 1(2) ... OFF": the pack of the side of the failed engines, PACK 1 for the
 *   engines 1 and 2, PACK 2 for 3 and 4 (each pack is supplied from the bleed of its side; the FCOM pairs them the same
 *   way in ENG START VLV FAULT, l.173107-173120: "IF L (if engine 1 or 2 is affected) or R (if engine 3 or 4 is
 *   affected) XBLEED STILL OPEN ... PACK 1(2) ... OFF").
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
 * The hydraulic system lost with the two engines of its side out (DSC-29-10, l.60996-61024): "The pumps of Engines 1 and 2
 * pressurize the GREEN hydraulic system - The pumps of Engines 3 and 4 pressurize the YELLOW hydraulic system", and "Two
 * electric pumps can provide hydraulic power on ground only".
 *
 * ENG TWO ENGS OUT ON SAME SIDE, STATUS INOP SYS ALL PHASES (l.175440-175448) lists "PART SPLRs" and "G(Y) HYD SYS
 * (Depending on the failed engines)". The FWS low pressure monitoring of a system needs an engine of its side running, so
 * these lines come from the failed engines.
 */
export function hydraulicSystemsLostByEnginesOut(enginesOut: EnginesOut): { green: boolean; yellow: boolean } {
  const [eng1, eng2, eng3, eng4] = enginesOut;
  return { green: eng1 && eng2, yellow: eng3 && eng4 };
}

/** The generators 1 to 4, inoperative or not, generator 1 first */
export type GeneratorsInop = readonly [boolean, boolean, boolean, boolean];

/**
 * ENG TWO ENGS OUT ON OPPOSITE SIDE, STATUS INOP SYS ALL PHASES (l.175620-175621): "GEN 1+4(1+3)(2+3)(2+4) (Depending on
 * the failed engines)". One line for the two generators lost, when exactly these two generators are lost and they are on
 * opposite sides (the generators 1 and 2 are on the left wing, 3 and 4 on the right wing; the same side pairs have their
 * own GEN 1+2 and GEN 3+4 lines).
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

/**
 * ENG ALL ENG FLAME OUT flight phase inhibition (FCOM PRO-ABN-ECAM-10-70 P 69/110, PDF p.5833): phases 1 to 6 and 10 to 12.
 */
export const ALL_ENG_FLAME_OUT_INHIBITED_PHASES: number[] = [1, 2, 3, 4, 5, 6, 10, 11, 12];

/**
 * ENG ALL ENG FLAME OUT, l.173795: "This alert inhibits the ELEC EMER CONFIG alert." Only while ALL ENG FLAME OUT is shown or
 * about to be: it is already on the E/WD, or the flight phase lets it come up. The FWS phase inhibition only holds back a
 * new alert, so an ALL ENG FLAME OUT already shown stays when a phase that inhibits it begins. Otherwise, e.g. all engines
 * out between 400 ft and 1500 ft (phase 6), ELEC EMER CONFIG shows: one of the two alerts is always there.
 */
export function allEngFlameOutInhibitsElecEmerConfig(
  allEnginesFailure: boolean,
  allEngFlameOutPresented: boolean,
  flightPhase: number,
): boolean {
  return allEnginesFailure && (allEngFlameOutPresented || !ALL_ENG_FLAME_OUT_INHIBITED_PHASES.includes(flightPhase));
}
