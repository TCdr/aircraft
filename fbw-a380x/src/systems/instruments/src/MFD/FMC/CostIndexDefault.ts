// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Default cost index: when the crew has not entered a cost index before the ZFW, the FMS sets the last cost index of
 * the previous flight, stored in the DONE phase, or 0 after a power up (message COST INDEX-NNN IN USE).
 */
export class CostIndexDefault {
  private storedCostIndex = 0;

  /** Stores the cost index of the flight that reaches the DONE phase */
  storeAtDone(costIndex: number | null): void {
    if (costIndex !== null) {
      this.storedCostIndex = costIndex;
    }
  }

  /** @returns the cost index the FMS sets, or null when the crew entered one */
  defaultFor(enteredCostIndex: number | null): number | null {
    return enteredCostIndex === null ? this.storedCostIndex : null;
  }
}
