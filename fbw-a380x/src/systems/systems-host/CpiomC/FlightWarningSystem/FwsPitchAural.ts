// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FwcFlightPhase } from './FwsFlightPhases';

/*
 * The PITCH PITCH synthetic voice of the A380 FWS (pitch attitude alert): in a manual landing below 400 ft RA, a pitch
 * attitude above 12 deg (the largest angle reachable on ground with the landing gear compressed) triggers the voice.
 * One clip says PITCH twice.
 *
 * In the aircraft the PRIMs send the alert to the FWS; the A380X PRIM model leaves its pitch_pitch_warning_active
 * output at false (A380PrimComputerFe.cpp), so the FWS computes the condition itself.
 *
 * Design choices:
 * - "Landing": the landing flight phases (8 from 1500 ft to 800 ft, 9 below 800 ft, 10 touchdown) with no autopilot
 *   engaged; not the takeoff phases.
 * - The voice is said once each time the condition starts, with no repeat.
 */

/** The alert is available below this radio height, feet */
const PITCH_AURAL_MAX_RADIO_HEIGHT_FT = 400;

/** The alert is triggered above this pitch attitude, degrees nose up */
const PITCH_AURAL_ATTITUDE_DEG = 12;

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
  autopilotEngaged: boolean;
  flightPhase: number;
}

/**
 * @param inputs the aircraft state
 * @returns whether the pitch attitude is excessive close to the ground in a manual landing
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
