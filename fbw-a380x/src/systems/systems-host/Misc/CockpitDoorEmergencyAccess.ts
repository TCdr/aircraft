// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { COCKPIT_DOOR_VARS } from '@shared/DoorsAndSlides';

/*
 * Emergency access to the cockpit: the cabin crew enters the emergency code on the keypad (the flyPad ATA 52 entry
 * "Cockpit door emergency access request", as the cabin is not simulated). The flight crew answers with the CKPT DOOR
 * sw: UNLOCK opens the door, LOCK refuses the access and inhibits the keypad for a while. Without an answer the door
 * unlocks by itself for 5 s after a delay. DOOR CKPT DOOR EMER OPENING IN PROGRESS is shown until then.
 */

/** Design choice: 30 s, the operator chooses between 15 s and 120 s */
export const AUTO_UNLOCK_DELAY_S = 30;

export const AUTO_UNLOCK_DURATION_S = 5;

/** Design choice: 10 min, the operator chooses between 5 min and 20 min */
export const KEYPAD_INHIBITION_AFTER_LOCK_S = 600;

export interface CockpitDoorEmergencyAccessResult {
  emerOpeningInProgress: boolean;
  /** The lock state the system sets now, null when it leaves the lock alone */
  commandLocked: boolean | null;
}

export class CockpitDoorEmergencyAccessLogic {
  private requestWasActive = false;

  private lastSwitchSelections: number | null = null;

  private inProgress = false;

  private timeSinceRequestS = 0;

  private keypadInhibitionS = 0;

  private autoUnlockRemainingS = 0;

  /**
   * @param deltaTimeS time since the last update
   * @param emergencyCodeEntered the cabin crew request; a new request starts when it becomes true
   * @param switchSelections the count of CKPT DOOR sw selections to LOCK or UNLOCK
   * @param doorLocked the door is locked
   */
  public update(
    deltaTimeS: number,
    emergencyCodeEntered: boolean,
    switchSelections: number,
    doorLocked: boolean,
  ): CockpitDoorEmergencyAccessResult {
    const switchSelected = this.lastSwitchSelections !== null && switchSelections !== this.lastSwitchSelections;
    this.lastSwitchSelections = switchSelections;
    const newRequest = emergencyCodeEntered && !this.requestWasActive;
    this.requestWasActive = emergencyCodeEntered;
    this.keypadInhibitionS = Math.max(0, this.keypadInhibitionS - deltaTimeS);

    let commandLocked: boolean | null = null;

    if (this.autoUnlockRemainingS > 0) {
      this.autoUnlockRemainingS -= deltaTimeS;
      if (switchSelected) {
        this.autoUnlockRemainingS = 0;
      } else if (this.autoUnlockRemainingS <= 0) {
        commandLocked = true;
      }
    }

    if (newRequest && this.keypadInhibitionS === 0) {
      this.inProgress = true;
      this.timeSinceRequestS = 0;
    } else if (this.inProgress) {
      this.timeSinceRequestS += deltaTimeS;
      if (switchSelected) {
        this.inProgress = false;
        if (doorLocked) {
          this.keypadInhibitionS = KEYPAD_INHIBITION_AFTER_LOCK_S;
        }
      } else if (this.timeSinceRequestS >= AUTO_UNLOCK_DELAY_S) {
        this.inProgress = false;
        this.autoUnlockRemainingS = AUTO_UNLOCK_DURATION_S;
        commandLocked = false;
      }
    }

    return { emerOpeningInProgress: this.inProgress, commandLocked };
  }
}

/** Runs the emergency access logic of the cockpit door locking system */
export class CockpitDoorEmergencyAccess implements Instrument {
  private readonly logic = new CockpitDoorEmergencyAccessLogic();

  private inProgressWritten: boolean | null = null;

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failuresConsumer: Pick<FailuresConsumer, 'register' | 'isActive'>,
  ) {}

  /** @inheritdoc */
  public init(): void {
    this.failuresConsumer.register(A380Failure.CockpitDoorEmergencyAccessRequest);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const result = this.logic.update(
      this.sysHost.deltaTime / 1000,
      this.failuresConsumer.isActive(A380Failure.CockpitDoorEmergencyAccessRequest),
      SimVar.GetSimVarValue(COCKPIT_DOOR_VARS.switchSelections, SimVarValueType.Number),
      SimVar.GetSimVarValue(COCKPIT_DOOR_VARS.locked, SimVarValueType.Bool) > 0,
    );
    if (result.commandLocked !== null) {
      SimVar.SetSimVarValue(COCKPIT_DOOR_VARS.locked, SimVarValueType.Bool, result.commandLocked ? 1 : 0);
    }
    if (result.emerOpeningInProgress !== this.inProgressWritten) {
      SimVar.SetSimVarValue(
        COCKPIT_DOOR_VARS.emerOpeningInProgress,
        SimVarValueType.Bool,
        result.emerOpeningInProgress ? 1 : 0,
      );
      this.inProgressWritten = result.emerOpeningInProgress;
    }
  }
}
