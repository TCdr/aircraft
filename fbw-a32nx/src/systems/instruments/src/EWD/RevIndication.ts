// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The REV indication of the N1 gauge: green on ground with the thrust reverser fully deployed, amber when the thrust
 * reverser is unlocked. In flight the amber REV pulses for 9 s, then stays steady.
 *
 * Design choices:
 * - Unlocked is L:A32NX_REVERSER_n_DEPLOYING (doors unlocked or in transit) or L:A32NX_REVERSER_n_DEPLOYED; a reverser
 *   fully deployed in flight is unlocked, so it is amber.
 * - The 9 s start when the reverser is unlocked in flight; a reverser that unlocks again later pulses again.
 */

const REV_FLIGHT_PULSE_DURATION_S = 9;

export type RevDisplay = 'hidden' | 'green' | 'amber' | 'amberPulse';

export interface RevInputs {
  /** L:A32NX_REVERSER_n_DEPLOYING */
  inTransit: boolean;
  /** L:A32NX_REVERSER_n_DEPLOYED */
  deployed: boolean;
  onGround: boolean;
}

/** The REV indication of one engine */
export class RevIndication {
  private unlockedInFlight = false;

  private pulseRemainingS = 0;

  /**
   * @param deltaS the time since the last update, in seconds
   * @param inputs the reverser and the gear
   * @returns how REV shows
   */
  public update(deltaS: number, inputs: RevInputs): RevDisplay {
    const unlocked = inputs.inTransit || inputs.deployed;
    if (!unlocked || inputs.onGround) {
      this.unlockedInFlight = false;
      this.pulseRemainingS = 0;
      if (!unlocked) {
        return 'hidden';
      }
      return inputs.deployed ? 'green' : 'amber';
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
