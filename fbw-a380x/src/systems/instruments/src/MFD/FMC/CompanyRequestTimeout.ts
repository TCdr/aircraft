// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The 4 min limit of a company request: NO COMPANY REPLY when no answer comes within 4 min after the request. One
 * pending request per key (the flight plan index): `settle` takes the answer when it arrives in time, `onTimeout` runs
 * when it does not.
 */
export class CompanyRequestTimeout {
  /** NO COMPANY REPLY 4 min after the request */
  public static readonly REPLY_TIMEOUT_MS = 4 * 60_000;

  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  /** A request was sent for this key: `onTimeout` runs if it is not settled within 4 min */
  public start(key: number, onTimeout: () => void): void {
    this.cancel(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        onTimeout();
      }, CompanyRequestTimeout.REPLY_TIMEOUT_MS),
    );
  }

  /**
   * The answer to the request of this key arrived.
   * @returns true if the request was still waiting (the answer is taken), false if it had timed out already
   */
  public settle(key: number): boolean {
    const pending = this.timers.has(key);
    this.cancel(key);
    return pending;
  }

  private cancel(key: number): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }
}
