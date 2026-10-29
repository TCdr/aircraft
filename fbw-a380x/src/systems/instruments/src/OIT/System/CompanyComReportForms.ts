// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FreetextMessage } from '@datalink/common';
import { UnitType } from '@microsoft/msfs-sdk';
import { freeTextMessage } from './CompanyComRequests';

/*
 * The report and request forms of the COMPANY COM application of the OIT (AOC): INIT data, fuel figures, delays,
 * diversion, ETA, flight summary... The operators customise the AOC application, so there is no common layout: each
 * form is a plain list of fields, sent as a free text (one line per filled field) to a station of the Hoppie network,
 * as the Free Text page does.
 *
 * Design choice, for every form below: the flight identification first (flight number, origin, destination), then the
 * few figures the ground needs for that report. The fields are pre-filled from what the OIT already knows: the FMS
 * flight number and airports, the FQMS fuel on board, and the OOOI times and fuel of the flight log. Times are HHMM
 * UTC, weights whole kg or lb in the weight unit of the aircraft, delay codes two digits (the IATA delay codes).
 */

export type ReportWeightUnit = 'KG' | 'LB';

export enum ReportFieldKind {
  Text = 'text',
  Airport = 'airport',
  /** HHMM UTC */
  Time = 'time',
  /** Whole kg or lb */
  Weight = 'weight',
  /** Whole minutes */
  Minutes = 'minutes',
  /** A whole number, e.g. passengers or a loadsheet edition */
  Count = 'count',
  /** A two-digit delay code */
  DelayCode = 'delay-code',
}

/** What the OIT knows when a form opens, to pre-fill it */
export interface ReportPrefillData {
  readonly flightNumber: string | null;
  readonly origin: string | null;
  readonly destination: string | null;
  /** The OOOI times of the flight log, ms since the epoch (UTC), null before */
  readonly outTime: number | null;
  readonly offTime: number | null;
  readonly onTime: number | null;
  readonly inTime: number | null;
  /** The fuel on board now (FQMS), kg */
  readonly fuelOnBoard: number | null;
  /** The fuel on board at OUT and IN (flight log), kg */
  readonly outFuel: number | null;
  readonly inFuel: number | null;
  /** The computed airspeed now, kt */
  readonly airspeed: number | null;
}

export interface ReportField {
  /** Unique in its form */
  readonly id: string;
  readonly label: string;
  readonly kind: ReportFieldKind;
  /** Maximum characters of the entry */
  readonly length: number;
  /** SEND needs it filled */
  readonly required?: boolean;
  /** The pre-filled entry, as the crew would type it, or null */
  readonly prefill?: (data: ReportPrefillData, unit: ReportWeightUnit) => string | null;
}

export interface ReportForm {
  /** The headline of the page, the first line of the message and the subject in Outbox and Sent */
  readonly title: string;
  readonly fields: readonly ReportField[];
  /** Lines worked out from the valid entries (by field id), added after the fields */
  readonly derivedLines?: (values: Readonly<Record<string, string>>, unit: ReportWeightUnit) => string[];
}

/** The entries of a form, by field id, null when empty */
export type ReportEntries = Readonly<Record<string, string | null | undefined>>;

/**
 * Width of one empty-box placeholder of a mandatory entry, px. Design choice: the glyph is 26 px wide in the laptop
 * font and a little wider in the sim, which draws it with a fallback font.
 */
const MANDATORY_PLACEHOLDER_WIDTH = 28;

/** Frame and padding of a text box, px */
const BOX_FRAME_WIDTH = 20;

/**
 * @param length the maximum characters of the entry
 * @param mandatory whether the empty entry shows one empty-box placeholder per character
 * @param usualWidth the width of the box on its page, px
 * @returns the width of the box, px: wider than usual only where the placeholders would run past the frame
 */
export function entryBoxWidth(length: number, mandatory: boolean, usualWidth: number): number {
  return mandatory ? Math.max(usualWidth, length * MANDATORY_PLACEHOLDER_WIDTH + BOX_FRAME_WIDTH) : usualWidth;
}

const TEXT_LENGTH = 24;

const WEIGHT_LENGTH = 7;

/**
 * @param utcMs a time, ms since the epoch
 * @returns the time as typed in a time field, HHMM UTC
 */
export function hhmmOf(utcMs: number | null): string | null {
  if (utcMs === null) {
    return null;
  }
  const date = new Date(utcMs);
  return `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * @param kg a weight, kg
 * @param unit the weight unit of the aircraft
 * @returns the weight as typed in a weight field, whole kg or lb
 */
export function weightEntryOf(kg: number | null, unit: ReportWeightUnit): string | null {
  if (kg === null || !Number.isFinite(kg) || kg < 0) {
    return null;
  }
  return String(Math.round(unit === 'KG' ? kg : UnitType.POUND.convertFrom(kg, UnitType.KILOGRAM)));
}

/**
 * @param hhmm a valid time entry, HHMM
 * @returns the minutes since midnight
 */
function minutesOfDay(hhmm: string): number {
  return Number(hhmm.substring(0, 2)) * 60 + Number(hhmm.substring(2, 4));
}

/**
 * @param from a valid time entry, HHMM
 * @param to a later valid time entry, HHMM (on the next day when earlier in the day)
 * @returns the duration, H:MM
 */
export function durationBetween(from: string, to: string): string {
  const minutes = (minutesOfDay(to) - minutesOfDay(from) + 24 * 60) % (24 * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Checks one entry and gives it as it goes into the message
 * @param field the field
 * @param entry the entry, null when empty
 * @param unit the weight unit of the aircraft
 * @returns the message value (null when empty), or undefined when the entry is not valid for the field
 */
export function reportFieldValue(
  field: ReportField,
  entry: string | null | undefined,
  unit: ReportWeightUnit,
): string | null | undefined {
  const text = entry?.trim().toUpperCase() ?? '';
  if (text === '') {
    return null;
  }
  if (text.length > field.length) {
    return undefined;
  }
  switch (field.kind) {
    case ReportFieldKind.Text:
      return text;
    case ReportFieldKind.Airport:
      return /^[A-Z]{4}$/.test(text) ? text : undefined;
    case ReportFieldKind.Time: {
      if (!/^\d{4}$/.test(text)) {
        return undefined;
      }
      const hours = Number(text.substring(0, 2));
      const minutes = Number(text.substring(2, 4));
      return hours < 24 && minutes < 60 ? text : undefined;
    }
    case ReportFieldKind.Weight:
      return /^\d+$/.test(text) ? `${Number(text)} ${unit}` : undefined;
    case ReportFieldKind.Minutes:
      return /^\d+$/.test(text) ? `${Number(text)} MIN` : undefined;
    case ReportFieldKind.Count:
      return /^\d+$/.test(text) ? String(Number(text)) : undefined;
    case ReportFieldKind.DelayCode:
      return /^\d{2}$/.test(text) ? text : undefined;
    default:
      return undefined;
  }
}

export interface ReportCheck {
  /** The free text to send, null when a field is not valid or a required field is empty */
  readonly message: FreetextMessage | null;
  /** The labels of the fields to correct (invalid, or required and empty) */
  readonly invalidLabels: readonly string[];
  /** No station to send it to */
  readonly missingStation: boolean;
}

/**
 * Builds the message of a form: its title, one line "LABEL VALUE" per filled field, then the derived lines
 * @param form the form
 * @param station the Hoppie station (callsign) it goes to
 * @param entries the entries of the form, by field id
 * @param unit the weight unit of the aircraft
 * @returns the message to send, or what to correct
 */
export function checkReport(
  form: ReportForm,
  station: string | null,
  entries: ReportEntries,
  unit: ReportWeightUnit,
): ReportCheck {
  const invalidLabels: string[] = [];
  const lines = [form.title];
  const values: Record<string, string> = {};
  for (const field of form.fields) {
    const value = reportFieldValue(field, entries[field.id], unit);
    if (value === undefined || (value === null && field.required)) {
      invalidLabels.push(field.label);
    } else if (value !== null) {
      values[field.id] = value;
      lines.push(`${field.label} ${value}`);
    }
  }
  const missingStation = (station?.trim() ?? '') === '';
  if (invalidLabels.length > 0 || missingStation) {
    return { message: null, invalidLabels, missingStation };
  }
  if (form.derivedLines) {
    lines.push(...form.derivedLines(values, unit));
  }
  return { message: freeTextMessage(station, lines), invalidLabels, missingStation };
}

/**
 * @param value a weight value of the message ("123400 KG")
 * @returns the number
 */
function weightNumber(value: string): number {
  return Number(value.split(' ')[0]);
}

const flightNumberField: ReportField = {
  id: 'flightNumber',
  label: 'FLT NBR',
  kind: ReportFieldKind.Text,
  length: 8,
  required: true,
  prefill: (data) => data.flightNumber,
};

const originField: ReportField = {
  id: 'origin',
  label: 'FROM',
  kind: ReportFieldKind.Airport,
  length: 4,
  prefill: (data) => data.origin,
};

const destinationField: ReportField = {
  id: 'destination',
  label: 'DEST',
  kind: ReportFieldKind.Airport,
  length: 4,
  prefill: (data) => data.destination,
};

/**
 * @param id the field id
 * @param label the field label
 * @param required whether SEND needs it
 * @returns a text field of one line
 */
function textField(id: string, label: string, required = false): ReportField {
  return { id, label, kind: ReportFieldKind.Text, length: TEXT_LENGTH, required };
}

/**
 * @param id the field id
 * @param label the field label
 * @param required whether SEND needs it
 * @param time the pre-filled time, from the prefill data
 * @returns an HHMM UTC field
 */
function timeField(
  id: string,
  label: string,
  required = false,
  time?: (data: ReportPrefillData) => number | null,
): ReportField {
  return {
    id,
    label,
    kind: ReportFieldKind.Time,
    length: 4,
    required,
    prefill: time ? (data) => hhmmOf(time(data)) : undefined,
  };
}

/**
 * @param id the field id
 * @param label the field label
 * @param required whether SEND needs it
 * @param kg the pre-filled weight, from the prefill data, kg
 * @returns a weight field, whole kg or lb
 */
function weightField(
  id: string,
  label: string,
  required = false,
  kg?: (data: ReportPrefillData) => number | null,
): ReportField {
  return {
    id,
    label,
    kind: ReportFieldKind.Weight,
    length: WEIGHT_LENGTH,
    required,
    prefill: kg ? (data, unit) => weightEntryOf(kg(data), unit) : undefined,
  };
}

/**
 * @param id the field id
 * @param label the field label
 * @param required whether SEND needs it
 * @returns a two-digit delay code field
 */
function delayCodeField(id: string, label: string, required = false): ReportField {
  return { id, label, kind: ReportFieldKind.DelayCode, length: 2, required };
}

/**
 * @param id the field id
 * @param label the field label
 * @param required whether SEND needs it
 * @returns a field of whole minutes
 */
function minutesField(id: string, label: string, required = false): ReportField {
  return { id, label, kind: ReportFieldKind.Minutes, length: 3, required };
}

/** Design choice: the request only identifies the flight; the ground answers with the INIT data uplink */
const initDataForm: ReportForm = {
  title: 'INIT DATA REQUEST',
  fields: [flightNumberField, originField, destinationField],
};

/** Design choice: the block fuel (pre-filled with the fuel on board), trip and taxi fuel */
const fuelFiguresForm: ReportForm = {
  title: 'FUEL FIGURES',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    weightField('blockFuel', 'BLOCK FUEL', true, (data) => data.fuelOnBoard),
    weightField('tripFuel', 'TRIP FUEL'),
    weightField('taxiFuel', 'TAXI FUEL'),
    textField('remarks', 'REMARKS'),
  ],
};

/** Design choice: the fuel on board before and after (pre-filled with the fuel on board) and the fuel slip; the uplift follows */
const refuellingForm: ReportForm = {
  title: 'REFUELLING',
  fields: [
    flightNumberField,
    originField,
    weightField('fuelBefore', 'FOB BEFORE'),
    weightField('fuelAfter', 'FOB AFTER', true, (data) => data.fuelOnBoard),
    { id: 'fuelSlip', label: 'FUEL SLIP NBR', kind: ReportFieldKind.Text, length: 10 },
  ],
  derivedLines: (values, unit) =>
    values.fuelBefore !== undefined && values.fuelAfter !== undefined
      ? [`UPLIFT ${weightNumber(values.fuelAfter) - weightNumber(values.fuelBefore)} ${unit}`]
      : [],
};

/** Design choice: the loadsheet edition accepted, its ZFW and TOW, and who accepted it */
const loadsheetAcceptanceForm: ReportForm = {
  title: 'LOADSHEET ACCEPTANCE',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    { id: 'edition', label: 'EDITION NBR', kind: ReportFieldKind.Count, length: 2, required: true },
    weightField('zfw', 'ZFW'),
    weightField('tow', 'TOW'),
    { id: 'acceptedBy', label: 'ACCEPTED BY', kind: ReportFieldKind.Text, length: 16 },
  ],
};

/** Design choice: the scheduled and new departure times and the delay code; the delay follows */
const departureDelayForm: ReportForm = {
  title: 'DEPARTURE DELAY',
  fields: [
    flightNumberField,
    originField,
    timeField('scheduled', 'STD'),
    timeField('newDeparture', 'NEW ETD', true),
    delayCodeField('delayCode', 'DELAY CODE', true),
    textField('remarks', 'REMARKS'),
  ],
  derivedLines: (values) =>
    values.scheduled !== undefined && values.newDeparture !== undefined
      ? [`DELAY ${durationBetween(values.scheduled, values.newDeparture)}`]
      : [],
};

/** Design choice: the OUT time (pre-filled from the flight log), the expected take-off time and the delay code */
const takeOffDelayForm: ReportForm = {
  title: 'TAKE OFF DELAY',
  fields: [
    flightNumberField,
    originField,
    timeField('out', 'OUT', false, (data) => data.outTime),
    timeField('expectedTakeOff', 'EST TAKE OFF', true),
    delayCodeField('delayCode', 'DELAY CODE', true),
    textField('remarks', 'REMARKS'),
  ],
};

/** Design choice: up to two delay codes with their minutes */
const delayCodeForm: ReportForm = {
  title: 'DELAY CODE',
  fields: [
    flightNumberField,
    originField,
    delayCodeField('code1', 'DELAY CODE 1', true),
    minutesField('minutes1', 'DELAY 1', true),
    delayCodeField('code2', 'DELAY CODE 2'),
    minutesField('minutes2', 'DELAY 2'),
  ],
};

/** Design choice: when and in which flight phase the event happened, and one line on what happened */
const asrNotificationForm: ReportForm = {
  title: 'ASR NOTIFICATION',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    timeField('eventTime', 'EVENT TIME'),
    { id: 'phase', label: 'FLIGHT PHASE', kind: ReportFieldKind.Text, length: 10 },
    textField('event', 'EVENT', true),
    textField('remarks', 'REMARKS'),
  ],
};

/** Design choice: the time the flight was due to arrive, the new estimate and the delay code; the delay follows */
const flightDelayForm: ReportForm = {
  title: 'FLIGHT DELAY',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    timeField('scheduledArrival', 'STA'),
    timeField('newEta', 'NEW ETA', true),
    delayCodeField('delayCode', 'DELAY CODE', true),
    textField('remarks', 'REMARKS'),
  ],
  derivedLines: (values) =>
    values.scheduledArrival !== undefined && values.newEta !== undefined
      ? [`DELAY ${durationBetween(values.scheduledArrival, values.newEta)}`]
      : [],
};

/** Design choice: what the avionics parameter recorder gives the ground, in few figures: fuel and airspeed are pre-filled */
const flightParametersForm: ReportForm = {
  title: 'FLIGHT PARAMETERS',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    { id: 'flightLevel', label: 'FL', kind: ReportFieldKind.Count, length: 3, required: true },
    { id: 'mach', label: 'MACH', kind: ReportFieldKind.Text, length: 4 },
    {
      id: 'airspeed',
      label: 'CAS KT',
      kind: ReportFieldKind.Count,
      length: 3,
      prefill: (data) => (data.airspeed === null ? null : String(Math.round(data.airspeed))),
    },
    weightField('fuelOnBoard', 'FOB', true, (data) => data.fuelOnBoard),
    textField('remarks', 'REMARKS'),
  ],
};

/** Design choice: the arrival airport and time, wheelchairs, and the services asked for in one line */
const rampServiceForm: ReportForm = {
  title: 'RAMP SERVICE REQUEST',
  fields: [
    flightNumberField,
    destinationField,
    timeField('eta', 'ETA'),
    { id: 'wheelchairs', label: 'WHEELCHAIRS', kind: ReportFieldKind.Count, length: 2 },
    textField('services', 'SERVICES', true),
    textField('remarks', 'REMARKS'),
  ],
};

/** Design choice: the diversion airport, ETA, fuel on board (pre-filled) and reason */
const diversionForm: ReportForm = {
  title: 'DIVERSION',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    { id: 'divertTo', label: 'DIVERT TO', kind: ReportFieldKind.Airport, length: 4, required: true },
    timeField('eta', 'ETA'),
    weightField('fuelOnBoard', 'FOB', false, (data) => data.fuelOnBoard),
    textField('reason', 'REASON', true),
  ],
};

/** Design choice: the ETA at the destination; the crew enters it (the FMS does not give its predictions to the OIT) */
const etaForm: ReportForm = {
  title: 'ETA',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    timeField('eta', 'ETA', true),
    textField('remarks', 'REMARKS'),
  ],
};

/** Design choice: the OOOI times and the fuel at OUT and IN of the flight log; the block and flight times and fuel used follow */
const flightSummaryForm: ReportForm = {
  title: 'FLIGHT SUMMARY',
  fields: [
    flightNumberField,
    originField,
    destinationField,
    timeField('out', 'OUT', true, (data) => data.outTime),
    timeField('off', 'OFF', false, (data) => data.offTime),
    timeField('on', 'ON', false, (data) => data.onTime),
    timeField('in', 'IN', true, (data) => data.inTime),
    weightField('fuelOut', 'FOB OUT', false, (data) => data.outFuel),
    weightField('fuelIn', 'FOB IN', false, (data) => data.inFuel),
    textField('remarks', 'REMARKS'),
  ],
  derivedLines: (values, unit) => {
    const lines = [`BLOCK TIME ${durationBetween(values.out, values.in)}`];
    if (values.off !== undefined && values.on !== undefined) {
      lines.push(`FLIGHT TIME ${durationBetween(values.off, values.on)}`);
    }
    if (values.fuelOut !== undefined && values.fuelIn !== undefined) {
      lines.push(`FUEL USED ${weightNumber(values.fuelOut) - weightNumber(values.fuelIn)} ${unit}`);
    }
    return lines;
  },
};

/** Design choice: the ON and IN times of the flight log, the minutes waited for the gate and the delay code */
const gateDelayForm: ReportForm = {
  title: 'GATE DELAY',
  fields: [
    flightNumberField,
    destinationField,
    timeField('on', 'ON', false, (data) => data.onTime),
    timeField('in', 'IN', false, (data) => data.inTime),
    minutesField('delay', 'DELAY', true),
    delayCodeField('delayCode', 'DELAY CODE'),
    textField('remarks', 'REMARKS'),
  ],
};

/** The page of each form, under nss-avncs/company-com/ */
const REPORT_FORM_PAGES: readonly { readonly path: string; readonly form: ReportForm }[] = [
  { path: 'pre-flight/init-data', form: initDataForm },
  { path: 'pre-flight/fuel-figures', form: fuelFiguresForm },
  { path: 'pre-flight/refuelling', form: refuellingForm },
  { path: 'pre-flight/loadsheet-acceptance', form: loadsheetAcceptanceForm },
  { path: 'pre-flight/departure-delay', form: departureDelayForm },
  { path: 'pre-flight/take-off-delay', form: takeOffDelayForm },
  { path: 'pre-flight/delay-code', form: delayCodeForm },
  { path: 'pre-flight/asr-notification', form: asrNotificationForm },
  { path: 'in-flight/ramp-service', form: rampServiceForm },
  { path: 'in-flight/diversion', form: diversionForm },
  { path: 'in-flight/eta', form: etaForm },
  { path: 'in-flight/flight-delay', form: flightDelayForm },
  { path: 'in-flight/flight-parameters', form: flightParametersForm },
  { path: 'post-flight/asr-notification', form: asrNotificationForm },
  { path: 'post-flight/flight-summary', form: flightSummaryForm },
  { path: 'post-flight/gate-delay', form: gateDelayForm },
];

const COMPANY_COM_URL = 'nss-avncs/company-com/';

/** The URLs of the form pages */
export const REPORT_FORM_URLS: readonly string[] = REPORT_FORM_PAGES.map((page) => COMPANY_COM_URL + page.path);

/**
 * @param url the page URL, e.g. nss-avncs/company-com/in-flight/eta
 * @returns the form of that page, or null
 */
export function reportFormForUrl(url: string): ReportForm | null {
  const page = REPORT_FORM_PAGES.find((p) => COMPANY_COM_URL + p.path === url);
  return page ? page.form : null;
}

/**
 * @param form the form
 * @param data what the OIT knows now
 * @param unit the weight unit of the aircraft
 * @returns the pre-filled entries, by field id (null when nothing to pre-fill)
 */
export function prefilledEntries(
  form: ReportForm,
  data: ReportPrefillData,
  unit: ReportWeightUnit,
): Record<string, string | null> {
  const entries: Record<string, string | null> = {};
  for (const field of form.fields) {
    const value = field.prefill ? field.prefill(data, unit) : null;
    entries[field.id] = value !== null && value.length <= field.length ? value : null;
  }
  return entries;
}
