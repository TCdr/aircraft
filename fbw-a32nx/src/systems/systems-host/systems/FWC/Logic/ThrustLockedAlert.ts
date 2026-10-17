// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { FwcAlertItem, cautionItem } from './FwcAlertItem';

/*
 * ENG THRUST LOCKED:
 * - Triggers when the thrust levers are not moved within 5 s of an involuntary A/THR disconnection (or a disconnection
 *   with the FCU pb). The thrust lock of the FADEC (ECU maintenance word 6, bit 12) is active from the disconnection
 *   until the levers leave the CL (MCT) detent.
 * - The title flashes, and the FWC sounds the single chime and lights the MASTER CAUTION again every 5 s while the
 *   alert is shown.
 * - Procedure: THR LEVERS MOVE.
 * Flight phase inhibition: shown in phases 5, 6 and 7 only.
 */

/** The alert key of ENG THRUST LOCKED (EwdMessages 77003100x) */
export const THRUST_LOCKED_KEY = '7700310';

export const THRUST_LOCKED_PHASE_INHIBITION = [1, 2, 3, 4, 8, 9, 10];

/** The thrust lock time before the alert, and the period of its attention getters, in seconds */
const THRUST_LOCKED_DELAY_SECONDS = 5;
const THRUST_LOCKED_REPEAT_SECONDS = 5;

export class ThrustLockedAlert {
  private readonly active = Subject.create(false);

  private lockedSeconds = 0;

  /**
   * True for the one update, every 5 s after the alert triggered, in which the FWC sounds the single chime and lights
   * the MASTER CAUTION again (the first ones come with the new alert)
   */
  public repeatAttentionGetters = false;

  /**
   * @param thrustLocked the FADEC thrust lock is active
   * @param deltaSeconds the time since the last update, in seconds
   */
  update(thrustLocked: boolean, deltaSeconds: number): void {
    const previousSeconds = this.lockedSeconds;
    this.lockedSeconds = thrustLocked ? this.lockedSeconds + deltaSeconds : 0;
    this.active.set(thrustLocked && this.lockedSeconds >= THRUST_LOCKED_DELAY_SECONDS);

    // the number of whole repeat periods since the alert triggered, before and after this update
    const periods = (seconds: number) =>
      Math.floor((seconds - THRUST_LOCKED_DELAY_SECONDS) / THRUST_LOCKED_REPEAT_SECONDS);
    this.repeatAttentionGetters =
      this.active.get() &&
      previousSeconds >= THRUST_LOCKED_DELAY_SECONDS &&
      periods(this.lockedSeconds) > periods(previousSeconds);
  }

  get isActive(): boolean {
    return this.active.get();
  }

  /** The alert item for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [THRUST_LOCKED_KEY]: cautionItem(
      THRUST_LOCKED_KEY,
      2,
      this.active,
      THRUST_LOCKED_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.NONE,
    ),
  };
}
