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

interface AxisSimVars {
  glsValid: string;
  glsDeviation: string;
  ilsValid: string;
  ilsDeviation: string;
}

const GLIDE_SLOPE_SIMVARS: AxisSimVars = {
  glsValid: 'L:A32NX_GLS_1_GS_IS_VALID',
  glsDeviation: 'L:A32NX_GLS_GS_DEVIATION',
  ilsValid: 'L:A32NX_RADIO_RECEIVER_GS_IS_VALID',
  ilsDeviation: 'L:A32NX_RADIO_RECEIVER_GS_DEVIATION',
};

const LOCALIZER_SIMVARS: AxisSimVars = {
  glsValid: 'L:A32NX_GLS_1_LOC_IS_VALID',
  glsDeviation: 'L:A32NX_GLS_LOC_DEVIATION',
  ilsValid: 'L:A32NX_RADIO_RECEIVER_LOC_IS_VALID',
  ilsDeviation: 'L:A32NX_RADIO_RECEIVER_LOC_DEVIATION',
};

/**
 * The landing system data of MMR 1 for the systems that follow it (TAWS, FWC): the GLS while the MMR is set to a GLS
 * channel, received or not, else its ILS. The ILS receiver of an MMR in GLS mode is detuned, so its values must never
 * be used there.
 * Design choice: MMR 1 on both sides of the aircraft, as for the ILS; these systems have no receiver per side.
 */
export class MmrOneLandingSystem {
  // The readers run every frame in flight, so each axis keeps one result and nothing is left to the garbage collector
  private readonly glideSlopeAxis: MmrAxis = { valid: false, deviation: 0 };

  private readonly localizerAxis: MmrAxis = { valid: false, deviation: 0 };

  constructor(private readonly read: MmrNumberReader) {}

  /** @returns the present glide slope; the next call refreshes the same object */
  glideSlope(): MmrAxis {
    return this.refresh(this.glideSlopeAxis, GLIDE_SLOPE_SIMVARS);
  }

  /** @returns the present localizer; the next call refreshes the same object */
  localizer(): MmrAxis {
    return this.refresh(this.localizerAxis, LOCALIZER_SIMVARS);
  }

  private refresh(axis: MmrAxis, names: AxisSimVars): MmrAxis {
    const inGlsMode = this.read('L:A32NX_MMR_1_GLS_CHANNEL') > 0;
    axis.valid = this.read(inGlsMode ? names.glsValid : names.ilsValid) > 0;
    axis.deviation = this.read(inGlsMode ? names.glsDeviation : names.ilsDeviation);
    return axis;
  }
}
