// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FwcFlightPhase } from './FwsFlightPhases';

/*
 * The PITCH PITCH synthetic voice of the A380 FWS (pitch attitude alert).
 * - a380_fcom.txt l.9046-9049 (DSC-22-27-20 PITCH ATTITUDE ALERT): "During landing, if the pitch attitude is excessive
 *   close to the ground, an aural alert "PITCH PITCH" is triggered."
 * - l.9051-9054: "The pitch attitude aural alert is available during manual landings, below 400 ft RA. It is triggered
 *   when the pitch attitude is above 12 deg (i.e. maximum achievable geometrical angle on ground, with the landing gear
 *   compressed)."
 * - l.73618-73619 (DSC-31-40-20 audio indicators): Pitch (Synthetic voice), "Sounds 2 times": one clip, PITCH said
 *   twice.
 *
 * In the aircraft the PRIMs send the alert to the FWS; the A380X PRIM model leaves its pitch_pitch_warning_active
 * output at false (A380PrimComputerFe.cpp), so the FWS computes the FCOM condition itself.
 *
 * Design choices:
 * - "During landing" / "manual landings": the landing flight phases (8 from 1500 ft to 800 ft, 9 below 800 ft, 10
 *   touchdown) with no autopilot engaged; not the takeoff phases.
 * - The voice is said once each time the condition starts (the FCOM gives one "Sounds 2 times" per alert, no repeat).
 */

/** The alert is available below this radio height, feet (a380_fcom.txt l.9052) */
export const PITCH_AURAL_MAX_RADIO_HEIGHT_FT = 400;

/** The alert is triggered above this pitch attitude, degrees nose up (a380_fcom.txt l.9053) */
export const PITCH_AURAL_ATTITUDE_DEG = 12;

/** The landing flight phases, see the design choices above */
const LANDING_FLIGHT_PHASES: readonly number[] = [
  FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
  FwcFlightPhase.AtOrBelow800Feet,
  FwcFlightPhase.TouchDown,
];

export interface PitchAuralInputs {
  /** The pitch attitude, degrees nose up, null when no IR gives it */
  pitchDeg: number | null;
  /** The radio height, feet, null when no radio altimeter gives it */
  radioHeightFt: number | null;
  /** An autopilot is engaged */
  autopilotEngaged: boolean;
  /** The FWS flight phase */
  flightPhase: number;
}

/**
 * @param inputs the aircraft state
 * @returns whether the pitch attitude is excessive close to the ground in a manual landing (a380_fcom.txt l.9046-9054)
 */
export function isPitchAttitudeExcessive(inputs: PitchAuralInputs): boolean {
  return (
    inputs.pitchDeg !== null &&
    inputs.radioHeightFt !== null &&
    !inputs.autopilotEngaged &&
    LANDING_FLIGHT_PHASES.includes(inputs.flightPhase) &&
    inputs.radioHeightFt < PITCH_AURAL_MAX_RADIO_HEIGHT_FT &&
    inputs.pitchDeg > PITCH_AURAL_ATTITUDE_DEG
  );
}

export class FwsPitchAural {
  private excessivePreviously = false;

  /**
   * @param inputs the aircraft state
   * @returns true when the PITCH PITCH voice is to be said now
   */
  public update(inputs: PitchAuralInputs): boolean {
    const excessive = isPitchAttitudeExcessive(inputs);
    const trigger = excessive && !this.excessivePreviously;
    this.excessivePreviously = excessive;
    return trigger;
  }
}
