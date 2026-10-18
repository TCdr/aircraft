// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Design choice: the rate is measured over the last minute rather than taken from the refuel rate setting, because
 * the rate differs per aircraft, per tank (the A32NX centre tank fills slower) and per setting.
 */
const WINDOW_MS = 60_000;
/** Shorter spans give a jumpy rate from the first few fuel quantity updates */
const MIN_SPAN_MS = 5_000;

/** The time left of a refuelling, from the fuel quantity measured over the last minute */
export class RefuelTimeLeft {
  private samples: { timeMs: number; fuelKg: number }[] = [];

  update(timeMs: number, fuelKg: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && timeMs <= last.timeMs) {
      return;
    }
    this.samples.push({ timeMs, fuelKg });
    while (this.samples.length > 2 && timeMs - this.samples[1].timeMs >= WINDOW_MS) {
      this.samples.shift();
    }
  }

  reset(): void {
    this.samples = [];
  }

  /**
   * @returns the whole minutes left, rounded up; null before a rate is measured, while no fuel comes in, or once the
   * target is reached
   */
  minutesLeft(nowKg: number, targetKg: number): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || last.timeMs - first.timeMs < MIN_SPAN_MS || nowKg >= targetKg) {
      return null;
    }
    const kgPerMs = (last.fuelKg - first.fuelKg) / (last.timeMs - first.timeMs);
    if (kgPerMs <= 0) {
      return null;
    }
    return Math.ceil((targetKg - nowKg) / kgPerMs / 60_000);
  }
}
