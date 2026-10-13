// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * CONFIG L(R) SIDESTICK FAULT (BY TAKE OVER), the red takeoff configuration warning of a deactivated sidestick:
 * - A320 FCOM DSC-27-20-10 (a320_fcom.txt l.41078-41079): "If one sidestick was deactivated on ground, the CONFIG L(R)
 *   SIDESTICK FAULT alert is triggered at takeoff power application, or during the TO CONFIG test."
 * - PRO-ABN-CONFIG (l.74286-74298): "This alert triggers when the L or R sidestick is inoperative (takeover pb pressed
 *   more than 30 s) and when thrust levers are set at TO, or Flex TO, or when pressing T.O CONFIG pb."; procedure
 *   "L(R) TAKEOVER ..... DEPRESS", "The affected stick becomes operative".
 * - DSC-31-15 CONFIGURATION WARNINGS (l.46031-46033): CONFIG L (R) SIDESTICK FAULT, red, triggered by the TO CONFIG test
 *   and at TO power.
 * The flight phase inhibition (FCOM PDF "A320 Neo FCOM_1.pdf", PRO-ABN-CONFIG p 1/6, page 4519) is 5, 6, 7, 8.
 *
 * The FWC reads which sidestick is deactivated from the FCDC discrete word 2 (bit 28 left, bit 29 right, see
 * SidestickPriorityAurals). Like the other CONFIG warnings of the FBW FWC (CONFIG PITCH TRIM, RUD TRIM): the TO CONFIG
 * test shows it in flight phases 1, 2 and 9; the takeoff power (phases 3 and 4) latches it until the sidestick is active
 * again or phase 5 is reached; the CRC sounds while the TO CONFIG test or the takeoff power finds it.
 */

/** The flight phase inhibition of both warnings */
export const CONFIG_SIDESTICK_FAULT_PHASE_INHIBITION = [5, 6, 7, 8];

/** The E/WD codes (EwdMessages): title, (BY TAKE OVER), -L(R) TAKEOVER.....DEPRESS */
export const ConfigSidestickFaultCodes = {
  left: ['270041501', '270041502', '270041503'],
  right: ['270041601', '270041602', '270041603'],
} as const;

/** The state of one of the two warnings */
export interface ConfigSidestickFaultState {
  /** The warning is shown */
  readonly warning: boolean;
  /** The CRC sounds */
  readonly aural: boolean;
}

/** The inputs of one update */
export interface ConfigSidestickFaultInputs {
  /** The CAPT (left) sidestick is deactivated (FCDC discrete word 2 bit 28) */
  readonly leftSidestickDeactivated: boolean;
  /** The F/O (right) sidestick is deactivated (FCDC discrete word 2 bit 29) */
  readonly rightSidestickDeactivated: boolean;
  /** The FWC flight phase (1 to 10) */
  readonly flightPhase: number;
  /** The TO CONFIG pb is pressed, held at least 1.5 s (PseudoFWC toConfigTestHeldMin1s5Pulse) */
  readonly toConfigTest: boolean;
}

/** One warning: the takeoff power latch of one sidestick */
class SidestickWarning {
  private takeoffPowerLatch = false;

  update(deactivated: boolean, flightPhase: number, toConfigTest: boolean): ConfigSidestickFaultState {
    const toConfigTestPhase = flightPhase === 1 || flightPhase === 2 || flightPhase === 9;
    const takeoffPowerPhase = flightPhase === 3 || flightPhase === 4;
    const foundByTest = deactivated && toConfigTest && toConfigTestPhase;
    const foundAtTakeoffPower = deactivated && takeoffPowerPhase;
    if (foundAtTakeoffPower) {
      this.takeoffPowerLatch = true;
    } else if (!deactivated || flightPhase === 5) {
      this.takeoffPowerLatch = false;
    }
    return { warning: foundByTest || this.takeoffPowerLatch, aural: foundByTest || foundAtTakeoffPower };
  }
}

/** CONFIG L SIDESTICK FAULT and CONFIG R SIDESTICK FAULT */
export class ConfigSidestickFault {
  private readonly leftWarning = new SidestickWarning();

  private readonly rightWarning = new SidestickWarning();

  /**
   * @param inputs the sidestick state, flight phase and TO CONFIG test
   * @returns the left (CAPT) and right (F/O) warnings
   */
  update(inputs: ConfigSidestickFaultInputs): { left: ConfigSidestickFaultState; right: ConfigSidestickFaultState } {
    return {
      left: this.leftWarning.update(inputs.leftSidestickDeactivated, inputs.flightPhase, inputs.toConfigTest),
      right: this.rightWarning.update(inputs.rightSidestickDeactivated, inputs.flightPhase, inputs.toConfigTest),
    };
  }
}
