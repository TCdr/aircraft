// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The active RMP messages of one RMP: messages shown one after the other without being cleared queue up in their
 * order of appearance, the RMP displays the most recent one, and the flight crew clears them one by one.
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
   * @returns the most recent active message, null when no message is active (the RMP then shows the squawk)
   */
  public get displayed(): string | null {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  public get length(): number {
    return this.messages.length;
  }
}
