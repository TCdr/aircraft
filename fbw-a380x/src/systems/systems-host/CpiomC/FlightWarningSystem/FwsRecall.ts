// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * RCL and RCL LAST pbs of the ECAM control panel.
 * - RCL LAST pb: cancels the last CLEAR pb action on an alert.
 * - RCL pb: brings back on the EWD every alert already performed and still active and every still active not-sensed
 *   ABN PROC. Held for more than 3 s, it also brings back the alerts cancelled with the EMER CANC pb, cleared, or
 *   inhibited by the current flight phase. With no alert to recall, NORMAL appears for 3 s.
 */

/** NORMAL on the EWD after a RCL press with no alert to recall, in ms */
export const RECALL_NORMAL_MEMO_MS = 3_000;

/**
 * The CLEAR pb actions, newest last, for the RCL LAST pb. An entry is the key of the alert (or not-sensed ABN PROC)
 * the CLEAR pb took off the EWD.
 */
export class EcamClearHistory {
  private readonly clearedKeys: string[] = [];

  /**
   * The CLEAR pb took an alert off the EWD
   * @param key the alert key
   */
  public onCleared(key: string): void {
    this.forget(key);
    this.clearedKeys.push(key);
  }

  /**
   * An alert is back on the EWD (recalled, or triggered again), it is no more a cleared one
   * @param key the alert key
   */
  public forget(key: string): void {
    const index = this.clearedKeys.indexOf(key);
    if (index !== -1) {
      this.clearedKeys.splice(index, 1);
    }
  }

  /** The FWS is reset (power up, 50 min after shutdown) */
  public reset(): void {
    this.clearedKeys.length = 0;
  }

  /**
   * The alert the RCL LAST pb brings back: the one of the last CLEAR pb action. Design choice: an alert that is no
   * more active cannot come back, so the press then cancels the newest CLEAR action of an alert still active (each
   * further press goes one CLEAR action further back).
   * @param recallable the cleared alerts still active (FwsCore recallFailures)
   * @returns the key to put back on the EWD, or undefined when no CLEAR action can be cancelled
   */
  public lastCleared(recallable: readonly string[]): string | undefined {
    for (let i = this.clearedKeys.length - 1; i >= 0; i--) {
      if (recallable.includes(this.clearedKeys[i])) {
        return this.clearedKeys[i];
      }
    }
    return undefined;
  }
}

/** What a short RCL press does */
export interface RecallResult {
  /** The alerts to put back on the EWD */
  readonly recalled: readonly string[];
  /** NORMAL appears for 3 s: nothing to recall */
  readonly showNormal: boolean;
}

/**
 * A short RCL press: every cleared alert and not-sensed ABN PROC still active comes back at once.
 * @param recallable the cleared alerts and not-sensed ABN PROCs still active, without the EMER CANC cancelled cautions
 * (FwsCore recallFailures)
 * @returns the alerts to recall, or NORMAL when there is none
 */
export function recallAll(recallable: readonly string[]): RecallResult {
  return { recalled: [...recallable], showNormal: recallable.length === 0 };
}

/**
 * The RCL pb pressed for more than 3 s shows the alerts inhibited by the current flight phase. Design choice: the
 * override lasts until the flight phase changes (the aircraft documentation gives no end), as the A320 FWC does. A
 * memory node is not used: its reset pulse was cleared before it was read, so the override never ended (the T.O
 * INHIBIT / LDG INHIBIT memos stayed off for the rest of the flight).
 */
export class FlightPhaseInhibitOverride {
  /** The flight phase in which the long RCL press was made, null without override */
  private overriddenPhase: number | null = null;

  /**
   * @param longRecallStarted the RCL pb has just been held for 3 s (true in one update)
   * @param flightPhase the current FWS flight phase
   * @returns true while the flight phase inhibition is overridden
   */
  public update(longRecallStarted: boolean, flightPhase: number): boolean {
    if (longRecallStarted) {
      this.overriddenPhase = flightPhase;
    } else if (this.overriddenPhase !== null && this.overriddenPhase !== flightPhase) {
      this.overriddenPhase = null;
    }
    return this.active;
  }

  /** Whether the flight phase inhibition is overridden */
  public get active(): boolean {
    return this.overriddenPhase !== null;
  }
}
