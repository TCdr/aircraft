// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { INavlogFix, ISimbriefData } from '@flybywiresim/fbw-sdk';

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
  readonly updates: EffCrewUpdates;
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
      };
    }),
    updates: { fuel: {}, load: {}, altnFuel: [] },
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
    lines.push('', 'WPT      AWY      MORA  ET     CT     EFOB   EFU');
    for (const row of plan.navLog) {
      lines.push(
        `${row.ident.padEnd(9)}${row.airway.padEnd(9)}${String(row.moraHundredFeet ?? '').padEnd(6)}${durationText(row.legS).padEnd(7)}${durationText(row.cumS).padEnd(7)}${weightText(row.efobKg, metric).padEnd(7)}${weightText(row.efuKg, metric)}`,
      );
    }
  }
  return lines.join('\n');
}
