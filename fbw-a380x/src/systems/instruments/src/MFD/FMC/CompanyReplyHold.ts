// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CompanyDatalinkDelay } from '@flybywiresim/fbw-sdk';

/**
 * Holds the answers of the company ground station until the datalink reply time of their request has passed (flyPad
 * Settings > Realism, CompanyDatalinkDelay): the ground station (SimBrief) answers within seconds, the airline
 * operations centre of a real aircraft does not. One pending request per key (the flight plan index).
 */
export class CompanyReplyHold {
  private readonly notBefore = new Map<number, number>();

  /** A request was sent for this key: its answer is held until `nowMs + replyDelayMs` */
  public requested(key: number, nowMs = Date.now(), replyDelayMs = CompanyDatalinkDelay.replyDelayMs()): void {
    this.notBefore.set(key, nowMs + replyDelayMs);
  }

  /** Resolves when the answer to the request of this key may be delivered */
  public async whenDeliverable(key: number): Promise<void> {
    const notBefore = this.notBefore.get(key) ?? null;
    this.notBefore.delete(key);
    await CompanyDatalinkDelay.waitForDelivery(notBefore);
  }
}
