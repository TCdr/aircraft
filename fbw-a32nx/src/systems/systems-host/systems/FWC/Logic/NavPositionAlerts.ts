// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * NAV FM/GPS POS DISAGREE and NAV LS TUNING DISAGREE (A320 FCOM PRO-ABN-NAV).
 *
 * NAV FM/GPS POS DISAGREE (a320_fcom.txt l.92998-93030): "This alert triggers when the FM and GPS positions disagree."
 * The FMS computes the condition (fmgc navigation/FmPosition.ts, thresholds of DSC-22_20-20-20 l.12541-12553) and sends
 * it as L:A32NX_FM_GPS_POS_DISAGREE. It is an amber caution with MASTER CAUT and single chime (l.12550-12551), ECAM line
 * "A/C POS ... CHECK" (l.93030). Flight phase inhibition, read on the 2019 FCOM PDF (Docs/A320 Neo FCOM_1.pdf) page 5641:
 * inhibited in the phases 1, 3, 4, 8 and 10, and in phase 5 "(a) Alert inhibited only for the first 15 s in flight phase
 * 5" (l.93012).
 *
 * NAV LS TUNING DISAGREE (a320_fcom.txt l.93675-93704): "This alert triggers when the tuning of MMR 1 and MMR 2 are
 * different." Crew awareness; STATUS INOP SYS CAT 2. Flight phase inhibition, PDF page 5672: shown in the phases 6 and 7
 * only. The PDF page has no aural symbol (the FM/GPS POS DISAGREE page has the single chime one): level 1 caution.
 * Not modelled: the AP/FD effect (APPR mode arming inhibited or disarmed, l.93693-93696), which belongs to the FG.
 */

/** NAV FM/GPS POS DISAGREE flight phase inhibition (2019 FCOM PDF page 5641), phase 5 by FM_GPS_PHASE_5_INHIBITION_S */
export const FM_GPS_POS_DISAGREE_PHASE_INHIBITION = [1, 3, 4, 8, 10];

/** "Alert inhibited only for the first 15 s in flight phase 5" (a320_fcom.txt l.93012) */
export const FM_GPS_PHASE_5_INHIBITION_S = 15;

/** NAV LS TUNING DISAGREE flight phase inhibition (2019 FCOM PDF page 5672) */
export const LS_TUNING_DISAGREE_PHASE_INHIBITION = [1, 2, 3, 4, 5, 8, 9, 10];

/** NAV LS TUNING DISAGREE STATUS: INOP SYS CAT 2 (a320_fcom.txt l.93700-93704) */
export const LS_TUNING_DISAGREE_INOP_SYS = '340300009';

/**
 * Design choice, no FCOM value: the two MMRs must stay differently tuned for 3 s, so that the FMS tuning both receivers
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
