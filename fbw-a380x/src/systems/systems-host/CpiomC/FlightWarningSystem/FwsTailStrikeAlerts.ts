// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * TAIL STRIKE and TAIL STRIKE DET FAULT:
 * - TAIL STRIKE: the tail strike detector senses a contact of the rear fuselage with the ground; master caution with
 *   single chime, LAND ANSA as a limitation on the ECAM for all phases.
 * - TAIL STRIKE DET FAULT: the tail strike detector is failed; crew awareness, INOP SYS APPR & LDG TAIL STRIKE DET.
 *
 * Design choice (the detector model): the simulation has no fuselage contact sensor, so the contact comes from the
 * aircraft geometry limit: the tail strikes at 11.5 deg pitch attitude with the main landing gear compressed (the pitch
 * synthetic voice uses 12 deg, the largest angle reachable on ground with the gear compressed). A pitch attitude at or
 * above 11.5 deg with a main gear compressed is a contact. The 13.5 deg limit with the gear extended is not used: the
 * LGCIU tells only compressed or not, not the oleo extension at lift-off.
 * A detected contact is memorised (the alert is shown in the phases after the event: 7, 8 and 11) until the FWS flight
 * phase returns to 1 (ELEC PWR) for the next flight. A failed detector detects nothing.
 */

/** The tail strike pitch attitude with the main landing gear compressed, degrees */
const TAIL_STRIKE_PITCH_COMPRESSED_GEAR_DEGREES = 11.5;

export const TAIL_STRIKE_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 9, 10, 12];

export const TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export interface TailStrikeInputs {
  /** The pitch attitude from the IRs in degrees, or null when no IR gives a valid pitch */
  pitchDegrees: number | null;
  /** A main landing gear is compressed (LGCIU) */
  mainGearCompressed: boolean;
  detectorFailed: boolean;
  /** The FWS flight phase, 1 to 12 */
  flightPhase: number;
}

export interface TailStrikeState {
  /** TAIL STRIKE: a contact was detected during this flight */
  tailStrike: boolean;
  detectorFault: boolean;
}

/** The tail strike detector and the memory of a detected contact */
export class TailStrikeDetector {
  private contactMemorised = false;

  /**
   * Updates the detector with this cycle's data.
   * @param inputs the pitch attitude, the gear state, the detector failure and the flight phase
   * @returns the TAIL STRIKE and TAIL STRIKE DET FAULT states
   */
  public update(inputs: TailStrikeInputs): TailStrikeState {
    if (inputs.flightPhase === 1) {
      this.contactMemorised = false;
    }

    const contact =
      !inputs.detectorFailed &&
      inputs.mainGearCompressed &&
      inputs.pitchDegrees !== null &&
      inputs.pitchDegrees >= TAIL_STRIKE_PITCH_COMPRESSED_GEAR_DEGREES;
    if (contact) {
      this.contactMemorised = true;
    }

    return { tailStrike: this.contactMemorised, detectorFault: inputs.detectorFailed };
  }
}

/** One IR pitch word as the FWS reads it (Arinc429Register) */
export interface PitchWord {
  isNormalOperation(): boolean;
  readonly value: number;
}

/**
 * The pitch attitude of the first IR (1, 2, 3) with a valid pitch.
 * @param irPitches the pitch words of IR 1, 2 and 3
 * @returns the pitch in degrees, or null
 */
export function firstValidPitch(irPitches: PitchWord[]): number | null {
  const valid = irPitches.find((word) => word.isNormalOperation());
  return valid ? valid.value : null;
}
