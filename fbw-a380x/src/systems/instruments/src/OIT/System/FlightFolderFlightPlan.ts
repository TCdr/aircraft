// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { INavlogFix, ISimbriefData } from '@flybywiresim/fbw-sdk';
import { oisTime } from './OisDateTime';

/*
 * The flight plan document of the electronic flight folder: the OFP laid out as the FMS INIT, FLT INFO, ALTN and NAV LOG
 * panels. Weights are kept in kg whatever the OFP units are, and shown in the unit of the aircraft (tonnes or klb).
 * The crew's Update entries sit beside the OFP estimates: a crew entry is shown in cyan, a value computed from the
 * entries in green.
 */

const KG_PER_LB = 0.45359237;

export type EffFuelKey = 'trip' | 'rteRsv' | 'etops' | 'altn' | 'final' | 'addnl' | 'xtr' | 'tof' | 'taxi';

/** The fuel lines that add up to the take-off fuel: the others (TOF itself, TAXI) are not part of the sum */
export const EFF_FUEL_SUM_KEYS: readonly EffFuelKey[] = ['trip', 'rteRsv', 'etops', 'altn', 'final', 'addnl', 'xtr'];

export type EffLoadKey = 'dow' | 'pld' | 'zfw' | 'tof' | 'tow' | 'ebo' | 'lw';

export interface EffFuelLine {
  /** What the OFP plans, kg; null when the OFP has no value for the line */
  readonly estimateKg: number | null;
  /** The time the fuel lasts, s */
  readonly timeS: number | null;
  /** The distance of the line, nm in the air */
  readonly airNm: number | null;
}

export interface EffAltnRow {
  readonly icao: string;
  readonly airNm: number | null;
  readonly groundNm: number | null;
  readonly flightLevel: number | null;
  readonly timeS: number | null;
  readonly fuelKg: number | null;
}

/** A waypoint of the NAV LOG as the OFP plans it */
export interface EffNavLogRow {
  readonly ident: string;
  readonly airway: string;
  /** The minimum off-route altitude, hundreds of feet */
  readonly moraHundredFeet: number | null;
  /** The time of the leg ending at the waypoint, s */
  readonly legS: number | null;
  /** The time from the departure to the waypoint, s */
  readonly cumS: number | null;
  readonly etaMs: number | null;
  readonly efobKg: number | null;
  readonly efuKg: number | null;
  /** Where the waypoint is, degrees; null when the OFP has no position for it */
  readonly latitudeDeg: number | null;
  readonly longitudeDeg: number | null;
}

/** What the flight follow-up recorded at a waypoint: from the avionics, or typed by the crew who has the master status */
export interface EffNavLogActual {
  ataMs: number | null;
  afobKg: number | null;
  afuKg: number | null;
}

/** A waypoint the crew added with NEXT WPT: it comes right after another waypoint of the log */
export interface EffInsertedWaypoint {
  readonly key: string;
  readonly ident: string;
  readonly afterKey: string;
}

/**
 * The flight follow-up of the navigation log. The rows are named by a key: W followed by the index of the OFP waypoint,
 * and I followed by a number for the waypoints the crew inserted.
 */
export interface EffNavLogFollowUp {
  inserted: EffInsertedWaypoint[];
  /** How many waypoints were inserted: a deleted waypoint does not give its key again */
  insertedCount: number;
  /** NEXT WPT inside the flight plan: the key of the initial waypoint and the key of the waypoint to go to */
  directTo: Record<string, string>;
  actuals: Record<string, EffNavLogActual>;
  /** The rows the crew checked with FUEL CHK: their data are saved */
  checked: Record<string, boolean>;
  /** The remarks of the FLT REPORT panel */
  remarks: string;
}

/** What the crew entered in the Update column of the panels, kg */
export interface EffCrewUpdates {
  fuel: Partial<Record<EffFuelKey, number>>;
  load: Partial<Record<EffLoadKey, number>>;
  /** The alternate fuel update of each ALTN row */
  altnFuel: (number | undefined)[];
}

export interface EffFlightPlan {
  readonly planNumber: string | null;
  readonly generatedMs: number | null;
  readonly registration: string;
  readonly aircraftType: string;
  readonly flightNumber: string;
  readonly fromIcao: string;
  readonly fromIata: string;
  readonly toIcao: string;
  readonly toIata: string;
  readonly altnIcao: string;
  readonly altnIata: string;
  /** The company route name, the city pair codes without any other */
  readonly companyRoute: string;
  /** Departure, route and destination as one string */
  readonly route: string;
  readonly groundNm: number | null;
  readonly airNm: number | null;
  readonly etdMs: number | null;
  readonly cruiseFlightLevel: number | null;
  readonly cruiseTempC: number | null;
  readonly costIndex: number | null;
  readonly avgDisaC: number | null;
  /** Positive: tail wind, kt */
  readonly tripWindKt: number | null;
  /** The average tropopause, feet */
  readonly tropopauseFeet: number | null;
  readonly cruiseMach: number | null;
  readonly sid: string;
  readonly flightTimeS: number | null;
  readonly regulationRsvPercent: number | null;
  readonly fuel: Readonly<Record<EffFuelKey, EffFuelLine>>;
  readonly load: Readonly<Record<EffLoadKey, number | null>>;
  readonly maxStruct: Readonly<Record<'zfw' | 'tow' | 'lw', number | null>>;
  readonly altnRows: readonly EffAltnRow[];
  readonly navLog: readonly EffNavLogRow[];
  /** The time the plan counts the navigation log from, unix ms */
  readonly baseMs: number | null;
  readonly updates: EffCrewUpdates;
  readonly followUp: EffNavLogFollowUp;
}

/** @returns a flight follow-up with nothing recorded */
function emptyFollowUp(): EffNavLogFollowUp {
  return { inserted: [], insertedCount: 0, directTo: {}, actuals: {}, checked: {}, remarks: '' };
}

/**
 * @param followUp a flight follow-up
 * @returns a copy that shares nothing with it
 */
export function copyFollowUp(followUp: EffNavLogFollowUp): EffNavLogFollowUp {
  const actuals: Record<string, EffNavLogActual> = {};
  Object.keys(followUp.actuals).forEach((key) => {
    actuals[key] = { ...followUp.actuals[key] };
  });
  return {
    inserted: followUp.inserted.map((waypoint) => ({ ...waypoint })),
    insertedCount: followUp.insertedCount,
    directTo: { ...followUp.directTo },
    actuals,
    checked: { ...followUp.checked },
    remarks: followUp.remarks,
  };
}

/**
 * @param target the follow-up of a plan, which keeps its identity
 * @param source what it takes over
 */
export function replaceFollowUp(target: EffNavLogFollowUp, source: EffNavLogFollowUp): void {
  Object.assign(target, copyFollowUp(source));
}

/**
 * @param value an OFP field, a number or a numeric text
 * @returns the number, null when the field is missing or not numeric
 */
function num(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param value an OFP weight field
 * @param units the units of the OFP, kgs or lbs
 * @returns the weight in kg, null when the field is missing
 */
function kg(value: unknown, units: string): number | null {
  const n = num(value);
  if (n === null) {
    return null;
  }
  return units === 'lbs' ? n * KG_PER_LB : n;
}

/**
 * @param altitudeFeet a pressure altitude
 * @returns the ISA temperature there, deg C
 */
export function isaTemperatureC(altitudeFeet: number): number {
  return altitudeFeet <= 36089 ? 15 - 1.98 * (altitudeFeet / 1000) : -56.5;
}

/**
 * A fuel line the OFP does not plan is blank, not 0.0.
 * @param value a weight, null for none
 * @returns the weight, null when it is 0
 */
function nonZero(value: number | null): number | null {
  return value === 0 ? null : value;
}

/**
 * @param estimateKg what the OFP plans, kg
 * @param timeS the time the fuel lasts, s
 * @param airNm the distance in the air, nm
 * @returns the fuel line
 */
function fuelLine(estimateKg: number | null, timeS: number | null = null, airNm: number | null = null): EffFuelLine {
  return { estimateKg, timeS, airNm };
}

/**
 * The first waypoint of the departure procedure: its airway field is the name of the departure
 * @param navlog the OFP waypoints
 * @returns the name of the SID, empty when the OFP has none
 */
function sidName(navlog: readonly INavlogFix[]): string {
  const sidFix = navlog.find((fix) => fix.is_sid_star === '1' && fix.via_airway && fix.via_airway !== 'DCT');
  return sidFix?.via_airway ?? '';
}

/**
 * The tonnes (or thousand pounds) shown in the panels carry one decimal; a MORA of the OFP in feet is shown in hundreds
 * of feet, as the navigation log prints it. Design choice: an OFP value of 1000 or more is taken as feet.
 * @param mora the OFP field
 * @returns the MORA in hundreds of feet
 */
function moraHundredFeet(mora: unknown): number | null {
  const n = num(mora);
  if (n === null) {
    return null;
  }
  return n >= 1000 ? Math.round(n / 100) : n;
}

/**
 * @param ofp the OFP
 * @returns the flight plan document of its electronic flight folder
 */
export function buildFlightPlan(ofp: ISimbriefData): EffFlightPlan {
  const units = typeof ofp.units === 'string' ? ofp.units : 'kgs';
  const navlog: readonly INavlogFix[] = Array.isArray(ofp.navlog) ? ofp.navlog : [];
  const scheduledOutS = num(ofp.times?.schedOut);
  const offS = num(ofp.times?.estOff);
  const baseMs = offS !== null && offS > 0 ? offS * 1000 : scheduledOutS !== null ? scheduledOutS * 1000 : null;
  const cruiseAltitudeFeet = num(ofp.cruiseAltitude);
  const trip = kg(ofp.fuel?.enrouteBurn, units);
  const contingency = kg(ofp.fuel?.contingency, units);
  const altnFuelKg = kg(ofp.alternate?.burn, units);
  const alternates =
    Array.isArray(ofp.alternates) && ofp.alternates.length > 0 ? ofp.alternates : [ofp.alternate?.icao];
  const payload = kg(ofp.weights?.payload, units);
  const zfw = kg(ofp.weights?.estZeroFuelWeight, units);
  const oew = kg(ofp.weights?.oew, units) ?? (zfw !== null && payload !== null ? zfw - payload : null);

  return {
    planNumber: ofp.planNumber ?? null,
    generatedMs: typeof ofp.generatedTime === 'number' ? ofp.generatedTime * 1000 : null,
    registration: ofp.aircraftReg ?? '',
    aircraftType: ofp.aircraftIcao ?? '',
    flightNumber: `${typeof ofp.airline === 'string' ? ofp.airline : ''}${ofp.flightNumber ?? ''}`,
    fromIcao: ofp.origin?.icao ?? '',
    fromIata: ofp.origin?.iata ?? '',
    toIcao: ofp.destination?.icao ?? '',
    toIata: ofp.destination?.iata ?? '',
    altnIcao: ofp.alternate?.icao ?? '',
    altnIata: ofp.alternate?.iata ?? '',
    companyRoute: `${ofp.origin?.iata ?? ''}${ofp.destination?.iata ?? ''}`,
    route: [ofp.origin?.icao, ofp.route, ofp.destination?.icao].filter((part) => part).join(' '),
    groundNm: ofp.groundDistance ?? null,
    airNm: ofp.airDistance ?? num(parseFloat(ofp.distance)),
    etdMs: scheduledOutS !== null && scheduledOutS > 0 ? scheduledOutS * 1000 : null,
    cruiseFlightLevel: cruiseAltitudeFeet !== null ? Math.round(cruiseAltitudeFeet / 100) : null,
    cruiseTempC:
      cruiseAltitudeFeet !== null && ofp.avgTempDev !== undefined
        ? Math.round(isaTemperatureC(cruiseAltitudeFeet) + ofp.avgTempDev)
        : null,
    costIndex: num(ofp.costIndex),
    avgDisaC: ofp.avgTempDev ?? null,
    tripWindKt: ofp.avgWindComp ?? null,
    tropopauseFeet: num(ofp.averageTropopause),
    cruiseMach: ofp.cruiseMach ?? null,
    sid: sidName(navlog),
    flightTimeS: num(ofp.times?.estTimeEnroute),
    regulationRsvPercent: trip !== null && contingency !== null && trip > 0 ? contingency / trip : null,
    fuel: {
      trip: fuelLine(trip, num(ofp.times?.estTimeEnroute), ofp.airDistance ?? null),
      rteRsv: fuelLine(contingency, num(ofp.times?.contFuelTime)),
      etops: fuelLine(nonZero(kg(ofp.fuel?.etops, units)), num(ofp.times?.etopsFuelTime)),
      altn: fuelLine(altnFuelKg, ofp.alternate?.ete ?? null, ofp.alternate?.airDistance ?? null),
      final: fuelLine(kg(ofp.fuel?.reserve, units), num(ofp.times?.reserveTime)),
      addnl: fuelLine(null),
      xtr: fuelLine(nonZero(kg(ofp.fuel?.extra, units)), num(ofp.times?.extraFuelTime)),
      tof: fuelLine(kg(ofp.fuel?.planTakeOff, units)),
      taxi: fuelLine(kg(ofp.fuel?.taxi, units)),
    },
    load: {
      dow: oew,
      pld: payload,
      zfw,
      tof: kg(ofp.fuel?.planTakeOff, units),
      tow: kg(ofp.weights?.estTakeOffWeight, units),
      ebo: trip,
      lw: kg(ofp.weights?.estLandingWeight, units),
    },
    maxStruct: {
      zfw: kg(ofp.weights?.maxZeroFuelWeight, units),
      tow: kg(ofp.weights?.maxTakeOffWeight, units),
      lw: kg(ofp.weights?.maxLandingWeight, units),
    },
    altnRows: alternates.map((icao, index) =>
      index === 0
        ? {
            icao: icao ?? '',
            airNm: ofp.alternate?.airDistance ?? null,
            groundNm: ofp.alternate?.groundDistance ?? null,
            flightLevel:
              num(ofp.alternate?.cruiseAltitude) !== null ? Math.round(ofp.alternate.cruiseAltitude / 100) : null,
            timeS: ofp.alternate?.ete ?? null,
            fuelKg: altnFuelKg,
          }
        : { icao: icao ?? '', airNm: null, groundNm: null, flightLevel: null, timeS: null, fuelKg: null },
    ),
    navLog: navlog.map((fix) => {
      const cumS = num(fix.time_total);
      return {
        ident: fix.ident ?? '',
        airway: fix.via_airway ?? '',
        moraHundredFeet: moraHundredFeet(fix.mora),
        legS: num(fix.time_leg),
        cumS,
        etaMs: baseMs !== null && cumS !== null ? baseMs + cumS * 1000 : null,
        efobKg: kg(fix.fuel_plan_onboard, units),
        efuKg: kg(fix.fuel_totalused, units),
        latitudeDeg: num(fix.pos_lat),
        longitudeDeg: num(fix.pos_long),
      };
    }),
    baseMs,
    updates: { fuel: {}, load: {}, altnFuel: [] },
    followUp: emptyFollowUp(),
  };
}

/** A cell of the Update column: the value and where it comes from */
export interface EffUpdateCell {
  readonly kg: number | null;
  /** cyan: the crew's entry; green: computed from the entries; null: nothing to show */
  readonly source: 'crew' | 'computed' | null;
}

const EMPTY_CELL: EffUpdateCell = { kg: null, source: null };

/**
 * @param value the crew entry in kg, undefined for none
 * @returns the cell of the entry
 */
function crew(value: number | undefined): EffUpdateCell {
  return value === undefined ? EMPTY_CELL : { kg: value, source: 'crew' };
}

/**
 * @param plan the flight plan
 * @param key a fuel line
 * @returns its Update cell. The take-off fuel adds up the fuel lines as soon as the crew entered one of them (a line
 * without an entry counts with its OFP estimate), so changing TRIP updates TOF.
 */
export function fuelUpdateCell(plan: EffFlightPlan, key: EffFuelKey): EffUpdateCell {
  const entered = crew(plan.updates.fuel[key]);
  if (entered.source !== null || key !== 'tof') {
    return entered;
  }
  const anyEntry = EFF_FUEL_SUM_KEYS.some((line) => plan.updates.fuel[line] !== undefined);
  if (!anyEntry) {
    return EMPTY_CELL;
  }
  let sum = 0;
  for (const line of EFF_FUEL_SUM_KEYS) {
    sum += plan.updates.fuel[line] ?? plan.fuel[line].estimateKg ?? 0;
  }
  return { kg: sum, source: 'computed' };
}

/**
 * @param plan the flight plan
 * @param key a load line
 * @returns its Update cell. The computed ones follow the entries: the zero fuel weight adds the dry operating weight
 * and the payload, the take-off weight adds the take-off fuel to the zero fuel weight, the fuel on board at the
 * landing follows the trip fuel, and the landing weight is the take-off weight less the trip fuel.
 */
export function loadUpdateCell(plan: EffFlightPlan, key: EffLoadKey): EffUpdateCell {
  const entered = crew(plan.updates.load[key]);
  if (entered.source !== null) {
    return entered;
  }
  const estimate = (line: EffLoadKey): number | null => loadUpdateValue(plan, line);
  switch (key) {
    case 'zfw': {
      if (plan.updates.load.dow === undefined && plan.updates.load.pld === undefined) {
        return EMPTY_CELL;
      }
      const dow = estimate('dow');
      const pld = estimate('pld');
      return dow !== null && pld !== null ? { kg: dow + pld, source: 'computed' } : EMPTY_CELL;
    }
    case 'tof': {
      const cell = fuelUpdateCell(plan, 'tof');
      return cell.source === null ? EMPTY_CELL : { kg: cell.kg, source: 'computed' };
    }
    case 'ebo': {
      const cell = fuelUpdateCell(plan, 'trip');
      return cell.source === null ? EMPTY_CELL : { kg: cell.kg, source: 'computed' };
    }
    case 'tow': {
      if (loadUpdateCell(plan, 'zfw').source === null && loadUpdateCell(plan, 'tof').source === null) {
        return EMPTY_CELL;
      }
      const zfw = estimate('zfw');
      const tof = estimate('tof');
      return zfw !== null && tof !== null ? { kg: zfw + tof, source: 'computed' } : EMPTY_CELL;
    }
    case 'lw': {
      if (loadUpdateCell(plan, 'tow').source === null && loadUpdateCell(plan, 'ebo').source === null) {
        return EMPTY_CELL;
      }
      const tow = estimate('tow');
      const ebo = estimate('ebo');
      return tow !== null && ebo !== null ? { kg: tow - ebo, source: 'computed' } : EMPTY_CELL;
    }
    default:
      return EMPTY_CELL;
  }
}

/**
 * @param plan the flight plan
 * @param key a load line
 * @returns the value the dependent lines work from: the Update cell, else the OFP estimate
 */
function loadUpdateValue(plan: EffFlightPlan, key: EffLoadKey): number | null {
  const cell = loadUpdateCell(plan, key);
  return cell.kg ?? plan.load[key];
}

/**
 * @param plan the flight plan
 * @param row the ALTN row
 * @returns the Update cell of the alternate fuel
 */
export function altnUpdateCell(plan: EffFlightPlan, row: number): EffUpdateCell {
  return crew(plan.updates.altnFuel[row]);
}

/**
 * @param weightKg a weight in kg, null for none
 * @param metric whether the aircraft shows tonnes (else thousands of pounds)
 * @returns the weight with one decimal, e.g. 14.1, or an empty text for none
 */
export function weightText(weightKg: number | null, metric: boolean): string {
  if (weightKg === null) {
    return '';
  }
  return ((metric ? weightKg : weightKg / KG_PER_LB) / 1000).toFixed(1);
}

/**
 * @param text a weight typed in the unit of the aircraft, tonnes or thousands of pounds
 * @param metric whether the aircraft shows tonnes
 * @returns the weight in kg, null for an invalid text
 */
export function parseWeight(text: string, metric: boolean): number | null {
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(text.trim())) {
    return null;
  }
  const value = Number(text) * 1000;
  return metric ? value : value * KG_PER_LB;
}

/**
 * @param seconds a duration
 * @returns it as HH:MM, an empty text for none
 */
export function durationText(seconds: number | null): string {
  if (seconds === null) {
    return '';
  }
  const minutes = Math.round(seconds / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * @param timeMs unix ms
 * @returns the UTC time as HH:MM, an empty text for none
 */
export function clockText(timeMs: number | null): string {
  return timeMs === null ? '' : oisTime(timeMs);
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * @param text a time typed as HHMM or HH:MM, UTC
 * @param referenceMs a time the typed one is close to, unix ms: the entry has no date, so the day is the one that puts
 * it nearest to the reference (a flight crosses midnight)
 * @returns the time in unix ms, null for an invalid text
 */
export function parseClockTime(text: string, referenceMs: number): number | null {
  const match = /^(\d{2}):?(\d{2})$/.exec(text.trim());
  if (match === null || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return null;
  }
  const dayStartMs = Math.floor(referenceMs / DAY_MS) * DAY_MS;
  const timeOfDayMs = (Number(match[1]) * 60 + Number(match[2])) * 60 * 1000;
  let nearest = dayStartMs + timeOfDayMs;
  for (const shift of [-DAY_MS, DAY_MS]) {
    if (Math.abs(dayStartMs + timeOfDayMs + shift - referenceMs) < Math.abs(nearest - referenceMs)) {
      nearest = dayStartMs + timeOfDayMs + shift;
    }
  }
  return nearest;
}

/**
 * @param value a wind component or temperature, positive or negative
 * @returns it with the sign as a letter, P for plus and M for minus, three digits: M049
 */
export function signedText(value: number | null): string {
  if (value === null) {
    return '';
  }
  const rounded = Math.round(value);
  return `${rounded < 0 ? 'M' : 'P'}${String(Math.abs(rounded)).padStart(3, '0')}`;
}

/**
 * @param plan the flight plan
 * @param key a fuel line
 * @returns whether it has anything to show (the OFP value or a crew entry)
 */
export function fuelLineVisible(plan: EffFlightPlan, key: EffFuelKey): boolean {
  return plan.fuel[key].estimateKg !== null || plan.updates.fuel[key] !== undefined;
}

/**
 * @param plan the flight plan
 * @param metric whether the aircraft shows tonnes
 * @returns the flight plan as printed: header, fuel and load, and the navigation log
 */
export function flightPlanPrintText(plan: EffFlightPlan, metric: boolean): string {
  const unit = metric ? 'T' : 'KLB';
  const lines = [
    `FLIGHT PLAN ${plan.flightNumber}  ${plan.fromIcao}-${plan.toIcao}  ALTN ${plan.altnIcao}`,
    `REG ${plan.registration}  ${plan.aircraftType}  CI ${plan.costIndex ?? ''}  FL${plan.cruiseFlightLevel ?? ''}`,
    `ROUTE ${plan.route}`,
    '',
    `FUEL (${unit})   ESTIMATE   UPDATE  TIME`,
  ];
  const fuel: [EffFuelKey, string][] = [
    ['trip', 'TRIP'],
    ['rteRsv', 'RTE RSV'],
    ['etops', 'ETOPS'],
    ['altn', 'ALTN'],
    ['final', 'FINAL'],
    ['addnl', 'ADDNL'],
    ['xtr', 'XTR'],
    ['tof', 'TOF'],
    ['taxi', 'TAXI'],
  ];
  for (const [key, label] of fuel) {
    if (fuelLineVisible(plan, key)) {
      const estimate = weightText(plan.fuel[key].estimateKg, metric);
      const update = weightText(fuelUpdateCell(plan, key).kg, metric);
      lines.push(
        `${label.padEnd(9)}${estimate.padStart(10)}${update.padStart(9)}  ${durationText(plan.fuel[key].timeS)}`,
      );
    }
  }
  lines.push('', `LOAD (${unit})   ESTIMATE   UPDATE`);
  const load: [EffLoadKey, string][] = [
    ['dow', 'DOW'],
    ['pld', 'PLD'],
    ['zfw', 'ZFW'],
    ['tof', 'TOF'],
    ['tow', 'TOW'],
    ['ebo', 'EBO'],
    ['lw', 'LW'],
  ];
  for (const [key, label] of load) {
    const estimate = weightText(plan.load[key], metric);
    const update = weightText(loadUpdateCell(plan, key).kg, metric);
    lines.push(`${label.padEnd(9)}${estimate.padStart(10)}${update.padStart(9)}`);
  }
  if (plan.navLog.length > 0) {
    lines.push('', 'WPT      AWY      MORA  ET     CT     EFOB   EFU    ATA    AFOB   AFU');
    for (const row of navLogLines(plan)) {
      lines.push(
        `${row.ident.padEnd(9)}${row.airway.padEnd(9)}${String(row.moraHundredFeet ?? '').padEnd(6)}${durationText(row.legS).padEnd(7)}${durationText(row.cumS).padEnd(7)}${weightText(row.efobKg, metric).padEnd(7)}${weightText(row.efuKg, metric).padEnd(7)}${clockText(row.ataMs).padEnd(7)}${weightText(row.afobKg, metric).padEnd(7)}${weightText(row.afuKg, metric)}`.replace(
          /\s+$/,
          '',
        ),
      );
    }
  }
  return lines.join('\n');
}

/**
 * @param index the index of a waypoint of the OFP
 * @returns the key of its row in the navigation log
 */
function navLogKey(index: number): string {
  return `W${index}`;
}

/** The key of the origin row: it takes the take-off, not an overflight, and has no fuel check */
export const NAV_LOG_ORIGIN_KEY = navLogKey(0);

/**
 * @param plan the flight plan
 * @param key a row key
 * @returns the waypoint of the OFP the row stands for, undefined for an inserted waypoint
 */
export function navLogOfpRow(plan: EffFlightPlan, key: string): EffNavLogRow | undefined {
  return key.charAt(0) === 'W' ? plan.navLog[Number(key.substring(1))] : undefined;
}

/**
 * @param plan the flight plan
 * @returns the keys of the rows in the order of the log: an inserted waypoint follows the waypoint it was inserted
 * after, the newest first
 */
function navLogKeys(plan: EffFlightPlan): string[] {
  const keys: string[] = [];
  const emit = (key: string): void => {
    keys.push(key);
    const inserted = plan.followUp.inserted.filter((waypoint) => waypoint.afterKey === key);
    for (let i = inserted.length - 1; i >= 0; i--) {
      emit(inserted[i].key);
    }
  };
  plan.navLog.forEach((_, index) => emit(navLogKey(index)));
  return keys;
}

/**
 * @param plan the flight plan
 * @param key a row key
 * @returns the name of the waypoint of the row, undefined for a key that is not in the log
 */
function identOf(plan: EffFlightPlan, key: string): string | undefined {
  return navLogOfpRow(plan, key)?.ident ?? plan.followUp.inserted.find((waypoint) => waypoint.key === key)?.ident;
}

/**
 * @param plan the flight plan
 * @param keys the keys of the rows in the order of the log
 * @returns the rows NEXT WPT skipped: the ones between the initial waypoint and the one it goes to
 */
function skippedKeys(plan: EffFlightPlan, keys: readonly string[]): Set<string> {
  const skipped = new Set<string>();
  Object.keys(plan.followUp.directTo).forEach((fromKey) => {
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(plan.followUp.directTo[fromKey]);
    for (let i = from + 1; from >= 0 && i < to; i++) {
      skipped.add(keys[i]);
    }
  });
  return skipped;
}

/** A row of the NAV LOG panel as the crew sees it */
export interface EffNavLogLine {
  readonly key: string;
  readonly ident: string;
  readonly airway: string;
  /** The crew inserted the waypoint with NEXT WPT */
  readonly inserted: boolean;
  /** NEXT WPT went past the waypoint */
  readonly skipped: boolean;
  /** The name of the waypoint NEXT WPT goes to from this one, inside the flight plan */
  readonly directTo: string | null;
  readonly moraHundredFeet: number | null;
  readonly legS: number | null;
  readonly cumS: number | null;
  /** What the OFP plans, counted from the take-off once it happened */
  readonly etaMs: number | null;
  readonly ataMs: number | null;
  /** The time the actual leg took */
  readonly atS: number | null;
  /** The planned time revised from the last waypoint flown */
  readonly retaMs: number | null;
  readonly efobKg: number | null;
  readonly afobKg: number | null;
  readonly deltaFobKg: number | null;
  readonly efuKg: number | null;
  readonly afuKg: number | null;
  readonly deltaFuelKg: number | null;
  /** Flown and not checked yet: the row shows in a yellow frame */
  readonly pending: boolean;
  readonly checked: boolean;
  /** FUEL CHK shows for a flown waypoint other than the origin */
  readonly fuelCheckShown: boolean;
}

/**
 * @param plan the flight plan
 * @returns the rows of the navigation log with their planned and actual values. The planned time counts from the
 * take-off once the origin has it. The revised time counts from the last waypoint flown: the waypoint itself shows its
 * own time until the crew checks it.
 */
export function navLogLines(plan: EffFlightPlan): EffNavLogLine[] {
  const keys = navLogKeys(plan);
  const skipped = skippedKeys(plan, keys);
  const { actuals, checked, directTo } = plan.followUp;
  const originAtaMs = actuals[NAV_LOG_ORIGIN_KEY]?.ataMs ?? null;

  let lastFlownKey: string | null = null;
  let lastFlownIndex = -1;
  for (let index = 0; index < keys.length; index++) {
    if (navLogOfpRow(plan, keys[index]) !== undefined && (actuals[keys[index]]?.ataMs ?? null) !== null) {
      lastFlownKey = keys[index];
      lastFlownIndex = index;
    }
  }
  const lastFlownAtaMs = lastFlownKey !== null ? (actuals[lastFlownKey].ataMs as number) : null;
  const lastFlownCumS = lastFlownKey !== null ? navLogOfpRow(plan, lastFlownKey)?.cumS ?? null : null;

  let previousAtaMs: number | null = null;
  return keys.map((key, index) => {
    const row = navLogOfpRow(plan, key);
    const actual = actuals[key];
    const ataMs = actual?.ataMs ?? null;
    // A waypoint that was flown stays as it is, whatever NEXT WPT says
    const isSkipped = skipped.has(key) && ataMs === null;
    const inserted = row === undefined;
    const isOrigin = key === NAV_LOG_ORIGIN_KEY;

    let etaMs: number | null = null;
    if (row !== undefined && row.cumS !== null) {
      etaMs = originAtaMs !== null ? originAtaMs + row.cumS * 1000 : row.etaMs;
    }

    const atS = ataMs !== null && previousAtaMs !== null ? Math.round((ataMs - previousAtaMs) / 1000) : null;
    if (ataMs !== null) {
      previousAtaMs = ataMs;
    }

    let retaMs: number | null = null;
    if (row !== undefined && row.cumS !== null && lastFlownAtaMs !== null && lastFlownCumS !== null) {
      if (index > lastFlownIndex && !isSkipped) {
        retaMs = lastFlownAtaMs + (row.cumS - lastFlownCumS) * 1000;
      } else if (index === lastFlownIndex && !isOrigin && !checked[key]) {
        retaMs = lastFlownAtaMs;
      }
    }

    const afobKg = actual?.afobKg ?? null;
    const afuKg = actual?.afuKg ?? null;
    const efobKg = row?.efobKg ?? null;
    const efuKg = row?.efuKg ?? null;
    return {
      key,
      ident: identOf(plan, key) ?? '',
      airway: row?.airway ?? '',
      inserted,
      skipped: isSkipped,
      directTo: directTo[key] !== undefined ? identOf(plan, directTo[key]) ?? null : null,
      moraHundredFeet: row?.moraHundredFeet ?? null,
      legS: row?.legS ?? null,
      cumS: row?.cumS ?? null,
      etaMs,
      ataMs,
      atS,
      retaMs,
      efobKg,
      afobKg,
      deltaFobKg: afobKg !== null && efobKg !== null ? afobKg - efobKg : null,
      efuKg,
      afuKg,
      deltaFuelKg: afuKg !== null && efuKg !== null ? afuKg - efuKg : null,
      pending: ataMs !== null && !isOrigin && !checked[key],
      checked: checked[key] === true,
      fuelCheckShown: ataMs !== null && !isOrigin,
    };
  });
}

/** The waypoints of one NAV LOG page. Design choice: fourteen two-line rows fit the document window. */
export const NAV_LOG_ROWS_PER_PAGE = 14;

export const FLIGHT_REPORT_TAB = 'FLT REPORT';

/**
 * @param rowCount the rows of the navigation log, the waypoints the crew inserted included
 * @returns the tabs of the flight plan, one NAV LOG page for each group of rows
 */
export function flightPlanTabs(rowCount: number): string[] {
  const pages = Math.max(1, Math.ceil(rowCount / NAV_LOG_ROWS_PER_PAGE));
  const tabs = ['FMS INIT', 'FLT INFO', 'ALTN'];
  for (let page = 1; page <= pages; page++) {
    tabs.push(`NAV LOG ${page}`);
  }
  tabs.push(FLIGHT_REPORT_TAB);
  return tabs;
}

/**
 * @param lines the rows of the navigation log
 * @param index a row
 * @param baseMs the time the plan counts from
 * @returns a time near the row, for a time typed without a date: the last actual time up to the row, else its planned time
 */
export function nearbyTimeMs(lines: readonly EffNavLogLine[], index: number, baseMs: number | null): number {
  for (let i = index; i >= 0; i--) {
    const ataMs = lines[i].ataMs;
    if (ataMs !== null) {
      return ataMs;
    }
  }
  return lines[index]?.etaMs ?? baseMs ?? 0;
}

/**
 * @param lines the rows of the navigation log
 * @returns the index of the last row with an actual time, the waypoint FLOWN WPT shows; -1 when none was flown
 */
export function lastFlownLineIndex(lines: readonly EffNavLogLine[]): number {
  let last = -1;
  lines.forEach((line, index) => {
    if (line.ataMs !== null) {
      last = index;
    }
  });
  return last;
}

/** The longest waypoint name. Design choice: the length of the longest names in the navigation data */
export const WAYPOINT_NAME_MAX_LENGTH = 7;

const WAYPOINT_NAME = new RegExp(`^[A-Z0-9]{2,${WAYPOINT_NAME_MAX_LENGTH}}$`);

export type NextWaypointOutcome = 'in-plan' | 'inserted' | 'rejected';

/**
 * NEXT WPT from a waypoint. A waypoint of the log after the initial one is gone to directly: the waypoints in between
 * are skipped. Any other name is a waypoint outside the flight plan, inserted right after the initial waypoint.
 * @param plan the flight plan
 * @param fromKey the initial waypoint
 * @param entry the name chosen in the list or typed
 * @returns what happened; a rejected entry changes nothing
 */
export function setNextWaypoint(plan: EffFlightPlan, fromKey: string, entry: string): NextWaypointOutcome {
  const keys = navLogKeys(plan);
  const fromIndex = keys.indexOf(fromKey);
  const ident = entry.trim().toUpperCase();
  if (fromIndex < 0 || !WAYPOINT_NAME.test(ident)) {
    return 'rejected';
  }
  const followUp = plan.followUp;
  delete followUp.directTo[fromKey];
  const target = keys.slice(fromIndex + 1).find((key) => identOf(plan, key) === ident);
  if (target !== undefined) {
    followUp.directTo[fromKey] = target;
    return 'in-plan';
  }
  followUp.insertedCount += 1;
  followUp.inserted.push({ key: `I${followUp.insertedCount}`, ident, afterKey: fromKey });
  return 'inserted';
}

/**
 * DELETE: only a waypoint the crew inserted goes, and not once the crew has checked it
 * @param plan the flight plan
 * @param key a row
 * @returns whether the waypoint was removed
 */
export function deleteInsertedWaypoint(plan: EffFlightPlan, key: string): boolean {
  const followUp = plan.followUp;
  const waypoint = followUp.inserted.find((w) => w.key === key);
  if (waypoint === undefined || followUp.checked[key]) {
    return false;
  }
  // The waypoints inserted after the removed one move up to its place
  followUp.inserted = followUp.inserted
    .filter((w) => w.key !== key)
    .map((w) => (w.afterKey === key ? { ...w, afterKey: waypoint.afterKey } : w));
  delete followUp.actuals[key];
  delete followUp.directTo[key];
  Object.keys(followUp.directTo).forEach((fromKey) => {
    if (followUp.directTo[fromKey] === key) {
      delete followUp.directTo[fromKey];
    }
  });
  return true;
}

/**
 * @param plan the flight plan
 * @param key a row
 * @param patch the values to set, null to clear one
 * @returns whether the values were kept: not for an unknown row or one the crew checked
 */
export function setNavLogActual(plan: EffFlightPlan, key: string, patch: Partial<EffNavLogActual>): boolean {
  const followUp = plan.followUp;
  if (!navLogKeys(plan).includes(key) || followUp.checked[key]) {
    return false;
  }
  const actual = { ...(followUp.actuals[key] ?? { ataMs: null, afobKg: null, afuKg: null }), ...patch };
  if (actual.ataMs === null && actual.afobKg === null && actual.afuKg === null) {
    delete followUp.actuals[key];
  } else {
    followUp.actuals[key] = actual;
  }
  return true;
}

/**
 * FUEL CHK: the data of a flown waypoint are saved and cannot change any more
 * @param plan the flight plan
 * @param key a row
 * @returns whether the row was checked
 */
export function checkNavLogRow(plan: EffFlightPlan, key: string): boolean {
  const line = navLogLines(plan).find((l) => l.key === key);
  if (line === undefined || !line.fuelCheckShown || line.checked) {
    return false;
  }
  plan.followUp.checked[key] = true;
  return true;
}
