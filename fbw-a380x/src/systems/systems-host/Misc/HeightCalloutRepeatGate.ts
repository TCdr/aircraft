// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Stops a height callout from being repeated while the radio height dithers around its threshold: the state machine
 * of the callouts calls a threshold again every time the height crosses it, and the radio height can jump by tens of
 * feet between two samples.
 *
 * Design choice: a word is not enqueued again within 11 s of its last enqueue. The manual gives no interval for the
 * repeat of a callout while the aircraft stays in its detection zone; 11 s is the spacing of the intermediate callout.
 */
export class HeightCalloutRepeatGate {
  static readonly MIN_REPEAT_SECONDS = 11;

  private elapsedSeconds = 0;

  private readonly lastEnqueuedSeconds = new Map<string, number>();

  advance(deltaTimeSeconds: number): void {
    this.elapsedSeconds += deltaTimeSeconds;
  }

  /** Returns true, and starts the 11 s of the word, when the word may be enqueued now. */
  tryEnqueue(word: string): boolean {
    const last = this.lastEnqueuedSeconds.get(word);
    if (last !== undefined && this.elapsedSeconds - last < HeightCalloutRepeatGate.MIN_REPEAT_SECONDS) {
      return false;
    }
    this.lastEnqueuedSeconds.set(word, this.elapsedSeconds);
    return true;
  }
}
