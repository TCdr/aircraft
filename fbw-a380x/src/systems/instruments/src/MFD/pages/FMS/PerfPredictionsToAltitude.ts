// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { PerfToAltPrediction } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';

/**
 * The time and distance predictions of the PERF page CLB and DES speed tables (A380 FCOM DSC-22-FMS-20-30, PERF page
 * CLB tab, a380_fcom.txt l.38020-38021: "The FMS computes the time and distance predictions from the aircraft present
 * position to reach the reference altitude, displayed in this entry field."; MANAGED, l.38076-38077: "Indicates the
 * managed speed target for the CLB phase and its associated time and distance predictions to reach the entered
 * reference altitude."; DES tab, l.38713-38715: the same for the DES phase, "The flight crew can only use this field when the DES phase is
 * active.").
 */

/** The predictions of the vertical profile the speed table line is flown with */
export interface PredictionsToAltitudeProfile {
  readonly isReadyToDisplay: boolean;
  computeClimbPredictionToAltitude(altitude: number): PerfToAltPrediction | undefined;
  computeDescentPredictionToAltitude(altitude: number): PerfToAltPrediction | undefined;
}

/** The time and distance of a speed table line without predictions */
export const NO_PREDICTION_TO_ALTITUDE = '--:--   ----';

/**
 * The time and distance from the present position to the predictions reference altitude, as the PERF speed table shows
 * them: the time (see formatTime), then the distance in NM, right aligned under the dashes of the placeholder.
 * @param profile the vertical profile of the active speed mode
 * @param referenceAltitude the predictions reference altitude (PRED TO), feet, or null when there is none
 * @param climb true for the CLB tab, false for the DES tab
 * @param formatTime formats the seconds from now to the reference altitude (UTC in flight)
 */
export function predictionToAltitudeText(
  profile: PredictionsToAltitudeProfile | undefined,
  referenceAltitude: number | null,
  climb: boolean,
  formatTime: (secondsFromPresent: number) => string,
): string {
  if (!profile?.isReadyToDisplay || referenceAltitude === null) {
    return NO_PREDICTION_TO_ALTITUDE;
  }
  const prediction = climb
    ? profile.computeClimbPredictionToAltitude(referenceAltitude)
    : profile.computeDescentPredictionToAltitude(referenceAltitude);
  if (
    !prediction ||
    !Number.isFinite(prediction.secondsFromPresent) ||
    !Number.isFinite(prediction.distanceFromStart)
  ) {
    return NO_PREDICTION_TO_ALTITUDE;
  }
  const distance = Math.max(0, prediction.distanceFromStart).toFixed(0);
  return `${formatTime(prediction.secondsFromPresent)}${distance.padStart(NO_PREDICTION_TO_ALTITUDE.length - 5, ' ')}`;
}
