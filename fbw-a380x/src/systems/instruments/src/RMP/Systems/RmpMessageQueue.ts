// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The active RMP messages of one RMP.
 *
 * A380 FCOM DSC-23-20 RMP MESSAGES (a380_fcom.txt l.49321-49324): "If several messages are displayed one after the
 * other without being cleared, the active messages are stored in a queue, in their order of appearance (the RMP displays
 * the most recent message). The flight crew must check, and clear the active messages, one by one, in order to cancel
 * the queue."
 */
export class RmpMessageQueue {
  /** The active messages, oldest first: the last one is displayed. */
  private readonly messages: string[] = [];

  /**
   * Adds a message as the most recent one. A message that is already active moves to the top, so that it is shown and
   * stored only once.
   * @param message the message text
   */
  public add(message: string): void {
    if (message.length === 0) {
      return;
    }
    this.remove(message);
    this.messages.push(message);
  }

  /** MSG CLR key: clears the displayed (most recent) message, the previous active message is then displayed. */
  public clearDisplayed(): void {
    this.messages.pop();
  }

  /**
   * Removes a message wherever it is in the queue, when its condition no longer exists (e.g. TRANSMITTING IDENT).
   * @param message the message text
   */
  public remove(message: string): void {
    const index = this.messages.indexOf(message);
    if (index >= 0) {
      this.messages.splice(index, 1);
    }
  }

  /**
   * The displayed message.
   * @returns the most recent active message, null when no message is active (the RMP then shows the squawk,
   * l.49315-49316)
   */
  public get displayed(): string | null {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  /**
   * The number of active messages.
   * @returns the queue length
   */
  public get length(): number {
    return this.messages.length;
  }
}
