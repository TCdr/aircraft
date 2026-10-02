// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The data of one GPS receiver (MMR outputs): null for a word that is not in normal operation */
export interface GpsReceiverOutputs {
  /** GPS_n_MODE: 0 off, 1 INIT, 2 ACQ, 3 NAV, 4 FAULT, 5 TEST, 6 ALTAID, 7 AIDED, 8 DIFF */
  mode: number;
  satellites: number | null;
  /** Horizontal figure of merit, in feet */
  figureOfMerit: number | null;
  trueTrack: number | null;
  altitude: number | null;
  groundSpeed: number | null;
}

/** The texts of one receiver on the POSITION / GPS page, the position aside */
export interface GpsReceiverTexts {
  /** Whether the position and the other data can be shown (the receiver in NAV, ALTAID, AIDED or DIFF) */
  navigating: boolean;
  mode: string;
  satellites: string;
  accuracy: string;
  track: string;
  altitude: string;
  groundSpeed: string;
}

const MODE_TEXTS = ['----', 'INIT', 'ACQ', 'NAV', 'FAULT', 'TEST', 'ALTAID', 'AIDED', 'DIFF'];

/** The modes in which the receiver computes a position: NAV, the degraded modes ALTAID and AIDED, and DIFF */
const NAVIGATION_MODES = [3, 6, 7, 8];

/**
 * The values of one receiver on the POSITION / GPS page (A380 FCOM DSC-22-FMS-20-30): the mode, the number of
 * satellites (while acquiring and navigating), and the accuracy (HFOM, in FT as on the FCOM figure), true track,
 * altitude and ground speed while the receiver computes a position (NAV, ALTAID, AIDED, DIFF); dashes otherwise.
 */
export function gpsReceiverTexts(outputs: GpsReceiverOutputs): GpsReceiverTexts {
  const navigating = NAVIGATION_MODES.includes(outputs.mode);
  const show = (value: number | null, text: (v: number) => string, dashes: string) =>
    navigating && value !== null ? text(value) : dashes;
  const tracking = outputs.mode === 2 || navigating;
  return {
    navigating,
    mode: MODE_TEXTS[outputs.mode] ?? '----',
    satellites: tracking && outputs.satellites !== null ? outputs.satellites.toFixed(0) : '--',
    accuracy: show(outputs.figureOfMerit, (v) => Math.round(v).toFixed(0), '---'),
    track: show(outputs.trueTrack, (v) => (Math.round(v * 10) / 10).toFixed(1), '---.-'),
    altitude: show(outputs.altitude, (v) => Math.round(v).toFixed(0), '-----'),
    groundSpeed: show(outputs.groundSpeed, (v) => Math.round(v).toFixed(0), '---'),
  };
}
