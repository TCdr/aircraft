// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The data of one GPS receiver for the GPS MONITOR page: null for a word that is not in normal operation */
export interface GpsReceiverReading {
  /** GPS_n_MODE: 0 off, 1 INIT, 2 ACQ, 3 NAV, 4 FAULT, 5 TEST, 6 ALTAID, 7 AIDED, 8 DIFF */
  mode: number;
  satellites: number | null;
  /** Horizontal figure of merit, in feet */
  figureOfMerit: number | null;
  trueTrack: number | null;
  groundSpeed: number | null;
  altitude: number | null;
  /** Whether at least one ADIRU uses this receiver */
  selected: boolean;
}

/** The texts of the receiver mode, by GPS_n_MODE */
const MODE_TEXTS = ['', 'INIT', 'ACQ', 'NAV', 'FAULT', 'TEST', 'ALTAID', 'AIDED', 'DIFF'];

/** The modes in which the receiver computes a position: NAV, the degraded modes ALTAID and AIDED, and DIFF */
const NAVIGATION_MODES = [3, 6, 7, 8];

export interface GpsMonitorFields {
  /** Whether the position, track, speed, figure of merit and altitude can be shown (else dashes) */
  dataShown: boolean;
  trueTrack: string;
  groundSpeed: string;
  merit: string;
  modeSatellites: string;
  altitude: string;
}

/**
 * The fields of one receiver on the MCDU GPS MONITOR page (A320 FCOM DSC-22_20-50-10-28): TTRK, GS, MERIT (figure of
 * merit), MODE/SAT (the mode and the number of satellites tracked), GPS ALT. The data is dashed while the receiver is not
 * in NAV (or a degraded mode, ALTAID or AIDED), and for a receiver that no ADIRU has selected ("the data of the GPS that is not selected is dashed on the GPS
 * MONITOR page").
 */
export function gpsMonitorFields(reading: GpsReceiverReading): GpsMonitorFields {
  const navigating = NAVIGATION_MODES.includes(reading.mode);
  const dataShown = reading.selected && navigating;
  const show = (value: number | null, text: (v: number) => string, dashes: string) =>
    dataShown && value !== null ? text(value) : dashes;
  const modeText = MODE_TEXTS[reading.mode] ?? '';
  const satellites = reading.mode === 2 || navigating ? reading.satellites : null;
  return {
    dataShown,
    trueTrack: show(reading.trueTrack, (v) => `${Math.round(v) % 360}`.padStart(3, '0'), '---'),
    groundSpeed: show(reading.groundSpeed, (v) => `${Math.round(v)}`, '---'),
    merit: show(reading.figureOfMerit, (v) => `${Math.round(v)}FT`, '---FT'),
    modeSatellites: satellites !== null ? `${modeText}/${Math.round(satellites)}` : modeText,
    altitude: show(reading.altitude, (v) => `${Math.round(v)}`, '-----'),
  };
}
