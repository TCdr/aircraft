// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The PRIORITY LEFT / PRIORITY RIGHT synthetic voices of the A380 FWS.
 * - The Captain pressing their sidestick pb triggers PRIORITY LEFT, the First Officer PRIORITY RIGHT.
 * - Each voice sounds once.
 * - If both pilots press their sidestick pb, the last one to press gets the priority.
 *
 * The voices are triggered from the sidestick pbs (L:A32NX_PRIORITY_TAKEOVER:1 and :2): the PRIMs do not send the
 * sidestick priority to the FWS in the sim.
 *
 * Design choices:
 * - The voice comes once the pb has been held for 1 s with the priority: the sidestick pb is also the autopilot
 *   disconnect pb, and a short press to disconnect the autopilot (or to stop the cavalry charge) must not call it.
 * - While a GPWS alert is active, the voice waits.
 *
 * Not done: the DUAL INPUT voice. The F/O sidestick sends no input in the sim
 * (FlyByWireInterface.cpp, fo_pitch_stick_pos = 0) and the A380X FCDC sends no sidestick position, so a dual input
 * cannot be seen.
 */

export type SidestickPriorityAural = 'priorityLeft' | 'priorityRight';

/** Design choice: the priority must be held this long before PRIORITY LEFT (RIGHT) is called, see above */
export const PRIORITY_CONFIRM_SECONDS = 1;

export class FwsSidestickPriority {
  /** Who has the priority: the last pilot to press the pb, while that pb is pressed */
  private priority: 'capt' | 'fo' | null = null;

  private captPbPreviouslyPressed = false;

  private foPbPreviouslyPressed = false;

  private prioritySeconds = 0;

  private priorityCalled = false;

  /**
   * @param captPbPressed the CAPT sidestick pb is pressed
   * @param foPbPressed the F/O sidestick pb is pressed
   * @param inhibited a GPWS alert is active: the voice waits
   * @param deltaTimeSeconds the time since the last update
   * @returns the voice to say now, else null
   */
  public update(
    captPbPressed: boolean,
    foPbPressed: boolean,
    inhibited: boolean,
    deltaTimeSeconds: number,
  ): SidestickPriorityAural | null {
    const previousPriority = this.priority;
    if (captPbPressed && !this.captPbPreviouslyPressed) {
      this.priority = 'capt';
    } else if (foPbPressed && !this.foPbPreviouslyPressed) {
      this.priority = 'fo';
    } else if ((this.priority === 'capt' && !captPbPressed) || (this.priority === 'fo' && !foPbPressed)) {
      // the holder released the pb: nobody has the priority, also when the other pb is still pressed (the priority
      // is taken by a press, as in the PRIM sidestick priority logic, A380PrimComputerFctl.cpp pLeftStickDisabled)
      this.priority = null;
    }
    this.captPbPreviouslyPressed = captPbPressed;
    this.foPbPreviouslyPressed = foPbPressed;

    if (this.priority !== previousPriority) {
      this.prioritySeconds = 0;
      this.priorityCalled = false;
    } else if (this.priority !== null) {
      this.prioritySeconds += deltaTimeSeconds;
    }

    if (
      this.priority !== null &&
      !this.priorityCalled &&
      this.prioritySeconds >= PRIORITY_CONFIRM_SECONDS &&
      !inhibited
    ) {
      this.priorityCalled = true;
      return this.priority === 'capt' ? 'priorityLeft' : 'priorityRight';
    }
    return null;
  }
}
