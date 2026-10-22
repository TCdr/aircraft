// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The REV 2(3) indication of the thrust gauge. Green: on ground, the reverse mode is selected. Amber: on ground, the
 * thrust reverser lever is in the REV detent and the reverse mode is not available; in flight, the thrust reverser is
 * unlocked, and the indication pulses for 9 s, then stays steady.
 *
 * Design choices:
 * - The reverse mode is selected and available when the reverser is fully deployed (L:A32NX_REVERSER_n_DEPLOYED).
 *   While it deploys or stows (L:A32NX_REVERSER_n_DEPLOYING, also set for an unlocked reverser) it is not available.
 * - The REV detent is L:A32NX_AUTOTHRUST_REVERSE:n, read only for the engines with a thrust reverser (2 and 3).
 * - Unlocked in flight is DEPLOYING or DEPLOYED; the 9 s start when it unlocks, and an unlock later pulses again.
 */

const REV_FLIGHT_PULSE_DURATION_S = 9;

export type RevDisplay = 'hidden' | 'green' | 'amber' | 'amberPulse';

export interface RevInputs {
  /** L:A32NX_REVERSER_n_DEPLOYING */
  inTransit: boolean;
  /** L:A32NX_REVERSER_n_DEPLOYED */
  deployed: boolean;
  /** the thrust reverser lever is in the REV detent (L:A32NX_AUTOTHRUST_REVERSE:n), engines 2 and 3 only */
  reverseSelected: boolean;
  onGround: boolean;
}

/** The REV indication of one engine */
export class RevIndication {
  private unlockedInFlight = false;

  private pulseRemainingS = 0;

  /**
   * @param deltaS the time since the last update, in seconds
   * @param inputs the reverser, its lever and the gear
   * @returns how REV shows
   */
  public update(deltaS: number, inputs: RevInputs): RevDisplay {
    const unlocked = inputs.inTransit || inputs.deployed;
    if (!unlocked || inputs.onGround) {
      this.unlockedInFlight = false;
      this.pulseRemainingS = 0;
      if (inputs.onGround && inputs.deployed) {
        return 'green';
      }
      return inputs.onGround && (inputs.inTransit || inputs.reverseSelected) ? 'amber' : 'hidden';
    }

    if (this.unlockedInFlight) {
      this.pulseRemainingS = Math.max(0, this.pulseRemainingS - deltaS);
    } else {
      this.unlockedInFlight = true;
      this.pulseRemainingS = REV_FLIGHT_PULSE_DURATION_S;
    }
    return this.pulseRemainingS > 0 ? 'amberPulse' : 'amber';
  }
}
