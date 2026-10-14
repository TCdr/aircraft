// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Lower SD permanent data, G LOAD - ALT SEL area: A320 FCOM DSC-31-20, a320_fcom.txt l.46264-46277.
 * l.46271-46272: "Altitude in green selected via the Flight Control Unit (FCU), if the flight crew selects metric
 * units, and provided the load factor is not displayed."
 * The CHECK CAPT (F/O) PFD / ND / CHECK SD feedback messages of the same area (l.46273-46276) come from the DMC
 * monitoring of the DU pictures (DSC-31-05-60 l.45379-45385), which the sim does not have.
 */

/** Feet to metres */
const METRES_PER_FOOT = 0.3048;

/** Inputs of the metric FCU selected altitude */
export interface MetricAltSelInputs {
  /** METRIC ALT is selected on the FCU (FCU discrete word 1 bit 20), null when the FCU word is not valid */
  metricAltSelected: boolean | null;
  /** the FCU selected altitude in feet, null when not valid */
  selectedAltitudeFt: number | null;
  /** the amber G LOAD indication is displayed (l.46267-46270) */
  gLoadShown: boolean;
}

/**
 * The FCU selected altitude in metres shown in the G LOAD - ALT SEL area, or null when it is not shown.
 * Rounded to 10 m like the metric target altitude of the PFD (AltitudeIndicator MetricAltIndicator).
 * @param i the inputs
 * @returns the altitude in metres, or null
 */
export function metricAltSelMetres(i: MetricAltSelInputs): number | null {
  if (i.metricAltSelected !== true || i.selectedAltitudeFt === null || i.gLoadShown) {
    return null;
  }
  return Math.round((i.selectedAltitudeFt * METRES_PER_FOOT) / 10) * 10;
}
