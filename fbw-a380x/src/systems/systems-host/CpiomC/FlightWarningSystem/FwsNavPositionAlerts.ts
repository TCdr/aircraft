// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

/*
 * NAV FM / GPS POS DISAGREE and NAV LS TUNING DISAGREE of the FWS.
 *
 * NAV FM / GPS POS DISAGREE: the FMS and GPS positions differ by more than a latitude-dependent threshold. The FMS
 * computes the condition (fmgc navigation/FmPosition.ts, A380_FM_POSITION_CONFIG) and sends it as
 * L:A32NX_FM_GPS_POS_DISAGREE. Single chime and MASTER CAUT; ACFT POS ... CHECK; STATUS INFO FLS : RAW ONLY.
 *
 * NAV LS TUNING DISAGREE: the two MMRs differ in approach mode (ILS, FLS, ILS/FLS or GLS), frequency/channel or course.
 * The MMRs are the sim NAV 3 and NAV 4 receivers, which have no approach mode: the frequency and the course are
 * compared. Single chime and MASTER CAUT, shown in the phases 8 and 9 only. Crew awareness; STATUS INOP SYS APPR & LDG:
 * CAT 2, GLS AUTOLAND.
 */

export const FM_GPS_POS_DISAGREE_PHASE_INHIBITION = [1, 3, 4, 5, 6, 12];

export const LS_TUNING_DISAGREE_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/** STATUS of NAV FM / GPS POS DISAGREE: INFO FLS : RAW ONLY (EcamInfos) */
export const FM_GPS_POS_DISAGREE_INFO = '340200021';

/** STATUS of NAV LS TUNING DISAGREE: INOP SYS APPR & LDG CAT 2, GLS AUTOLAND (EcamInopSys) */
export const LS_TUNING_DISAGREE_INOP_SYS_APPR_LDG = ['220300027', '220300010'];

/**
 * Design choice, no aircraft value: the two MMRs must stay differently tuned for 3 s, so that the FMS tuning both
 * receivers one after the other (two key events, applied by the sim in the next frames) cannot trigger the alert.
 */
export const LS_TUNING_DISAGREE_CONFIRM_S = 3;

/** Two ILS frequencies are the same when within 1 kHz (they are set in 50 kHz steps) */
const FREQUENCY_TOLERANCE_MHZ = 0.001;

/** Two ILS courses are the same when within 0.5 degrees (the MMR course is set in whole degrees) */
const COURSE_TOLERANCE_DEG = 0.5;

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

/** The NAV FM / GPS POS DISAGREE and NAV LS TUNING DISAGREE conditions. One instance in FwsCore. */
export class FwsNavPositionAlerts {
  public readonly fmGpsPosDisagree = Subject.create(false);

  public readonly lsTuningDisagree = Subject.create(false);

  /** How long the two MMRs have been tuned differently, in seconds */
  private lsTuningDifferentFor = 0;

  /**
   * @param deltaTime the time since the last update, in seconds
   * @param fmGpsDisagree the FMS FM/GPS position disagree condition (L:A32NX_FM_GPS_POS_DISAGREE)
   * @param mmr1 the tuning of MMR 1
   * @param mmr2 the tuning of MMR 2
   */
  public update(deltaTime: number, fmGpsDisagree: boolean, mmr1: MmrTuning, mmr2: MmrTuning): void {
    this.fmGpsPosDisagree.set(fmGpsDisagree);
    this.lsTuningDifferentFor = isLsTuningDifferent(mmr1, mmr2) ? this.lsTuningDifferentFor + deltaTime : 0;
    this.lsTuningDisagree.set(this.lsTuningDifferentFor >= LS_TUNING_DISAGREE_CONFIRM_S);
  }
}
