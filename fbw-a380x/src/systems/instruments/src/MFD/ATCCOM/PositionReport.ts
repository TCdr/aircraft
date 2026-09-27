// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CpdlcMessageElement, CpdlcMessagesDownlink, PositionReportData } from '@datalink/common';

/**
 * The position report of the REPORT/AUTO & MANUAL POSITION page (A380 FCOM DSC-46-10-20-30 P 17-21): the fields, their
 * completion with the FMS data, and the message.
 */
export interface PositionReportValues {
  ovhd: string | null;
  ovhdUtc: string | null;
  ovhdAlt: string | null;
  ppos: string | null;
  pposUtc: string | null;
  pposAlt: string | null;
  to: string | null;
  toUtc: string | null;
  next: string | null;
  cas: string | null;
  groundSpeed: string | null;
  verticalSpeed: string | null;
  heading: string | null;
  track: string | null;
  wind: string | null;
  sat: string | null;
  /** '' when no information */
  icing: string;
  turbulence: string;
  etaDest: string | null;
  endurance: string | null;
  deviating: boolean;
  deviatingValue: string | null;
  climbing: boolean;
  climbingValue: string | null;
  descending: boolean;
  descendingValue: string | null;
  /** The freetext frame (FREETEXT page), two lines */
  freetext: [string | null, string | null];
}

export type PositionReportKey = keyof PositionReportValues;

export const ICING_VALUES = ['', 'TRACE', 'LIGHT', 'MODERATE', 'SEVERE'];
export const TURBULENCE_VALUES = ['', 'LIGHT', 'MODERATE', 'SEVERE'];

export function emptyPositionReport(): PositionReportValues {
  return {
    ovhd: null,
    ovhdUtc: null,
    ovhdAlt: null,
    ppos: null,
    pposUtc: null,
    pposAlt: null,
    to: null,
    toUtc: null,
    next: null,
    cas: null,
    groundSpeed: null,
    verticalSpeed: null,
    heading: null,
    track: null,
    wind: null,
    sat: null,
    icing: '',
    turbulence: '',
    etaDest: null,
    endurance: null,
    deviating: false,
    deviatingValue: null,
    climbing: false,
    climbingValue: null,
    descending: false,
    descendingValue: null,
    freetext: [null, null],
  };
}

/** A UTC time of the day in seconds, as HHMMZ */
export function utcText(seconds: number): string {
  const minutes = Math.floor(seconds / 60) % (24 * 60);
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}${(minutes % 60).toString().padStart(2, '0')}Z`;
}

/** An altitude in feet: 100 ft resolution (FCOM figure: 32000 FT) */
function altitudeText(feet: number): string {
  return `${Math.max(0, Math.round(feet / 100) * 100)}FT`;
}

/** A position as DDMM.MB/EEEMM.MC */
export function latLongText(lat: number, lon: number): string {
  const part = (value: number, degreeDigits: number, positive: string, negative: string) => {
    const abs = Math.abs(value);
    let degrees = Math.floor(abs);
    let minutes = Math.round((abs - degrees) * 600) / 10;
    if (minutes >= 60) {
      degrees += 1;
      minutes = 0;
    }
    return `${degrees.toString().padStart(degreeDigits, '0')}${minutes.toFixed(1).padStart(4, '0')}${value < 0 ? negative : positive}`;
  };
  return `${part(lat, 2, 'N', 'S')}/${part(lon, 3, 'E', 'W')}`;
}

function degreeText(degrees: number): string {
  const value = Math.round(degrees) % 360;
  return `${(value === 0 ? 0 : value).toString().padStart(3, '0')}T`;
}

/**
 * The position report with the FMS data (REFRESH DATA, FCOM P 20): all the fields except ICING, TURBULENCE and
 * ENDURANCE (emptied) and the freetext (kept)
 * @param data the FMS data of the ATC function
 * @param utcSeconds the present UTC time of the day
 * @param current the present report
 */
export function positionReportFromFms(
  data: PositionReportData,
  utcSeconds: number,
  current: PositionReportValues,
): PositionReportValues {
  const state = data.flightState;
  const report = emptyPositionReport();
  report.freetext = current.freetext;
  if (data.lastWaypoint) {
    report.ovhd = data.lastWaypoint.ident;
    report.ovhdUtc = utcText(data.lastWaypoint.utc);
    report.ovhdAlt = altitudeText(data.lastWaypoint.altitude);
  }
  report.ppos = latLongText(state.lat, state.lon);
  report.pposUtc = utcText(utcSeconds);
  report.pposAlt = altitudeText(state.altitude);
  if (data.activeWaypoint) {
    report.to = data.activeWaypoint.ident;
    report.toUtc = utcText(data.activeWaypoint.utc);
  }
  if (data.nextWaypoint) {
    report.next = data.nextWaypoint.ident;
  }
  report.cas = `${Math.round(state.indicatedAirspeed)}KT`;
  report.groundSpeed = `${Math.round(state.groundSpeed)}KT`;
  report.verticalSpeed = `${Math.round(state.verticalSpeed / 100) * 100}FT/MIN`;
  report.heading = degreeText(state.heading);
  report.track = degreeText(state.track);
  const env = data.environment;
  if (Number.isFinite(env.windDirection) && Number.isFinite(env.windSpeed)) {
    report.wind = `${(Math.round(env.windDirection) % 360 || 360).toString().padStart(3, '0')}/${Math.round(env.windSpeed)}KT`;
  }
  if (Number.isFinite(env.temperature)) {
    report.sat = `${Math.round(env.temperature)}C`;
  }
  if (data.destination) {
    report.etaDest = utcText(data.destination.utc);
  }
  // The target altitude of the FCU, sent via the FMS (FCOM P 20)
  const ap = data.autopilot;
  if (ap.apActive && Math.abs(ap.altitude - state.altitude) >= 500) {
    if (ap.altitude > state.altitude) {
      report.climbing = true;
      report.climbingValue = altitudeText(ap.altitude);
    } else {
      report.descending = true;
      report.descendingValue = altitudeText(ap.altitude);
    }
  }
  return report;
}

/** Whether a field of the report is completed (ERASE ALL FIELDS is available) */
export function hasPositionReportData(report: PositionReportValues): boolean {
  return Object.values(report).some((value) => {
    if (Array.isArray(value)) {
      return value.some((v) => v);
    }
    return typeof value === 'boolean' ? value : !!value;
  });
}

/**
 * The mandatory fields are completed (FCOM P 18-20): PPOS with its time and altitude, the field of a ticked DEVIATING,
 * CLIMBING TO or DESCENDING TO
 */
export function isPositionReportComplete(report: PositionReportValues): boolean {
  return (
    !!report.ppos &&
    !!report.pposUtc &&
    !!report.pposAlt &&
    (!report.deviating || !!report.deviatingValue) &&
    (!report.climbing || !!report.climbingValue) &&
    (!report.descending || !!report.descendingValue)
  );
}

function text(value: string): CpdlcMessageElement {
  const element = CpdlcMessagesDownlink.DM67[1].deepCopy();
  element.Content[0].Value = value;
  return element;
}

/** The message: POSITION REPORT, then a line for each completed data, as the ATC function does */
export function positionReportElements(report: PositionReportValues): CpdlcMessageElement[] {
  const elements = [CpdlcMessagesDownlink.DM48[1].deepCopy()];
  const at = (utc: string | null, alt: string | null) => [utc, alt].filter((v) => v).join('/');
  if (report.ovhd) {
    elements.push(text(`OVHD: ${report.ovhd}`));
    if (report.ovhdUtc || report.ovhdAlt) {
      elements.push(text(`AT ${at(report.ovhdUtc, report.ovhdAlt)}`));
    }
  }
  elements.push(text(`PPOS: ${report.ppos}`), text(`AT ${at(report.pposUtc, report.pposAlt)}`));
  if (report.to) {
    elements.push(text(`TO: ${report.to}${report.toUtc ? ` AT ${report.toUtc}` : ''}`));
  }
  if (report.next) {
    elements.push(text(`NEXT: ${report.next}`));
  }
  const meteo = [report.wind && `WIND: ${report.wind}`, report.sat && `SAT: ${report.sat}`].filter((v) => v);
  if (meteo.length > 0) {
    elements.push(text(meteo.join(' ')));
  }
  const conditions = [
    report.icing && `ICING: ${report.icing}`,
    report.turbulence && `TURBULENCE: ${report.turbulence}`,
  ].filter((v) => v);
  if (conditions.length > 0) {
    elements.push(text(conditions.join(' ')));
  }
  if (report.etaDest) {
    elements.push(text(`DEST ETA: ${report.etaDest}`));
  }
  if (report.endurance) {
    elements.push(text(`ENDURANCE: ${report.endurance}`));
  }
  if (report.deviating && report.deviatingValue) {
    elements.push(text(`DEVIATING: ${report.deviatingValue}`));
  }
  if (report.climbing && report.climbingValue) {
    elements.push(text(`CLIMBING TO: ${report.climbingValue}`));
  }
  if (report.descending && report.descendingValue) {
    elements.push(text(`DESCENDING TO: ${report.descendingValue}`));
  }
  const speeds = [report.cas && `SPD: ${report.cas}`, report.groundSpeed && `GS: ${report.groundSpeed}`].filter(
    (v) => v,
  );
  if (speeds.length > 0) {
    elements.push(text(speeds.join(' ')));
  }
  if (report.verticalSpeed) {
    elements.push(text(`VS: ${report.verticalSpeed}`));
  }
  if (report.heading) {
    elements.push(text(`HDG: ${report.heading}`));
  }
  if (report.track) {
    elements.push(text(`TRK: ${report.track}`));
  }
  const freetext = report.freetext.filter((line) => line).join(' ');
  if (freetext !== '') {
    elements.push(text(freetext));
  }
  return elements;
}
