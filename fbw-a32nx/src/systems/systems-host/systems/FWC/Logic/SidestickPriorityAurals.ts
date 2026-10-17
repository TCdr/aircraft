// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The sidestick priority synthetic voices of the A320 FWC: "DUAL INPUT", "PRIORITY LEFT" and "PRIORITY RIGHT".
 * - Both pilots use their sidesticks at the same time: the two green SIDE STICK PRIORITY lights on the glareshield
 *   come on and DUAL INPUT is said, every 5 s, silenced when one sidestick is deactivated.
 * - PRIORITY LEFT / PRIORITY RIGHT: on the A/P TAKE OVER pb, 1 s (the length of the message).
 * - The crew check of the priority logic presses the take over pb for at least 3 s and checks the PRIORITY LEFT
 *   (RIGHT) voice.
 *
 * The FWC gets the sidestick data from the FCDCs, as the priority lights (fbw_a320/src/fcdc/Fcdc.cpp
 * computeSidestickPriorityLights): a sidestick is deflected at 2 degrees or more in pitch or roll, and the FCDC
 * discrete word 2 tells which sidestick is deactivated (bit 28 left, bit 29 right).
 *
 * Design choices:
 * - PRIORITY LEFT (RIGHT) is called once the other sidestick has been deactivated for 1 s. No delay is documented,
 *   but the take over pb is also the autopilot disconnect pb: a short press to disconnect the autopilot (or to
 *   silence the cavalry charge) must not call it. The crew check presses the pb for at least 3 s.
 * - While a GPWS or TCAS aural is active, these voices wait, as the radio height callouts do (FwsAutoCallouts).
 *
 * In the sim the F/O sidestick sends no input to the ELACs and SECs (FlyByWireInterface.cpp, fo_pitch_stick_pos = 0),
 * so DUAL INPUT can only come once an F/O sidestick input exists; the logic and its data path are ready.
 */

/** The FWC sidestick priority voices, named as the FwsSoundManager aurals */
export type SidestickPriorityAural = 'dualInput' | 'priorityLeft' | 'priorityRight';

/** One ARINC 429 word as the FWC reads it (Arinc429Word) */
export interface FcdcArincWord {
  readonly value: number;
  isNormalOperation(): boolean;
  /** The bit when the word is valid (normal operation or functional test), else the given value */
  bitValueOr(bit: number, valueIfInvalid: boolean): boolean;
}

/** The FCDC words with the sidestick data (L:A32NX_FCDC_n_DISCRETE_WORD_2 and _CAPT/FO_PITCH/ROLL_COMMAND) */
export interface FcdcSidestickWords {
  discreteWord2: FcdcArincWord;
  captPitchCommand: FcdcArincWord;
  captRollCommand: FcdcArincWord;
  foPitchCommand: FcdcArincWord;
  foRollCommand: FcdcArincWord;
}

export interface SidestickPriorityInputs {
  /** The CAPT (left) sidestick is deflected */
  captSidestickDeflected: boolean;
  /** The F/O (right) sidestick is deflected */
  foSidestickDeflected: boolean;
  /** The CAPT (left) sidestick is deactivated: the F/O has the priority */
  leftSidestickDeactivated: boolean;
  /** The F/O (right) sidestick is deactivated: the CAPT has the priority */
  rightSidestickDeactivated: boolean;
}

/** A sidestick is deflected from this angle, in degrees (Fcdc.cpp computeSidestickPriorityLights) */
const SIDESTICK_DEFLECTED_DEG = 2;

/** The FCDC discrete word 2 bits (Fcdc.cpp getBusOutputs efcsStatus2) */
const FcdcSidestickBits = {
  leftSidestickDeactivated: 28,
  rightSidestickDeactivated: 29,
};

/** DUAL INPUT is repeated every 5 s */
const DUAL_INPUT_REPEAT_SECONDS = 5;

/** Design choice: the priority must be held this long before PRIORITY LEFT (RIGHT) is called, see above */
export const PRIORITY_CONFIRM_SECONDS = 1;

function commandDeflected(command: FcdcArincWord): boolean {
  return command.isNormalOperation() && Math.abs(command.value) >= SIDESTICK_DEFLECTED_DEG;
}

/**
 * Reads the sidestick data of the FCDC that sends it: FCDC 1, else FCDC 2.
 * @param fcdc1 the words of the FCDC 1
 * @param fcdc2 the words of the FCDC 2
 * @returns the sidestick inputs of the FWC logic
 */
export function readSidestickPriorityInputs(
  fcdc1: FcdcSidestickWords,
  fcdc2: FcdcSidestickWords,
): SidestickPriorityInputs {
  const fcdc = fcdc1.discreteWord2.isNormalOperation() || !fcdc2.discreteWord2.isNormalOperation() ? fcdc1 : fcdc2;
  return {
    captSidestickDeflected: commandDeflected(fcdc.captPitchCommand) || commandDeflected(fcdc.captRollCommand),
    foSidestickDeflected: commandDeflected(fcdc.foPitchCommand) || commandDeflected(fcdc.foRollCommand),
    leftSidestickDeactivated: fcdc.discreteWord2.bitValueOr(FcdcSidestickBits.leftSidestickDeactivated, false),
    rightSidestickDeactivated: fcdc.discreteWord2.bitValueOr(FcdcSidestickBits.rightSidestickDeactivated, false),
  };
}

/** Decides when the FWC says DUAL INPUT, PRIORITY LEFT or PRIORITY RIGHT */
export class SidestickPriorityAurals {
  /** Seconds since the last DUAL INPUT of the current dual input, null when there is no dual input or none was said */
  private secondsSinceDualInput: number | null = null;

  /** Seconds the F/O sidestick has been deactivated (CAPT priority) */
  private captPrioritySeconds = 0;

  private captPriorityCalled = false;

  /** Seconds the CAPT sidestick has been deactivated (F/O priority) */
  private foPrioritySeconds = 0;

  private foPriorityCalled = false;

  /**
   * @param inputs the sidestick data from the FCDC
   * @param auralInhibited a GPWS or TCAS aural is active: the voices wait
   * @param deltaTimeSeconds the time since the last update
   * @returns the voices to say now (usually none)
   */
  public update(
    inputs: SidestickPriorityInputs,
    auralInhibited: boolean,
    deltaTimeSeconds: number,
  ): SidestickPriorityAural[] {
    const aurals: SidestickPriorityAural[] = [];

    // PRIORITY LEFT: the CAPT holds the priority, the F/O sidestick is deactivated
    const captPriority = inputs.rightSidestickDeactivated && !inputs.leftSidestickDeactivated;
    this.captPrioritySeconds = captPriority ? this.captPrioritySeconds + deltaTimeSeconds : 0;
    if (!captPriority) {
      this.captPriorityCalled = false;
    } else if (!this.captPriorityCalled && this.captPrioritySeconds >= PRIORITY_CONFIRM_SECONDS && !auralInhibited) {
      this.captPriorityCalled = true;
      aurals.push('priorityLeft');
    }

    // PRIORITY RIGHT: the F/O holds the priority, the CAPT sidestick is deactivated
    const foPriority = inputs.leftSidestickDeactivated && !inputs.rightSidestickDeactivated;
    this.foPrioritySeconds = foPriority ? this.foPrioritySeconds + deltaTimeSeconds : 0;
    if (!foPriority) {
      this.foPriorityCalled = false;
    } else if (!this.foPriorityCalled && this.foPrioritySeconds >= PRIORITY_CONFIRM_SECONDS && !auralInhibited) {
      this.foPriorityCalled = true;
      aurals.push('priorityRight');
    }

    // DUAL INPUT: both sidesticks deflected and none deactivated, every 5 s
    const dualInput =
      inputs.captSidestickDeflected &&
      inputs.foSidestickDeflected &&
      !inputs.leftSidestickDeactivated &&
      !inputs.rightSidestickDeactivated;
    if (!dualInput) {
      this.secondsSinceDualInput = null;
    } else {
      if (this.secondsSinceDualInput !== null) {
        this.secondsSinceDualInput += deltaTimeSeconds;
      }
      const due = this.secondsSinceDualInput === null || this.secondsSinceDualInput >= DUAL_INPUT_REPEAT_SECONDS;
      if (due && !auralInhibited) {
        this.secondsSinceDualInput = 0;
        aurals.push('dualInput');
      }
    }

    return aurals;
  }
}
