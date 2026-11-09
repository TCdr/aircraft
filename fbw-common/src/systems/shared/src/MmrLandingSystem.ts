// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** One axis of the landing system as an MMR outputs it */
export interface MmrAxis {
  valid: boolean;
  /** degrees, positive: beam to the right (localizer) or aircraft above the beam (glide slope) */
  deviation: number;
}

/** Reads a number SimVar by its full name, for example `L:A32NX_MMR_1_GLS_CHANNEL` */
export type MmrNumberReader = (name: string) => number;

/**
 * The landing system data of MMR 1 for the systems that follow it (TAWS, FWC): the GLS while the MMR is set to a GLS
 * channel, received or not, else its ILS. The ILS receiver of an MMR in GLS mode is detuned, so its values must never
 * be used there.
 * Design choice: MMR 1 on both sides of the aircraft, as for the ILS; these systems have no receiver per side.
 */
export class MmrOneLandingSystem {
  constructor(private readonly read: MmrNumberReader) {}

  glideSlope(): MmrAxis {
    return this.axis('GS');
  }

  localizer(): MmrAxis {
    return this.axis('LOC');
  }

  private axis(axisName: 'GS' | 'LOC'): MmrAxis {
    if (this.read('L:A32NX_MMR_1_GLS_CHANNEL') > 0) {
      return {
        valid: this.read(`L:A32NX_GLS_1_${axisName}_IS_VALID`) > 0,
        deviation: this.read(`L:A32NX_GLS_${axisName}_DEVIATION`),
      };
    }
    return {
      valid: this.read(`L:A32NX_RADIO_RECEIVER_${axisName}_IS_VALID`) > 0,
      deviation: this.read(`L:A32NX_RADIO_RECEIVER_${axisName}_DEVIATION`),
    };
  }
}
