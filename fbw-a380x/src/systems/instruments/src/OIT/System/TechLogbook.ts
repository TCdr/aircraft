// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The technical logbook (eLogbook) of the NSS AVNCS side: the defect items, the flights, the maintenance release and
 * who controls the database. Everything here is pure: each operation returns a new state, so the OIT pages, the
 * persistence and the specs share the same rules.
 */

import { groundDeferralRule } from './TechLogbookDefects';

/** The stored logbook, shared by both OITs and kept across flights: the NSS database is permanent */
export const TECH_LOGBOOK_STORAGE_KEY = 'OIS_TECH_LOGBOOK';

/** Who controls the logbook database: the aircraft (flight crew, onboard maintenance) or the ground station */
export type LogbookControl = 'on-board' | 'on-ground';

/**
 * The list an item is in. The cabin crew submits cabin defects to the flight crew ('cabin-submitted'); a refused one
 * stays in the cabin logbook ('cabin-open'). Maintenance closes items ('closed', the HISTORY) or defers them.
 */
export type LogbookItemState = 'open' | 'temporary' | 'deferred' | 'closed' | 'cabin-submitted' | 'cabin-open';

/** The send state of an open item: sending (ground acknowledgement awaited), not sent, or received by the ground */
export type LogbookSendStatus = 'not-sent' | 'sending' | 'sent';

export type LogbookDeferralCategory = 'MEL' | 'CDL' | 'OTHER';

/** How maintenance deferred an item */
export interface LogbookDeferral {
  readonly category: LogbookDeferralCategory;
  /** e.g. MEL, MEL(o), MEL(m), MEL(o)(m) */
  readonly classification: string;
  /** The MEL or CDL item reference */
  readonly reference: string;
  /** ms since the epoch (UTC), null without a limit */
  readonly expiryDate: number | null;
  readonly rectificationInterval: string;
  readonly severity: string;
}

export interface LogbookItem {
  /** The internal reference created by the logbook (REF REPORT) */
  readonly ref: string;
  readonly title: string;
  readonly ata: string;
  readonly state: LogbookItemState;
  /** ms since the epoch (UTC) */
  readonly openDate: number;
  readonly closeDate: number | null;
  readonly pilotComment: string;
  readonly cabinComment: string;
  readonly additionalInfo: string;
  readonly lastMaintAction: string;
  readonly sendStatus: LogbookSendStatus;
  /** The flight in which the item was recorded */
  readonly flightIndex: number;
  /** The ECAM alert the item was recorded from, to find the alerts not recorded at flight closure */
  readonly ecamAlertId: string | null;
  readonly deferral: LogbookDeferral | null;
}

/** The fields of the aircraft and flight information area the flight crew can enter */
export type LogbookInfoField = 'flightNumber' | 'from' | 'to';

/** A value of the aircraft and flight information area, cyan when entered by the flight crew, magenta from the FMS */
export interface LogbookInfoValue {
  readonly value: string | null;
  readonly byCrew: boolean;
}

export interface LogbookFlightInfo {
  readonly flightNumber: LogbookInfoValue;
  readonly from: LogbookInfoValue;
  readonly to: LogbookInfoValue;
  /** ms since the epoch (UTC) */
  readonly date: number | null;
}

/** What the avionics give the logbook: the FMS flight number and city pair, and the date */
export interface LogbookAvionicsInfo {
  readonly flightNumber: string | null;
  readonly from: string | null;
  readonly to: string | null;
  /** ms since the epoch (UTC) */
  readonly now: number;
}

/** The OUT/OFF/ON/IN times (ms since the epoch, UTC) and fuel on board (kg) of the flight log */
export interface LogbookBlockData {
  readonly outTime: number | null;
  readonly offTime: number | null;
  readonly onTime: number | null;
  readonly inTime: number | null;
  readonly outFob: number | null;
  readonly inFob: number | null;
  /** ms */
  readonly flightTime: number | null;
}

/**
 * The PRE-FLIGHT panel. The operator customises it; these are typical parameters.
 * Times are minutes after midnight UTC.
 */
export interface LogbookPreFlightData {
  readonly receiptNumber: string | null;
  readonly fuelSupplier: string | null;
  /** litres */
  readonly totalUplift: number | null;
  readonly noDeIcing: boolean;
  readonly deIcingStart: number | null;
}

/** The POST-FLIGHT panel (operator customised, typical parameters). Durations in minutes, times minutes after midnight UTC. */
export interface LogbookPostFlightData {
  readonly nilDefect: boolean;
  readonly totalTimeBroughtForward: number | null;
  readonly flightTime: number | null;
  readonly takeOff: number | null;
  readonly landing: number | null;
}

/** A POST-FLIGHT value with its origin: entered by the flight crew, or taken from the flight log / previous flight */
export interface LogbookPostFlightValue {
  readonly value: number | null;
  readonly byCrew: boolean;
}

export interface LogbookEffectivePostFlight {
  readonly nilDefect: boolean;
  readonly totalTimeBroughtForward: LogbookPostFlightValue;
  readonly flightTime: LogbookPostFlightValue;
  readonly totalTime: number | null;
  readonly takeOff: LogbookPostFlightValue;
  readonly landing: LogbookPostFlightValue;
}

/** Acceptance of the aircraft: not accepted, signed and synchronising with the ground, accepted */
export type LogbookAcceptance = 'not-accepted' | 'syncing' | 'accepted';

/** What the flight crew typed in the information area, null where the FMS value applies */
export interface LogbookCrewEntries {
  readonly flightNumber: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly date: number | null;
}

export interface LogbookFlight {
  readonly index: number;
  readonly crewEntries: LogbookCrewEntries;
  /** The information as signed at acceptance (then kept for the flight record), null before */
  readonly signedInfo: LogbookFlightInfo | null;
  readonly preFlight: LogbookPreFlightData;
  readonly postFlight: LogbookPostFlightData;
  readonly openItemsViewed: boolean;
  readonly deferredItemsViewed: boolean;
  readonly acceptance: LogbookAcceptance;
  readonly acceptanceAcknowledged: boolean;
  /** ms since the epoch (UTC), null while the flight is open */
  readonly closedAt: number | null;
  /** The flight log values at closure, null while the flight is open */
  readonly blockData: LogbookBlockData | null;
}

export interface LogbookReleaseParameter {
  readonly name: string;
  readonly performed: boolean;
  readonly comment: string;
}

export interface MaintenanceRelease {
  /** ms since the epoch (UTC) */
  readonly date: number;
  readonly expiryDate: number | null;
  /** The items maintenance closed since the previous release (REPORTS panel) */
  readonly closedItemRefs: readonly string[];
  readonly parameters: readonly LogbookReleaseParameter[];
}

export interface TechLogbookState {
  readonly version: 1;
  readonly control: LogbookControl;
  /** ms since the epoch (UTC) of the last synchronisation with the ground station */
  readonly lastSync: number | null;
  readonly release: MaintenanceRelease | null;
  readonly flight: LogbookFlight;
  /** The closed flights, newest first */
  readonly pastFlights: readonly LogbookFlight[];
  readonly items: readonly LogbookItem[];
}

/** Design choice: the closed flights kept for the FLIGHT DATA selection, to bound the stored logbook */
export const LOGBOOK_PAST_FLIGHTS_KEPT = 10;

/** Design choice: the closed items kept in the HISTORY, to bound the stored logbook */
const LOGBOOK_HISTORY_ITEMS_KEPT = 50;

/**
 * Design choice: what the simulated ground maintenance records when it closes an item reported in a closed flight
 * (there is no maintenance in the sim, so every reported defect is rectified before the next release).
 */
export const GROUND_RECTIFICATION_ACTION = 'CHECKED AND RECTIFIED BY MAINTENANCE';

/** The days a deferred MEL item may stay open after the day of its deferral, by rectification interval */
const RECTIFICATION_INTERVAL_DAYS = { B: 3, C: 10, D: 120 };

/** Design choice: the release parameter of the simulated ground maintenance, the usual daily check */
const RELEASE_PARAMETERS: readonly LogbookReleaseParameter[] = [{ name: 'DAILY CHECK', performed: true, comment: '' }];

const NO_CREW_ENTRIES: LogbookCrewEntries = { flightNumber: null, from: null, to: null, date: null };

const EMPTY_PRE_FLIGHT: LogbookPreFlightData = {
  receiptNumber: null,
  fuelSupplier: null,
  totalUplift: null,
  noDeIcing: false,
  deIcingStart: null,
};

const EMPTY_POST_FLIGHT: LogbookPostFlightData = {
  nilDefect: false,
  totalTimeBroughtForward: null,
  flightTime: null,
  takeOff: null,
  landing: null,
};

/**
 * A flight before its acceptance: no entry, no data.
 * @param index the flight number in the logbook
 * @returns the flight
 */
function newFlight(index: number): LogbookFlight {
  return {
    index,
    crewEntries: NO_CREW_ENTRIES,
    signedInfo: null,
    preFlight: EMPTY_PRE_FLIGHT,
    postFlight: EMPTY_POST_FLIGHT,
    openItemsViewed: false,
    deferredItemsViewed: false,
    acceptance: 'not-accepted',
    acceptanceAcknowledged: false,
    closedAt: null,
    blockData: null,
  };
}

/**
 * A new logbook: controlled by the ground and without a maintenance release, so the first UPDATE takes it on board
 * @returns the logbook
 */
export function createTechLogbook(): TechLogbookState {
  return {
    version: 1,
    control: 'on-ground',
    lastSync: null,
    release: null,
    flight: newFlight(1),
    pastFlights: [],
    items: [],
  };
}

// ---- Formats ----

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Two digits with a leading zero.
 * @param n the number
 * @returns the digits
 */
function twoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The logbook date format, e.g. 19-FEB-09.
 * @param time ms since the epoch (UTC)
 * @returns the date, '---' without a date
 */
export function formatLogbookDate(time: number | null): string {
  if (time === null) {
    return '---';
  }
  const date = new Date(time);
  return `${twoDigits(date.getUTCDate())}-${MONTHS[date.getUTCMonth()]}-${twoDigits(date.getUTCFullYear() % 100)}`;
}

/**
 * The logbook date and time format, e.g. 18-FEB-09 18:04.
 * @param time ms since the epoch (UTC)
 * @returns the date and time, '---' without a date
 */
export function formatLogbookDateTime(time: number | null): string {
  if (time === null) {
    return '---';
  }
  return `${formatLogbookDate(time)} ${formatLogbookMinutes(minutesOfDay(time))}`;
}

/** Pounds per kilogram, as the weight unit setting of the aircraft converts */
const POUNDS_PER_KG = 2.204625;

/**
 * The fuel on board in the unit of the aircraft weight setting, as the COMPANY COM flight log shows it
 * @param kg the fuel on board, null when unknown
 * @param metric the weights are shown in kg
 * @returns tonnes (T) or thousands of pounds (KLB) with one decimal, '-----' when unknown
 */
export function logbookFuelText(kg: number | null, metric: boolean): string {
  if (kg === null) {
    return '-----';
  }
  return metric ? `${(kg / 1000).toFixed(1)} T` : `${((kg * POUNDS_PER_KG) / 1000).toFixed(1)} KLB`;
}

/**
 * A duration or a time of day as HH:MM (the hours can exceed 24 for total times).
 * @param minutes the minutes, null when unknown
 * @returns HH:MM, '-----' when unknown
 */
export function formatLogbookMinutes(minutes: number | null): string {
  if (minutes === null) {
    return '-----';
  }
  return `${twoDigits(Math.floor(minutes / 60))}:${twoDigits(minutes % 60)}`;
}

/**
 * Parses an HH:MM entry (HHMM, HH:MM or H:MM).
 * @param input the typed text
 * @param maxHours the highest hour accepted (23 for a time of day)
 * @returns the minutes, null for an empty entry, undefined for an invalid entry
 */
export function parseLogbookMinutes(input: string, maxHours: number): number | null | undefined {
  const text = input.trim();
  if (text === '') {
    return null;
  }
  const match = text.match(/^(\d{1,5}):?(\d{2})$/);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > maxHours) {
    return undefined;
  }
  return hours * 60 + minutes;
}

/**
 * The minutes after midnight UTC of a time.
 * @param time ms since the epoch (UTC)
 * @returns the minutes, null without a time
 */
export function minutesOfDay(time: number | null): number | null {
  if (time === null) {
    return null;
  }
  const date = new Date(time);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/**
 * The tail number: the registration without separators.
 * @param registration the aircraft registration
 * @returns the tail number
 */
function tailNumber(registration: string): string {
  return registration.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * The REF REPORT of a new item: the registration without separators, then the date and time (YYMMDDhhmmss) and L for
 * the technical logbook. A second item in the same second takes the next free second.
 * @param registration the aircraft registration
 * @param time ms since the epoch (UTC)
 * @param existingRefs the references already used
 * @returns the reference
 */
export function makeReportRef(registration: string, time: number, existingRefs: readonly string[]): string {
  const tail = tailNumber(registration);
  let t = Math.floor(time / 1000) * 1000;
  for (;;) {
    const d = new Date(t);
    const ref = `${tail}${twoDigits(d.getUTCFullYear() % 100)}${twoDigits(d.getUTCMonth() + 1)}${twoDigits(d.getUTCDate())}${twoDigits(d.getUTCHours())}${twoDigits(d.getUTCMinutes())}${twoDigits(d.getUTCSeconds())}L`;
    if (!existingRefs.includes(ref)) {
      return ref;
    }
    t += 1000;
  }
}

// ---- Lists and counts ----

/**
 * Sort order of the item tables: the last open item at the top.
 * @param a an item
 * @param b another item
 * @returns the sort order
 */
function byOpenDateNewestFirst(a: LogbookItem, b: LogbookItem): number {
  return b.openDate - a.openDate;
}

/**
 * The items of a list, newest first.
 * @param state the logbook
 * @param itemState the list
 * @returns the items
 */
export function itemsIn(state: TechLogbookState, itemState: LogbookItemState): LogbookItem[] {
  return state.items.filter((i) => i.state === itemState).sort(byOpenDateNewestFirst);
}

/**
 * The deferred items of a panel, the first expiry date at the top.
 * @param state the logbook
 * @param category MEL, CDL or OTHER
 * @returns the items
 */
export function deferredItems(state: TechLogbookState, category: LogbookDeferralCategory): LogbookItem[] {
  return state.items
    .filter((i) => i.state === 'deferred' && (i.deferral?.category ?? 'OTHER') === category)
    .sort((a, b) => {
      const ea = a.deferral?.expiryDate ?? Number.MAX_SAFE_INTEGER;
      const eb = b.deferral?.expiryDate ?? Number.MAX_SAFE_INTEGER;
      return ea - eb;
    });
}

/**
 * The deferred items of all panels: MEL, then CDL, then OTHER.
 * @param state the logbook
 * @returns the items
 */
function allDeferredItems(state: TechLogbookState): LogbookItem[] {
  return [...deferredItems(state, 'MEL'), ...deferredItems(state, 'CDL'), ...deferredItems(state, 'OTHER')];
}

/**
 * The EXPIRY DATE of a deferred item in the tables and the detailed report.
 * @param item the item
 * @returns the date, empty without a limit
 */
export function deferralExpiryText(item: LogbookItem): string {
  const expiryDate = item.deferral?.expiryDate ?? null;
  return expiryDate !== null ? formatLogbookDate(expiryDate) : '';
}

export interface LogbookItemCounts {
  readonly open: number;
  readonly deferred: number;
  readonly temporary: number;
  readonly cabinOpen: number;
}

/**
 * The counts of the TECHNICAL CONDITION and CABIN LOGBOOK buttons of the STATUS page.
 * @param state the logbook
 * @returns the counts
 */
export function itemCounts(state: TechLogbookState): LogbookItemCounts {
  const count = (s: LogbookItemState) => state.items.filter((i) => i.state === s).length;
  return {
    open: count('open'),
    deferred: count('deferred'),
    temporary: count('temporary'),
    cabinOpen: count('cabin-open'),
  };
}

// ---- Rules ----

/**
 * New data (flight data, defects) can be recorded only while the logbook is on board: a synchronisation from the
 * ground would erase what was entered while the ground had control.
 * @param state the logbook
 * @returns whether data can be recorded
 */
export function canRecordData(state: TechLogbookState): boolean {
  return state.control === 'on-board';
}

/**
 * Whether a maintenance release is valid: there is one and it has not expired.
 * @param state the logbook
 * @param now ms since the epoch (UTC)
 * @returns whether the release is valid
 */
export function hasValidRelease(state: TechLogbookState, now: number): boolean {
  return state.release !== null && (state.release.expiryDate === null || state.release.expiryDate > now);
}

/**
 * The information of a flight: the crew entries first, then what was signed at acceptance, then (for the open flight)
 * the FMS values. After acceptance only TO can still be changed.
 * @param flight the flight
 * @param avionics the FMS values and the date
 * @returns the information
 */
export function flightInfo(flight: LogbookFlight, avionics: LogbookAvionicsInfo): LogbookFlightInfo {
  const isOpen = flight.closedAt === null;
  const value = (field: LogbookInfoField): LogbookInfoValue => {
    const entry = flight.crewEntries[field];
    if (entry !== null) {
      return { value: entry, byCrew: true };
    }
    if (flight.signedInfo !== null) {
      return flight.signedInfo[field];
    }
    return { value: isOpen ? avionics[field] : null, byCrew: false };
  };
  const date = flight.crewEntries.date ?? flight.signedInfo?.date ?? (isOpen ? avionics.now : null);
  return { flightNumber: value('flightNumber'), from: value('from'), to: value('to'), date };
}

/**
 * Whether the flight crew can change a field of the information area: while the logbook is on board, before the
 * acceptance (afterwards only TO).
 * @param state the logbook
 * @param field the field, or 'date'
 * @returns whether the field can be changed
 */
export function canEditFlightInfo(state: TechLogbookState, field: LogbookInfoField | 'date'): boolean {
  return canRecordData(state) && (state.flight.acceptance === 'not-accepted' || field === 'to');
}

/**
 * Enters a field of the information area (null clears the crew entry, the FMS value applies again).
 * @param state the logbook
 * @param field the field
 * @param value the entry
 * @returns the logbook
 */
export function enterFlightInfo(
  state: TechLogbookState,
  field: LogbookInfoField,
  value: string | null,
): TechLogbookState {
  if (!canEditFlightInfo(state, field)) {
    return state;
  }
  const crewEntries: LogbookCrewEntries = { ...state.flight.crewEntries, [field]: value };
  return { ...state, flight: { ...state.flight, crewEntries } };
}

/**
 * Enters the date of flight.
 * @param state the logbook
 * @param date ms since the epoch (UTC), null for today
 * @returns the logbook
 */
export function enterFlightDate(state: TechLogbookState, date: number | null): TechLogbookState {
  if (!canEditFlightInfo(state, 'date')) {
    return state;
  }
  return { ...state, flight: { ...state.flight, crewEntries: { ...state.flight.crewEntries, date } } };
}

/**
 * Parses a date of flight entry: DDMMYY or DD-MMM-YY.
 * @param input the typed text
 * @returns ms since the epoch (UTC) at midnight, null for an empty entry, undefined for an invalid entry
 */
export function parseLogbookDate(input: string): number | null | undefined {
  const text = input.trim().toUpperCase();
  if (text === '') {
    return null;
  }
  let day: number;
  let month: number;
  let year: number;
  const numeric = text.match(/^(\d{2})(\d{2})(\d{2})$/);
  const named = text.match(/^(\d{1,2})-?([A-Z]{3})-?(\d{2})$/);
  if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]) - 1;
    year = 2000 + Number(numeric[3]);
  } else if (named) {
    day = Number(named[1]);
    month = MONTHS.indexOf(named[2]);
    year = 2000 + Number(named[3]);
  } else {
    return undefined;
  }
  if (month < 0 || month > 11 || day < 1) {
    return undefined;
  }
  const date = Date.UTC(year, month, day);
  if (new Date(date).getUTCDate() !== day) {
    return undefined;
  }
  return date;
}

/**
 * Updates the PRE-FLIGHT panel of the open flight.
 * @param state the logbook
 * @param changes the changed parameters
 * @returns the logbook
 */
export function enterPreFlight(state: TechLogbookState, changes: Partial<LogbookPreFlightData>): TechLogbookState {
  if (!canRecordData(state)) {
    return state;
  }
  return { ...state, flight: { ...state.flight, preFlight: { ...state.flight.preFlight, ...changes } } };
}

/**
 * Updates the POST-FLIGHT panel of the open flight.
 * @param state the logbook
 * @param changes the changed parameters
 * @returns the logbook
 */
export function enterPostFlight(state: TechLogbookState, changes: Partial<LogbookPostFlightData>): TechLogbookState {
  if (!canRecordData(state)) {
    return state;
  }
  return { ...state, flight: { ...state.flight, postFlight: { ...state.flight.postFlight, ...changes } } };
}

/**
 * The total time of a closed flight (brought forward plus flight time), carried to the next flight.
 * @param flight the closed flight
 * @returns minutes, null when unknown
 */
function totalTimeOf(flight: LogbookFlight): number | null {
  const post = flight.postFlight;
  return post.totalTimeBroughtForward !== null && post.flightTime !== null
    ? post.totalTimeBroughtForward + post.flightTime
    : null;
}

/**
 * The POST-FLIGHT values: the crew entries first, otherwise TOTAL TIME B/F from the previous flight and the flight
 * time, take-off and landing times from the flight log (OFF and ON). TOTAL TIME adds B/F and the flight time.
 * @param state the logbook
 * @param flight the flight shown
 * @param block the flight log values of the current flight
 * @returns the values
 */
export function effectivePostFlight(
  state: TechLogbookState,
  flight: LogbookFlight,
  block: LogbookBlockData,
): LogbookEffectivePostFlight {
  const post = flight.postFlight;
  const isOpen = flight.closedAt === null;
  const previous = state.pastFlights.find((f) => f.index < flight.index) ?? null;
  const pick = (entry: number | null, fallback: number | null): LogbookPostFlightValue =>
    entry !== null ? { value: entry, byCrew: true } : { value: isOpen ? fallback : null, byCrew: false };

  const totalTimeBroughtForward = pick(post.totalTimeBroughtForward, previous ? totalTimeOf(previous) : null);
  const flightTime = pick(post.flightTime, block.flightTime !== null ? Math.round(block.flightTime / 60_000) : null);
  const totalTime =
    totalTimeBroughtForward.value !== null && flightTime.value !== null
      ? totalTimeBroughtForward.value + flightTime.value
      : null;
  return {
    nilDefect: post.nilDefect,
    totalTimeBroughtForward,
    flightTime,
    totalTime,
    takeOff: pick(post.takeOff, minutesOfDay(block.offTime)),
    landing: pick(post.landing, minutesOfDay(block.onTime)),
  };
}

/**
 * Design choice: the mandatory PRE-FLIGHT parameters (amber when empty): the fuel uplift and the icing statement
 * (NIL or the de-icing start), which every flight needs on paper logbooks too.
 * @param pre the PRE-FLIGHT panel
 * @returns the names of the missing parameters
 */
export function missingPreFlight(pre: LogbookPreFlightData): string[] {
  const missing: string[] = [];
  if (pre.totalUplift === null) {
    missing.push('TOTAL UPLIFT');
  }
  if (!pre.noDeIcing && pre.deIcingStart === null) {
    missing.push('ICING');
  }
  return missing;
}

/**
 * Design choice: the mandatory POST-FLIGHT parameters: the take-off and landing times and the flight time (the flight
 * log fills them after a flight).
 * @param post the POST-FLIGHT values
 * @returns the names of the missing parameters
 */
export function missingPostFlight(post: LogbookEffectivePostFlight): string[] {
  const missing: string[] = [];
  if (post.flightTime.value === null) {
    missing.push('FLIGHT TIME');
  }
  if (post.landing.value === null) {
    missing.push('LANDING');
  }
  if (post.takeOff.value === null) {
    missing.push('TAKE OFF');
  }
  return missing;
}

// ---- Defects ----

/** Where a new defect goes */
export type LogbookStoreTarget = 'open' | 'temporary' | 'cabin-open';

export interface LogbookDefectEntry {
  readonly title: string;
  readonly ata: string;
  readonly pilotComment: string;
  readonly ecamAlertId?: string | null;
}

/**
 * Records a defect from an assistant (ECAM ALERTS, standard defects, FREE TEXT) in the open or temporary items.
 * @param state the logbook
 * @param entry the defect
 * @param target OPEN ITEMS (cannot be deleted) or TEMPORARY ITEMS (can be changed or deleted)
 * @param now ms since the epoch (UTC)
 * @param registration the aircraft registration, for the reference
 * @returns the logbook
 */
export function recordDefect(
  state: TechLogbookState,
  entry: LogbookDefectEntry,
  target: 'open' | 'temporary',
  now: number,
  registration: string,
): TechLogbookState {
  if (!canRecordData(state) || entry.title.trim() === '') {
    return state;
  }
  const item: LogbookItem = {
    ref: makeReportRef(
      registration,
      now,
      state.items.map((i) => i.ref),
    ),
    title: entry.title.trim(),
    ata: entry.ata,
    state: target,
    openDate: now,
    closeDate: null,
    pilotComment: entry.pilotComment.trim(),
    cabinComment: '',
    additionalInfo: '',
    lastMaintAction: '',
    sendStatus: 'not-sent',
    flightIndex: state.flight.index,
    ecamAlertId: entry.ecamAlertId ?? null,
    deferral: null,
  };
  return { ...state, items: [...state.items, item] };
}

/**
 * Validates or refuses a defect the cabin crew submitted: OPEN ITEMS makes it a technical open item, CABIN OPEN ITEMS
 * keeps it in the cabin logbook only.
 * @param state the logbook
 * @param ref the cabin item
 * @param target OPEN ITEMS or CABIN OPEN ITEMS
 * @param pilotComment the PILOT COMMENT
 * @returns the logbook
 */
export function validateCabinItem(
  state: TechLogbookState,
  ref: string,
  target: 'open' | 'cabin-open',
  pilotComment: string,
): TechLogbookState {
  if (!canRecordData(state)) {
    return state;
  }
  return updateItem(state, ref, 'cabin-submitted', (item) => ({
    ...item,
    state: target,
    pilotComment: pilotComment.trim(),
    flightIndex: state.flight.index,
  }));
}

/**
 * Changes one item, only while it is in the given list.
 * @param state the logbook
 * @param ref the item
 * @param requiredState the list the item must be in
 * @param change the change
 * @returns the logbook, the same one when nothing changed
 */
function updateItem(
  state: TechLogbookState,
  ref: string,
  requiredState: LogbookItemState,
  change: (item: LogbookItem) => LogbookItem,
): TechLogbookState {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.ref !== ref || item.state !== requiredState) {
      return item;
    }
    changed = true;
    return change(item);
  });
  return changed ? { ...state, items } : state;
}

/**
 * Changes the PILOT COMMENT: only a temporary item can be changed.
 * @param state the logbook
 * @param ref the item
 * @param pilotComment the comment
 * @returns the logbook
 */
export function changeTemporaryComment(state: TechLogbookState, ref: string, pilotComment: string): TechLogbookState {
  if (!canRecordData(state)) {
    return state;
  }
  return updateItem(state, ref, 'temporary', (item) => ({ ...item, pilotComment: pilotComment.trim() }));
}

/**
 * DELETE ITEM of the TEMPORARY ITEMS page.
 * @param state the logbook
 * @param ref the item
 * @returns the logbook
 */
export function deleteTemporaryItem(state: TechLogbookState, ref: string): TechLogbookState {
  if (!canRecordData(state)) {
    return state;
  }
  return { ...state, items: state.items.filter((i) => !(i.ref === ref && i.state === 'temporary')) };
}

/**
 * STORE IN OPEN ITEMS of the TEMPORARY ITEMS page, with the current PILOT COMMENT.
 * @param state the logbook
 * @param ref the item
 * @param pilotComment the comment
 * @returns the logbook
 */
export function storeTemporaryInOpen(state: TechLogbookState, ref: string, pilotComment: string): TechLogbookState {
  if (!canRecordData(state)) {
    return state;
  }
  return updateItem(state, ref, 'temporary', (item) => ({ ...item, state: 'open', pilotComment: pilotComment.trim() }));
}

/**
 * Changes ADDITIONAL INFO: the only field of an open item that can still be changed (e.g. to cancel a wrong entry).
 * @param state the logbook
 * @param ref the item
 * @param additionalInfo the text
 * @returns the logbook
 */
export function changeAdditionalInfo(state: TechLogbookState, ref: string, additionalInfo: string): TechLogbookState {
  if (!canRecordData(state)) {
    return state;
  }
  return updateItem(state, ref, 'open', (item) => ({ ...item, additionalInfo: additionalInfo.trim() }));
}

/**
 * SEND of open items: each one goes to SENDING... until the ground acknowledges it. An item already received by the
 * ground is not sent again.
 * @param state the logbook
 * @param refs the ticked items
 * @returns the logbook and the items actually sent
 */
export function startSending(
  state: TechLogbookState,
  refs: readonly string[],
): { state: TechLogbookState; sent: string[] } {
  const sent: string[] = [];
  const items = state.items.map((item): LogbookItem => {
    if (item.state !== 'open' || !refs.includes(item.ref) || item.sendStatus === 'sent') {
      return item;
    }
    sent.push(item.ref);
    return { ...item, sendStatus: 'sending' };
  });
  return { state: sent.length > 0 ? { ...state, items } : state, sent };
}

/**
 * The end of a SEND: SENT with the ground acknowledgement, otherwise NOT SENT.
 * @param state the logbook
 * @param refs the items sent
 * @param acknowledged whether the ground acknowledged them
 * @returns the logbook
 */
export function completeSending(
  state: TechLogbookState,
  refs: readonly string[],
  acknowledged: boolean,
): TechLogbookState {
  return {
    ...state,
    items: state.items.map((item) =>
      refs.includes(item.ref) && item.sendStatus === 'sending'
        ? { ...item, sendStatus: acknowledged ? 'sent' : 'not-sent' }
        : item,
    ),
  };
}

/**
 * Marks the OPEN ITEMS or DEFERRED ITEMS page as displayed, which the acceptance checks.
 * @param state the logbook
 * @param list the list displayed
 * @returns the logbook
 */
export function markListViewed(state: TechLogbookState, list: 'open' | 'deferred'): TechLogbookState {
  if (list === 'open') {
    return state.flight.openItemsViewed ? state : { ...state, flight: { ...state.flight, openItemsViewed: true } };
  }
  return state.flight.deferredItemsViewed
    ? state
    : { ...state, flight: { ...state.flight, deferredItemsViewed: true } };
}

// ---- Acceptance ----

export type LogbookAcceptanceProblem =
  | 'logbook-on-ground'
  | 'no-valid-release'
  | 'open-items-not-viewed'
  | 'deferred-items-not-viewed'
  | 'flight-info-missing'
  | 'preflight-data-missing';

/**
 * What PIC ACCEPT checks before the acceptance report: the open and deferred items were displayed (when there are
 * any), a valid maintenance release, the flight information and the mandatory PRE-FLIGHT parameters.
 * @param state the logbook
 * @param avionics the FMS values and the date
 * @returns the problems, empty when the aircraft can be accepted
 */
export function acceptanceProblems(state: TechLogbookState, avionics: LogbookAvionicsInfo): LogbookAcceptanceProblem[] {
  const problems: LogbookAcceptanceProblem[] = [];
  const counts = itemCounts(state);
  if (state.control !== 'on-board') {
    problems.push('logbook-on-ground');
  }
  if (!hasValidRelease(state, avionics.now)) {
    problems.push('no-valid-release');
  }
  if (counts.open > 0 && !state.flight.openItemsViewed) {
    problems.push('open-items-not-viewed');
  }
  if (counts.deferred > 0 && !state.flight.deferredItemsViewed) {
    problems.push('deferred-items-not-viewed');
  }
  const info = flightInfo(state.flight, avionics);
  if (!info.flightNumber.value || !info.from.value || !info.to.value || info.date === null) {
    problems.push('flight-info-missing');
  }
  if (missingPreFlight(state.flight.preFlight).length > 0) {
    problems.push('preflight-data-missing');
  }
  return problems;
}

export interface LogbookReportItem {
  readonly type: string;
  readonly reference: string;
  readonly deferredLimit: string;
  readonly rectificationInterval: string;
  readonly severity: string;
  readonly title: string;
  readonly ata: string;
  readonly report: string;
}

export interface AcceptanceReport {
  readonly flightNumber: string;
  readonly tail: string;
  readonly from: string;
  readonly to: string;
  readonly date: string;
  readonly utc: string;
  readonly releaseValid: boolean;
  readonly releaseDate: string;
  /** The deferred items and the open items the PIC accepts */
  readonly items: readonly LogbookReportItem[];
}

/**
 * The block of an item in the acceptance report.
 * @param item the item
 * @returns the block
 */
function reportItem(item: LogbookItem): LogbookReportItem {
  return {
    type: 'DEFECT',
    reference: item.deferral?.reference ?? '',
    deferredLimit: item.deferral ? formatLogbookDate(item.deferral.expiryDate) : '',
    rectificationInterval: item.deferral?.rectificationInterval ?? '',
    severity: item.deferral?.severity ?? '',
    title: item.title,
    ata: item.ata,
    report: item.ref,
  };
}

/**
 * The AIRCRAFT ACCEPTANCE REPORT the PIC signs.
 * @param state the logbook
 * @param avionics the FMS values and the date
 * @param registration the aircraft registration
 * @returns the report
 */
export function acceptanceReport(
  state: TechLogbookState,
  avionics: LogbookAvionicsInfo,
  registration: string,
): AcceptanceReport {
  const info = flightInfo(state.flight, avionics);
  return {
    flightNumber: info.flightNumber.value ?? '',
    tail: tailNumber(registration),
    from: info.from.value ?? '',
    to: info.to.value ?? '',
    date: formatLogbookDate(info.date),
    utc: formatLogbookMinutes(minutesOfDay(avionics.now)),
    releaseValid: hasValidRelease(state, avionics.now),
    releaseDate: formatLogbookDate(state.release?.date ?? null),
    items: [...allDeferredItems(state), ...itemsIn(state, 'open')].map(reportItem),
  };
}

/**
 * SIGN of the acceptance report (after the electronic signature): the flight is open with the signed information,
 * and the synchronisation with the ground starts.
 * @param state the logbook
 * @param avionics the FMS values and the date
 * @returns the logbook
 */
export function signAcceptance(state: TechLogbookState, avionics: LogbookAvionicsInfo): TechLogbookState {
  if (acceptanceProblems(state, avionics).length > 0 || state.flight.acceptance !== 'not-accepted') {
    return state;
  }
  const signedInfo = flightInfo(state.flight, avionics);
  return {
    ...state,
    flight: {
      ...state.flight,
      signedInfo,
      crewEntries: NO_CREW_ENTRIES,
      acceptance: 'syncing',
    },
  };
}

/**
 * The end of the acceptance synchronisation: the aircraft is accepted, with or without the ground acknowledgement
 * (without it, the crew prints the logbook for maintenance before push-back).
 * @param state the logbook
 * @param acknowledged whether the ground acknowledged the acceptance report
 * @param now ms since the epoch (UTC)
 * @returns the logbook
 */
export function completeAcceptance(state: TechLogbookState, acknowledged: boolean, now: number): TechLogbookState {
  if (state.flight.acceptance !== 'syncing') {
    return state;
  }
  return {
    ...state,
    lastSync: acknowledged ? now : state.lastSync,
    flight: { ...state.flight, acceptance: 'accepted', acceptanceAcknowledged: acknowledged },
  };
}

// ---- ECAM alerts ----

/** An ECAM alert that appeared on the EWD during the flight */
export interface EcamAlertOccurrence {
  readonly id: string;
  readonly title: string;
  /** ms since the epoch (UTC) */
  readonly time: number;
}

/**
 * The alerts that appeared since the previous list of active alerts: an alert that comes back appears again.
 * @param previousIds the active alert ids before
 * @param currentIds the active alert ids now
 * @returns the new ids
 */
export function appearedEcamAlerts(previousIds: readonly string[], currentIds: readonly string[]): string[] {
  return currentIds.filter((id) => !previousIds.includes(id));
}

/**
 * The alert title as the logbook lists it: the EWD title without its colour and underline codes.
 * @param ewdTitle the EWD title
 * @returns the title
 */
export function ecamAlertTitle(ewdTitle: string): string {
  return (
    ewdTitle
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[^m]*m/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
  );
}

/**
 * The ATA chapter of an ECAM alert: the alert ids start with the chapter (e.g. 24... for ELEC).
 * @param id the alert id
 * @returns the ATA, e.g. 24-00-00, empty when unknown
 */
export function ecamAlertAta(id: string): string {
  return /^\d{2}/.test(id) ? `${id.substring(0, 2)}-00-00` : '';
}

/**
 * The alerts of the flight that no item records yet, newest first, each alert once.
 * @param state the logbook
 * @param occurrences the alerts of the flight, newest first
 * @returns the alerts not recorded
 */
export function unrecordedEcamAlerts(
  state: TechLogbookState,
  occurrences: readonly EcamAlertOccurrence[],
): EcamAlertOccurrence[] {
  const recorded = state.items
    .filter((i) => i.flightIndex === state.flight.index && i.ecamAlertId !== null)
    .map((i) => i.ecamAlertId);
  const seen: string[] = [];
  return occurrences.filter((o) => {
    if (recorded.includes(o.id) || seen.includes(o.id)) {
      return false;
    }
    seen.push(o.id);
    return true;
  });
}

// ---- Flight closure ----

export interface LogbookClosureFindings {
  /** Cabin defects submitted to the flight crew and not yet validated or refused: closure is not possible */
  readonly cabinItemsToValidate: readonly LogbookItem[];
  readonly unrecordedEcamAlerts: readonly EcamAlertOccurrence[];
  /** Deleted with the closure */
  readonly temporaryItems: readonly LogbookItem[];
  readonly missingPostFlight: readonly string[];
}

/**
 * What CLOSE FLIGHT checks: cabin entries not validated, ECAM alerts not recorded, temporary items (deleted by the
 * closure) and the mandatory POST-FLIGHT parameters.
 * @param state the logbook
 * @param occurrences the ECAM alerts of the flight
 * @param block the flight log values
 * @returns the findings
 */
export function closureFindings(
  state: TechLogbookState,
  occurrences: readonly EcamAlertOccurrence[],
  block: LogbookBlockData,
): LogbookClosureFindings {
  return {
    cabinItemsToValidate: itemsIn(state, 'cabin-submitted'),
    unrecordedEcamAlerts: unrecordedEcamAlerts(state, occurrences),
    temporaryItems: itemsIn(state, 'temporary'),
    missingPostFlight: missingPostFlight(effectivePostFlight(state, state.flight, block)),
  };
}

/**
 * Whether CLOSE FLIGHT is possible: after the acceptance, logbook on board, no cabin entry left to validate.
 * @param state the logbook
 * @returns whether the flight can be closed
 */
export function canCloseFlight(state: TechLogbookState): boolean {
  return (
    state.flight.acceptance === 'accepted' && canRecordData(state) && itemsIn(state, 'cabin-submitted').length === 0
  );
}

/**
 * SIGN of the flight closure report: the temporary items are deleted, the flight keeps its information, flight data
 * and flight log values, and the next flight starts (it opens at the next acceptance).
 * @param state the logbook
 * @param avionics the FMS values and the date
 * @param block the flight log values
 * @returns the logbook
 */
export function closeFlight(
  state: TechLogbookState,
  avionics: LogbookAvionicsInfo,
  block: LogbookBlockData,
): TechLogbookState {
  if (!canCloseFlight(state)) {
    return state;
  }
  const post = effectivePostFlight(state, state.flight, block);
  const closed: LogbookFlight = {
    ...state.flight,
    signedInfo: flightInfo(state.flight, avionics),
    crewEntries: NO_CREW_ENTRIES,
    postFlight: {
      nilDefect: post.nilDefect,
      totalTimeBroughtForward: post.totalTimeBroughtForward.value,
      flightTime: post.flightTime.value,
      takeOff: post.takeOff.value,
      landing: post.landing.value,
    },
    closedAt: avionics.now,
    blockData: block,
  };
  return {
    ...state,
    flight: newFlight(state.flight.index + 1),
    pastFlights: [closed, ...state.pastFlights].slice(0, LOGBOOK_PAST_FLIGHTS_KEPT),
    items: state.items.filter((i) => i.state !== 'temporary'),
  };
}

// ---- Synchronisation with the ground ----

/**
 * GIVE BACK TO GROUND: the ground station takes the control (the crew can still read the logbook).
 * @param state the logbook
 * @param now ms since the epoch (UTC)
 * @returns the logbook
 */
export function giveBackToGround(state: TechLogbookState, now: number): TechLogbookState {
  return { ...state, control: 'on-ground', lastSync: now };
}

/**
 * The LAST MAINT ACTION of an item maintenance deferred.
 * @param deferral the deferral
 * @returns the action
 */
export function deferralMaintAction(deferral: Pick<LogbookDeferral, 'category' | 'reference'>): string {
  return deferral.category === 'OTHER'
    ? 'DEFERRED BY MAINTENANCE'
    : `DEFERRED IAW ${deferral.category} ${deferral.reference}`;
}

/**
 * @param now ms since the epoch (UTC), the time of the deferral
 * @param days the days the item may stay open after the day of its deferral
 * @returns the end of the last day, ms since the epoch (UTC)
 */
function deferralExpiryDate(now: number, days: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days, 23, 59, 59, 999);
}

/**
 * The end of an UPDATE while the ground has control. The simulated ground maintenance handles the open items reported
 * in the closed flights: it defers some (the item is closed in the HISTORY and a new item with the MEL or CDL data
 * enters DEFERRED ITEMS) and rectifies the others, as it rectifies the deferred items past their expiry date. The
 * closed items also go to the REPORTS panel. It then releases the aircraft and the logbook is on board.
 * @param state the logbook
 * @param now ms since the epoch (UTC)
 * @param registration the aircraft registration, for the references of the deferred items
 * @returns the logbook
 */
export function completeGroundUpdate(state: TechLogbookState, now: number, registration: string): TechLogbookState {
  const closedRefs: string[] = [];
  const newDeferredItems: LogbookItem[] = [];
  const refs = state.items.map((item) => item.ref);
  const updatedItems = state.items.map((item): LogbookItem => {
    const reportedInClosedFlight = item.state === 'open' && item.flightIndex < state.flight.index;
    const expiryDate = item.state === 'deferred' ? item.deferral?.expiryDate ?? null : null;
    if (!reportedInClosedFlight && (expiryDate === null || now <= expiryDate)) {
      return item;
    }
    closedRefs.push(item.ref);
    const rule = reportedInClosedFlight ? groundDeferralRule(item.ata) : null;
    if (rule === null) {
      return { ...item, state: 'closed', closeDate: now, lastMaintAction: GROUND_RECTIFICATION_ACTION };
    }
    // Design choice: the MEL or CDL item is the first one of the ATA section of the defect
    const deferral: LogbookDeferral = {
      category: rule.category,
      classification: rule.classification,
      reference: rule.category === 'OTHER' ? '' : `${item.ata.substring(0, 5)}-01`,
      expiryDate:
        rule.rectificationInterval === ''
          ? null
          : deferralExpiryDate(now, RECTIFICATION_INTERVAL_DAYS[rule.rectificationInterval]),
      rectificationInterval: rule.rectificationInterval,
      severity: rule.severity,
    };
    const lastMaintAction = deferralMaintAction(deferral);
    const ref = makeReportRef(registration, now, refs);
    refs.push(ref);
    newDeferredItems.push({
      ...item,
      ref,
      state: 'deferred',
      openDate: now,
      closeDate: null,
      lastMaintAction,
      deferral,
    });
    return { ...item, state: 'closed', closeDate: now, lastMaintAction };
  });
  const items = [...updatedItems, ...newDeferredItems];
  const closedItems = items.filter((i) => i.state === 'closed').sort((a, b) => (b.closeDate ?? 0) - (a.closeDate ?? 0));
  const droppedRefs = closedItems.slice(LOGBOOK_HISTORY_ITEMS_KEPT).map((i) => i.ref);
  return {
    ...state,
    control: 'on-board',
    lastSync: now,
    release: { date: now, expiryDate: null, closedItemRefs: closedRefs, parameters: RELEASE_PARAMETERS },
    items: items.filter((i) => !droppedRefs.includes(i.ref)),
  };
}

// ---- Persistence ----

/**
 * Reads a stored logbook.
 * @param text the stored JSON
 * @returns the logbook, null when the text is not a logbook of this version
 */
export function parseTechLogbook(text: string | undefined | null): TechLogbookState | null {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      parsed.version !== 1 ||
      (parsed.control !== 'on-board' && parsed.control !== 'on-ground') ||
      !Array.isArray(parsed.items) ||
      !Array.isArray(parsed.pastFlights) ||
      typeof parsed.flight !== 'object' ||
      parsed.flight === null ||
      typeof parsed.flight.index !== 'number'
    ) {
      return null;
    }
    return parsed as TechLogbookState;
  } catch (_e) {
    return null;
  }
}

// ---- Printouts ----

/**
 * The STATUS page printout.
 * @param state the logbook
 * @param avionics the FMS values and the date
 * @param registration the aircraft registration
 * @returns the text
 */
export function statusPrintText(state: TechLogbookState, avionics: LogbookAvionicsInfo, registration: string): string {
  const info = flightInfo(state.flight, avionics);
  const counts = itemCounts(state);
  const titles = (items: LogbookItem[]) => items.map((i) => `  ${formatLogbookDate(i.openDate)} ${i.title}`);
  const lines = [
    'TECHNICAL LOGBOOK - STATUS',
    '',
    state.control === 'on-board'
      ? 'LOGBOOK ON BOARD'
      : `LOGBOOK ON GROUND - LAST UPDATE : ${formatLogbookDateTime(state.lastSync)}`,
    `ACFT REGISTRATION : ${registration}`,
    `FLT NBR : ${info.flightNumber.value ?? ''}`,
    `FROM : ${info.from.value ?? ''}   TO : ${info.to.value ?? ''}`,
    `DATE : ${formatLogbookDate(info.date)}`,
    '',
    `OPEN ITEMS : ${counts.open}`,
    ...titles(itemsIn(state, 'open')),
    `DEFERRED ITEMS : ${counts.deferred}`,
    ...titles(allDeferredItems(state)),
    `TEMPORARY ITEMS : ${counts.temporary}`,
    ...titles(itemsIn(state, 'temporary')),
    `CABIN OPEN ITEMS : ${counts.cabinOpen}`,
    ...titles(itemsIn(state, 'cabin-open')),
    '',
    hasValidRelease(state, avionics.now)
      ? `MAINTENANCE RELEASE : ${formatLogbookDateTime(state.release?.date ?? null)}`
      : 'NO VALID MAINTENANCE RELEASE',
  ];
  if (state.flight.acceptance === 'accepted') {
    lines.push('AIRCRAFT ACCEPTED');
  }
  return lines.join('\n');
}

/**
 * The AIRCRAFT ACCEPTANCE REPORT printout.
 * @param report the report
 * @returns the text
 */
export function acceptanceReportPrintText(report: AcceptanceReport): string {
  const lines = [
    'AIRCRAFT ACCEPTANCE REPORT',
    '',
    `FLIGHT NUMBER : ${report.flightNumber}   TAIL NUMBER : ${report.tail}`,
    `FROM : ${report.from}   TO : ${report.to}`,
    `DATE : ${report.date}   UTC : ${report.utc}`,
    `CERTIFICATE OF RELEASE TO SERVICE : ${report.releaseValid ? 'VALID' : 'NOT VALID'}   DATE : ${report.releaseDate}`,
  ];
  for (const item of report.items) {
    lines.push(
      '',
      'ACCEPTED ITEM :',
      `TYPE : ${item.type}   MEL/CDL REF : ${item.reference}`,
      `DEFERRED LIMIT : ${item.deferredLimit}   RECTIFICATION INTERVAL : ${item.rectificationInterval}   SEVERITY : ${item.severity}`,
      `TITLE : ${item.title}`,
      `ATA : ${item.ata}`,
      `REPORT : ${item.report}`,
    );
  }
  return lines.join('\n');
}

/**
 * The FLIGHT DATA printout: the information and the PRE-FLIGHT and POST-FLIGHT panels of a flight.
 * @param flight the flight
 * @param info its information
 * @param post its POST-FLIGHT values
 * @returns the text
 */
export function flightDataPrintText(
  flight: LogbookFlight,
  info: LogbookFlightInfo,
  post: LogbookEffectivePostFlight,
): string {
  const pre = flight.preFlight;
  return [
    'TECHNICAL LOGBOOK - FLIGHT DATA',
    '',
    `FLT NBR : ${info.flightNumber.value ?? ''}   DATE : ${formatLogbookDate(info.date)}`,
    `FROM : ${info.from.value ?? ''}   TO : ${info.to.value ?? ''}`,
    '',
    'PRE-FLIGHT',
    `FUEL RECEIPT NUMBER : ${pre.receiptNumber ?? ''}`,
    `FUEL SUPPLIER : ${pre.fuelSupplier ?? ''}`,
    `TOTAL UPLIFT : ${pre.totalUplift ?? ''} LTRS`,
    `ICING : ${pre.noDeIcing ? 'NIL (NO DE-ICING)' : `DE-ICING STARTED ${formatLogbookMinutes(pre.deIcingStart)}`}`,
    '',
    'POST-FLIGHT',
    `NIL DEFECT : ${post.nilDefect ? 'YES' : 'NO'}`,
    `TOTAL TIME B/F : ${formatLogbookMinutes(post.totalTimeBroughtForward.value)} HOURS`,
    `FLIGHT TIME : ${formatLogbookMinutes(post.flightTime.value)}`,
    `TOTAL TIME : ${formatLogbookMinutes(post.totalTime)} HOURS`,
    `TAKE OFF : ${formatLogbookMinutes(post.takeOff.value)} Z   LANDING : ${formatLogbookMinutes(post.landing.value)} Z`,
  ].join('\n');
}
