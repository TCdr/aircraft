// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * NAV FM/GPS POS DISAGREE and NAV LS TUNING DISAGREE.
 *
 * NAV FM/GPS POS DISAGREE: the FM and GPS positions disagree. The FMS computes the condition (fmgc
 * navigation/FmPosition.ts) and sends it as L:A32NX_FM_GPS_POS_DISAGREE. It is an amber caution with MASTER CAUT and
 * single chime, ECAM line "A/C POS ... CHECK". Inhibited in the phases 1, 3, 4, 8 and 10, and for the first 15 s of
 * phase 5.
 *
 * NAV LS TUNING DISAGREE: MMR 1 and MMR 2 are tuned differently. Crew awareness (level 1, no aural); STATUS INOP SYS
 * CAT 2. Shown in the phases 6 and 7 only.
 * Not modelled: the AP/FD effect (APPR mode arming inhibited or disarmed), which belongs to the FG.
 */

/** NAV FM/GPS POS DISAGREE flight phase inhibition, phase 5 by FM_GPS_PHASE_5_INHIBITION_S */
export const FM_GPS_POS_DISAGREE_PHASE_INHIBITION = [1, 3, 4, 8, 10];

/** The alert is inhibited only for the first 15 s of flight phase 5 */
const FM_GPS_PHASE_5_INHIBITION_S = 15;

export const LS_TUNING_DISAGREE_PHASE_INHIBITION = [1, 2, 3, 4, 5, 8, 9, 10];

/** NAV LS TUNING DISAGREE STATUS: INOP SYS CAT 2 */
export const LS_TUNING_DISAGREE_INOP_SYS = '340300009';

/**
 * Design choice: the two MMRs must stay differently tuned for 3 s, so that the FMS tuning both receivers
 * one after the other (two key events, applied by the sim in the next frames) cannot trigger the alert.
 */
export const LS_TUNING_DISAGREE_CONFIRM_S = 3;

/** Two ILS frequencies are the same when within 1 kHz (they are set in 50 kHz steps) */
const FREQUENCY_TOLERANCE_MHZ = 0.001;

/** Two ILS courses are the same when within 0.5 degrees (the MMR course is set in whole degrees) */
const COURSE_TOLERANCE_DEG = 0.5;

/** The NAV FM/GPS POS DISAGREE caution, with the phase 5 inhibition timer */
export class FmGpsPositionDisagreeAlert {
  private timeInPhase5 = 0;

  /**
   * @param disagree the FMS FM/GPS position disagree condition (L:A32NX_FM_GPS_POS_DISAGREE)
   * @param flightPhase the FWC flight phase
   * @param deltaTime the time since the last update, in seconds
   * @returns whether the caution is active (the other phases are inhibited by FM_GPS_POS_DISAGREE_PHASE_INHIBITION)
   */
  update(disagree: boolean, flightPhase: number, deltaTime: number): boolean {
    this.timeInPhase5 = flightPhase === 5 ? this.timeInPhase5 + deltaTime : 0;
    return disagree && !(flightPhase === 5 && this.timeInPhase5 < FM_GPS_PHASE_5_INHIBITION_S);
  }
}

/** The tuning of one MMR */
export interface MmrTuning {
  /** The ILS frequency, in MHz */
  frequency: number;
  /** The ILS course, in degrees */
  course: number;
}

/**
 * Whether the two MMRs are tuned differently (frequency or course).
 * @param mmr1 the tuning of MMR 1
 * @param mmr2 the tuning of MMR 2
 * @returns true when the frequencies or the courses differ
 */
export function isLsTuningDifferent(mmr1: MmrTuning, mmr2: MmrTuning): boolean {
  if (Math.abs(mmr1.frequency - mmr2.frequency) > FREQUENCY_TOLERANCE_MHZ) {
    return true;
  }
  const courseDifference = Math.abs(((mmr1.course - mmr2.course + 540) % 360) - 180);
  return courseDifference > COURSE_TOLERANCE_DEG;
}

/** The NAV LS TUNING DISAGREE caution condition, confirmed for LS_TUNING_DISAGREE_CONFIRM_S */
export class LsTuningDisagreeMonitor {
  /** How long the two MMRs have been tuned differently, in seconds */
  private differentFor = 0;

  /**
   * @param mmr1 the tuning of MMR 1
   * @param mmr2 the tuning of MMR 2
   * @param deltaTime the time since the last update, in seconds
   * @returns whether the caution condition is active
   */
  update(mmr1: MmrTuning, mmr2: MmrTuning, deltaTime: number): boolean {
    this.differentFor = isLsTuningDifferent(mmr1, mmr2) ? this.differentFor + deltaTime : 0;
    return this.differentFor >= LS_TUNING_DISAGREE_CONFIRM_S;
  }
}
