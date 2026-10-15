// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * EMER CANC and RCL pbs of the A320 ECAM control panel (FCOM DSC-31-30, a320_fcom.txt):
 *
 * (3) RCL pb, l.46754-46766: "When pressed, the E/WD displays all alerts previously cleared via the CLR pb that are still
 * active." / "When pressed for more than 3 s, the E/WD displays: All alerts previously cleared via the CLR pb that are
 * still active, All alerts previously cancelled via the EMER CANC pb." / "Note: 1. If there is no alert to recall, the
 * "NORMAL" message appears for 3 s on the E/WD. 2. This action on the RCL pb also suppresses the flight phase inhibition
 * function until the next flight phase."
 *
 * (7) EMER CANC pb, l.46809-46823: "Warnings: Cancels (stops) an aural warning for as long as the failure condition
 * continues, Extinguishes the MASTER WARNINGS lights, Does not affect the ECAM message display. Cautions: Cancels any
 * present caution (single chime, MASTER CAUTION lights, ECAM message) for the rest of the flight." / "The flight crew can
 * press the RCL pb for more than 3 s in order to restore all the alerts previously canceled via the EMER CANC pb. All the
 * alerts previously canceled via the EMER CANC pb automatically reappear on the E/WD in flight phase 1 or 2, immediately
 * after the alignment of IRs 1 and 2."
 *
 * STATUS page, DSC-31-20 l.46193: "(5) Cancelled caution: White"; l.46233-46235: the STS reminder needs a STATUS page that
 * "displays message other than "CANCELLED CAUTION" or MAINTENANCE status".
 *
 * Before, the PseudoFWC computed the EMER CANC pulse and never read it, and a RCL press with nothing to recall showed
 * nothing. The A380X FWS has the same rules (FwsRecall, FwsEmerCancel); this is the A320 version.
 */

import { CANCELLED_CAUTION_STATUS_CODE } from '@shared/StatusMessages';

/** l.46759: the RCL pb "pressed for more than 3 s" */
export const RECALL_LONG_PRESS_SECONDS = 3;

/** l.46763: "the "NORMAL" message appears for 3 s on the E/WD" */
export const RECALL_NORMAL_SECONDS = 3;

/** The E/WD memo code of NORMAL (EwdMessages '000000001') */
export const RECALL_NORMAL_MEMO_CODE = '000000001';

/**
 * The RCL pb held: true in the one update where it has been held for 3 s (the long press), whatever the short press did.
 */
export class RecallPushbutton {
  private heldSeconds = 0;

  private longPressDone = false;

  /**
   * @param pressed the RCL pb is pressed (ECP bus word or hardwired discrete)
   * @param deltaSeconds the time since the last update, in seconds
   * @returns true in the update the pb reaches 3 s held
   */
  update(pressed: boolean, deltaSeconds: number): boolean {
    if (!pressed) {
      this.heldSeconds = 0;
      this.longPressDone = false;
      return false;
    }
    this.heldSeconds += deltaSeconds;
    if (!this.longPressDone && this.heldSeconds >= RECALL_LONG_PRESS_SECONDS) {
      this.longPressDone = true;
      return true;
    }
    return false;
  }
}

/** A message shown for a fixed time (NORMAL after a RCL press with nothing to recall) */
export class TimedMessage {
  private remainingSeconds = 0;

  constructor(private readonly durationSeconds: number) {}

  show(): void {
    this.remainingSeconds = this.durationSeconds;
  }

  hide(): void {
    this.remainingSeconds = 0;
  }

  update(deltaSeconds: number): void {
    this.remainingSeconds = Math.max(0, this.remainingSeconds - deltaSeconds);
  }

  get isShown(): boolean {
    return this.remainingSeconds > 0;
  }
}

/**
 * Whether a RCL press has nothing to recall (NORMAL for 3 s): no cleared alert still active, no cleared secondary
 * failure and no cleared procedure line.
 * @param recallableAlertCount the cleared alerts still active (PseudoFWC recallFailures)
 * @param clearedLineCount the cleared secondary failures and the alerts with cleared procedure lines
 */
export function isNothingToRecall(recallableAlertCount: number, clearedLineCount: number): boolean {
  return recallableAlertCount === 0 && clearedLineCount === 0;
}

/** An alert of the E/WD left column, in display order, for the EMER CANC pb */
export interface DisplayedAlert {
  key: string;
  /** 3 warning, 2 caution, 1 caution without attention getters */
  level: number;
}

export type EmerCancelAction = { kind: 'silenceWarnings' } | { kind: 'cancelCaution'; key: string } | { kind: 'none' };

/**
 * What one EMER CANC press does. Design choice (the FCOM gives the effect on a warning and on a caution, not which one a
 * press acts on): while a warning has its aural or MASTER WARN on, the press stops them (all active warnings, as one aural
 * and one light are shared); otherwise it cancels the first caution of the E/WD, one caution per press, as the A380X FWS
 * does (EMER CANC on the alert at the top of the EWD).
 * @param warningAttentionGettersOn a warning has its aural (CRC, C-chord, cavalry charge) or MASTER WARN light on
 * @param displayedAlerts the alerts of the E/WD left column, in display order
 */
export function emerCancelAction(
  warningAttentionGettersOn: boolean,
  displayedAlerts: readonly DisplayedAlert[],
): EmerCancelAction {
  if (warningAttentionGettersOn) {
    return { kind: 'silenceWarnings' };
  }
  const caution = displayedAlerts.find((alert) => alert.level === 1 || alert.level === 2);
  return caution !== undefined ? { kind: 'cancelCaution', key: caution.key } : { kind: 'none' };
}

/**
 * What the EMER CANC pb has cancelled:
 * - the cautions, for the rest of the flight (even if their condition goes and comes back),
 * - the warnings whose aural is stopped, while they stay active (one triggered again has its aural again).
 */
export class EmerCancelMemory {
  /** The cautions cancelled for the rest of the flight, in the order they were cancelled */
  public readonly cancelledCautions: string[] = [];

  private readonly silencedWarnings: string[] = [];

  cancelCaution(key: string): void {
    if (!this.cancelledCautions.includes(key)) {
      this.cancelledCautions.push(key);
    }
  }

  isCancelledCaution(key: string): boolean {
    return this.cancelledCautions.includes(key);
  }

  silenceWarnings(keys: readonly string[]): void {
    for (const key of keys) {
      if (!this.silencedWarnings.includes(key)) {
        this.silencedWarnings.push(key);
      }
    }
  }

  isSilencedWarning(key: string): boolean {
    return this.silencedWarnings.includes(key);
  }

  /**
   * Forgets the silenced warnings that are no longer active
   * @param activeKeys the alerts active now
   */
  forgetInactiveWarnings(activeKeys: readonly string[]): void {
    for (let i = this.silencedWarnings.length - 1; i >= 0; i--) {
      if (!activeKeys.includes(this.silencedWarnings[i])) {
        this.silencedWarnings.splice(i, 1);
      }
    }
  }

  /**
   * RCL pb for more than 3 s, or the automatic restore: the cancelled cautions are no longer cancelled
   * @param isActive whether an alert is active now
   * @returns the cancelled cautions still active, to show again on the E/WD
   */
  restoreCancelledCautions(isActive: (key: string) => boolean): string[] {
    const stillActive = this.cancelledCautions.filter((key) => isActive(key));
    this.cancelledCautions.length = 0;
    return stillActive;
  }

  /** The FWC lost its memory (both FWCs failed) */
  reset(): void {
    this.cancelledCautions.length = 0;
    this.silencedWarnings.length = 0;
  }
}

/**
 * The STATUS left column codes of the CANCELLED CAUTION part (StatusMessages formatStatusPage): its title code, then the
 * E/WD title code of each cancelled caution; none without cancelled caution.
 * @param titleCodes the E/WD title codes of the cancelled cautions (undefined for an unknown alert)
 */
export function cancelledCautionStatusCodes(titleCodes: readonly (string | undefined)[]): string[] {
  const codes = titleCodes.filter((code): code is string => code !== undefined);
  return codes.length > 0 ? [CANCELLED_CAUTION_STATUS_CODE, ...codes] : [];
}

/**
 * l.46822-46823: the cancelled alerts "automatically reappear on the E/WD in flight phase 1 or 2, immediately after the
 * alignment of IRs 1 and 2": true in the update both IRs become aligned (NAV) during phase 1 or 2.
 */
export class IrAlignmentRestore {
  private bothAligned = false;

  update(flightPhase: number, ir1Aligned: boolean, ir2Aligned: boolean): boolean {
    const bothAligned = ir1Aligned && ir2Aligned;
    const restore = bothAligned && !this.bothAligned && (flightPhase === 1 || flightPhase === 2);
    this.bothAligned = bothAligned;
    return restore;
  }
}

/**
 * Whether an IR is aligned, from its maintenance word (L:A32NX_ADIRS_IR_n_MAINT_WORD, docs/a320-simvars.md): normal
 * operation, NAV_MODE (doc bit 2) and not ALIGNMENT_NOT_READY (doc bit 0). The fbw-sdk Arinc429 bit numbers start at 1:
 * doc bit 0 is bitValue(1), doc bit 2 is bitValue(3) (as A320_Neo_CDU_IRSMonitor).
 */
export function isIrAligned(normalOperation: boolean, alignmentNotReadyBit1: boolean, navModeBit3: boolean): boolean {
  return normalOperation && navModeBit3 && !alignmentNotReadyBit1;
}
