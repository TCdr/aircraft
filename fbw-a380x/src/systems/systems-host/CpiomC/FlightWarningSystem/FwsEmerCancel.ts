// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * What the EMER CANC pb of the ECP has cancelled (A380 FCOM DSC-31-40-20 P 5):
 * - a caution is cancelled for the remainder of the flight, even if its triggering conditions occur again; the STATUS
 *   page lists it under CANCELLED CAUTION, and RCL pressed for more than 3 s brings it back if it is still active,
 * - a warning only loses its audio indicator and MASTER WARN light: its procedure stays on the EWD, and if the warning is
 *   triggered a second time, the audio indicator and MASTER WARN light appear again.
 */
export class FwsEmerCancel {
  /** The cautions cancelled for the remainder of the flight, in the order they were cancelled */
  public readonly cancelledCautions: string[] = [];

  /** The warnings whose audio indicator and MASTER WARN light are cancelled, while they stay active */
  private readonly silencedWarnings = new Set<string>();

  public cancelCaution(key: string): void {
    if (!this.cancelledCautions.includes(key)) {
      this.cancelledCautions.push(key);
    }
  }

  public isCancelledCaution(key: string): boolean {
    return this.cancelledCautions.includes(key);
  }

  public silenceWarnings(keys: readonly string[]): void {
    keys.forEach((key) => this.silencedWarnings.add(key));
  }

  public isSilencedWarning(key: string): boolean {
    return this.silencedWarnings.has(key);
  }

  /**
   * Forgets the silenced warnings that are no longer active: when one is triggered a second time, its audio indicator
   * and MASTER WARN light appear again. The cancelled cautions stay cancelled.
   * @param activeKeys the alerts active now
   */
  public update(activeKeys: readonly string[]): void {
    for (const key of [...this.silencedWarnings]) {
      if (!activeKeys.includes(key)) {
        this.silencedWarnings.delete(key);
      }
    }
  }

  /**
   * RCL pb pressed for more than 3 s: the cancelled cautions are no longer cancelled
   * @param activeKeys the alerts active now
   * @returns the cancelled cautions that are still active, to be displayed again on the EWD
   */
  public recall(activeKeys: readonly string[]): string[] {
    const back = this.cancelledCautions.filter((key) => activeKeys.includes(key));
    this.cancelledCautions.length = 0;
    return back;
  }

  public reset(): void {
    this.cancelledCautions.length = 0;
    this.silencedWarnings.clear();
  }
}
