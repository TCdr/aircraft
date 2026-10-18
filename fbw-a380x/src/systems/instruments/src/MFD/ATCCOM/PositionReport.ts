// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CpdlcMessageElement, CpdlcMessagesDownlink, PositionReportData } from '@datalink/common';

import { freetextElement } from './RequestFrames';

/**
 * The position report of the REPORT/AUTO & MANUAL POSITION page: the fields, their
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

/** An altitude in feet, at 100 ft resolution, displayed as e.g. 32000 FT */
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
 * The position report with the FMS data (REFRESH DATA): all the fields except ICING, TURBULENCE and
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
  // The target altitude of the FCU, sent via the FMS
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
 * The mandatory fields are completed: PPOS with its time and altitude, the field of a ticked DEVIATING,
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

/** The message: POSITION REPORT, then a line for each completed data, as the ATC function does */
export function positionReportElements(report: PositionReportValues): CpdlcMessageElement[] {
  const elements = [CpdlcMessagesDownlink.DM48[1].deepCopy()];
  const at = (utc: string | null, alt: string | null) => [utc, alt].filter((v) => v).join('/');
  if (report.ovhd) {
    elements.push(freetextElement(`OVHD: ${report.ovhd}`));
    if (report.ovhdUtc || report.ovhdAlt) {
      elements.push(freetextElement(`AT ${at(report.ovhdUtc, report.ovhdAlt)}`));
    }
  }
  elements.push(freetextElement(`PPOS: ${report.ppos}`), freetextElement(`AT ${at(report.pposUtc, report.pposAlt)}`));
  if (report.to) {
    elements.push(freetextElement(`TO: ${report.to}${report.toUtc ? ` AT ${report.toUtc}` : ''}`));
  }
  if (report.next) {
    elements.push(freetextElement(`NEXT: ${report.next}`));
  }
  const meteo = [report.wind && `WIND: ${report.wind}`, report.sat && `SAT: ${report.sat}`].filter((v) => v);
  if (meteo.length > 0) {
    elements.push(freetextElement(meteo.join(' ')));
  }
  const conditions = [
    report.icing && `ICING: ${report.icing}`,
    report.turbulence && `TURBULENCE: ${report.turbulence}`,
  ].filter((v) => v);
  if (conditions.length > 0) {
    elements.push(freetextElement(conditions.join(' ')));
  }
  if (report.etaDest) {
    elements.push(freetextElement(`DEST ETA: ${report.etaDest}`));
  }
  if (report.endurance) {
    elements.push(freetextElement(`ENDURANCE: ${report.endurance}`));
  }
  if (report.deviating && report.deviatingValue) {
    elements.push(freetextElement(`DEVIATING: ${report.deviatingValue}`));
  }
  if (report.climbing && report.climbingValue) {
    elements.push(freetextElement(`CLIMBING TO: ${report.climbingValue}`));
  }
  if (report.descending && report.descendingValue) {
    elements.push(freetextElement(`DESCENDING TO: ${report.descendingValue}`));
  }
  const speeds = [report.cas && `SPD: ${report.cas}`, report.groundSpeed && `GS: ${report.groundSpeed}`].filter(
    (v) => v,
  );
  if (speeds.length > 0) {
    elements.push(freetextElement(speeds.join(' ')));
  }
  if (report.verticalSpeed) {
    elements.push(freetextElement(`VS: ${report.verticalSpeed}`));
  }
  if (report.heading) {
    elements.push(freetextElement(`HDG: ${report.heading}`));
  }
  if (report.track) {
    elements.push(freetextElement(`TRK: ${report.track}`));
  }
  const freetext = report.freetext.filter((line) => line).join(' ');
  if (freetext !== '') {
    elements.push(freetextElement(freetext));
  }
  return elements;
}
