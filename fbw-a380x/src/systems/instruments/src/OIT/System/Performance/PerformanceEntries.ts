// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The entries of the FLT OPS performance applications (T.O PERF, LDG PERF, LOADSHEET): weights, QNH, wind, OAT, and
 * the units they are shown in. The values are kept in kg, hPa, knots and °C; the screens show the weights in tonnes
 * (metric) or klbs, as the weight unit of the aircraft.
 */

export const KG_PER_LB = 0.45359237;

export const FEET_PER_METRE = 3.28084;

const HPA_PER_INHG = 33.8639;

/** The QNH range of the entries, in hPa */
const MIN_QNH_HPA = 745;
const MAX_QNH_HPA = 1100;

/**
 * A weight entry of 10 000 or more is a weight in kg (lb), not in tonnes (klbs): the crew can type the weight in full,
 * e.g. to avoid the rounding of a klbs entry.
 */
const FULL_WEIGHT_ENTRY_THRESHOLD = 10_000;

/** The shortcut that inserts the maximum weight (MTOW in T.O PERF, MLW in LDG PERF) */
const MAX_WEIGHT_SHORTCUT = '*';

/**
 * @param kg a weight in kg
 * @param metric whether the weights are shown in tonnes (else klbs)
 * @returns the weight in the display unit (tonnes or klbs)
 */
export function weightToDisplayUnit(kg: number, metric: boolean): number {
  return metric ? kg / 1000 : kg / KG_PER_LB / 1000;
}

/**
 * @param kg a weight in kg, or null
 * @param metric whether the weights are shown in tonnes (else klbs)
 * @returns the weight with one decimal in the display unit, e.g. 569.0, or an empty text for null
 */
export function formatWeight(kg: number | null | undefined, metric: boolean): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) {
    return '';
  }
  return weightToDisplayUnit(kg, metric).toFixed(1);
}

/**
 * @param kg a weight in kg
 * @param metric whether the weight is shown in kg (else lb)
 * @returns the whole weight of the reports and the cargo fields, e.g. 12000
 */
export function formatWholeWeight(kg: number, metric: boolean): string {
  return Math.round(metric ? kg : kg / KG_PER_LB).toFixed(0);
}

/**
 * @param metric whether the weights are shown in tonnes (else klbs)
 * @returns the unit label of the weights
 */
export function weightUnitLabel(metric: boolean): string {
  return metric ? 'T' : 'klbs';
}

/**
 * The weights the performance applications take from LOADSHEET are rounded up to the next 100 kg (100 lb), so that
 * the computation never uses a lower weight than the loadsheet.
 * @param kg a weight in kg
 * @param metric whether the weights are in kg (else lb)
 * @returns the rounded weight in kg
 */
export function roundWeightUpForPerformance(kg: number, metric: boolean): number {
  if (metric) {
    return Math.ceil(kg / 100 - 1e-9) * 100;
  }
  const lb = kg / KG_PER_LB;
  return Math.ceil(lb / 100 - 1e-9) * 100 * KG_PER_LB;
}

/**
 * Parses a weight entry: in tonnes (klbs), in kg (lb) from 10 000 on, or the shortcut "*" for the maximum weight.
 * @param text the entry
 * @param metric whether the weights are in tonnes (else klbs)
 * @param maxWeightKg the weight of the "*" shortcut, in kg
 * @returns the weight in kg, or null for an invalid entry
 */
export function parseWeightEntry(text: string, metric: boolean, maxWeightKg: number): number | null {
  const entry = text.trim();
  if (entry === MAX_WEIGHT_SHORTCUT) {
    return maxWeightKg;
  }
  if (!/^\d+(\.\d+)?$/.test(entry)) {
    return null;
  }
  const value = parseFloat(entry);
  if (value <= 0) {
    return null;
  }
  const unitWeight = value >= FULL_WEIGHT_ENTRY_THRESHOLD ? value : value * 1000;
  return metric ? unitWeight : unitWeight * KG_PER_LB;
}

/**
 * Parses a QNH in hPa or in inHg: the format is detected from the value (below 100: inHg).
 * @param text the entry, e.g. 1013, 29.92 or 29
 * @returns the QNH in hPa, or null for an invalid entry or one out of range
 */
export function parseQnhEntry(text: string): number | null {
  const entry = text.trim();
  if (!/^\d+(\.\d+)?$/.test(entry)) {
    return null;
  }
  const value = parseFloat(entry);
  const hpa = value < 100 ? value * HPA_PER_INHG : value;
  return hpa >= MIN_QNH_HPA && hpa <= MAX_QNH_HPA ? hpa : null;
}

/**
 * Parses an outside air temperature.
 * @param text the entry in °C, e.g. 15 or -5 (M5 as on the FMS)
 * @returns the temperature in °C, or null for an invalid entry
 */
export function parseTemperatureEntry(text: string): number | null {
  const entry = text.trim().replace(/^M/i, '-');
  if (!/^[+-]?\d{1,2}$/.test(entry)) {
    return null;
  }
  return parseInt(entry, 10);
}

/** A wind entry: a longitudinal component, or a direction and a speed (with a gust) to project on the runway */
export type WindEntry =
  | { readonly kind: 'longitudinal'; readonly headwind: number }
  | { readonly kind: 'direction'; readonly direction: number; readonly speed: number; readonly gust: number | null };

/**
 * Parses a wind entry: H or HD followed by a headwind (H10, HD5), T or TL followed by a tailwind (T6, TL8), or a
 * direction and a speed, with a gust after a G (080/15, 080/15G25, 080/15/G25).
 * @param text the entry
 * @returns the wind, or null for an invalid entry
 */
export function parseWindEntry(text: string): WindEntry | null {
  const entry = text.trim().toUpperCase();
  const longitudinal = entry.match(/^(HD|H|TL|T)(\d{1,3})$/);
  if (longitudinal) {
    const speed = parseInt(longitudinal[2], 10);
    return { kind: 'longitudinal', headwind: longitudinal[1].startsWith('H') ? speed : -speed };
  }
  const directional = entry.match(/^(\d{1,3})\/(\d{1,3})(?:\/?G(\d{1,3}))?$/);
  if (directional) {
    const direction = parseInt(directional[1], 10);
    const speed = parseInt(directional[2], 10);
    const gust = directional[3] !== undefined ? parseInt(directional[3], 10) : null;
    if (direction > 360 || (gust !== null && gust < speed)) {
      return null;
    }
    return { kind: 'direction', direction: direction % 360, speed, gust };
  }
  return null;
}

/** The wind along and across the runway */
export interface RunwayWind {
  /** Knots of headwind, negative for a tailwind */
  readonly headwind: number;
  /** Knots of crosswind, positive from the right; null for a longitudinal entry */
  readonly crosswind: number | null;
  /** Knots of crosswind of the gust, positive from the right; null without a gust */
  readonly gustCrosswind: number | null;
}

/**
 * Projects a wind entry on a runway.
 * @param wind the wind entry
 * @param runwayMagneticBearing the magnetic bearing of the runway, or null when no runway is selected
 * @returns the components, or null when a direction entry has no runway to be projected on
 */
export function runwayWind(wind: WindEntry, runwayMagneticBearing: number | null): RunwayWind | null {
  if (wind.kind === 'longitudinal') {
    return { headwind: wind.headwind, crosswind: null, gustCrosswind: null };
  }
  if (runwayMagneticBearing === null) {
    return null;
  }
  const angle = ((wind.direction - runwayMagneticBearing) * Math.PI) / 180;
  return {
    headwind: wind.speed * Math.cos(angle),
    crosswind: wind.speed * Math.sin(angle),
    gustCrosswind: wind.gust !== null ? wind.gust * Math.sin(angle) : null,
  };
}

/**
 * The wind as the CONDITIONS panel shows it: the entry of a direction between brackets, then the longitudinal
 * component (HD or TL). The values are rounded to the nearest knot.
 * @param wind the wind entry
 * @param components the wind on the runway, null when it is not known
 * @returns e.g. (080/15)HD14, HD10, TL5, or (080/15) without a runway
 */
export function formatWindEntry(wind: WindEntry, components: RunwayWind | null): string {
  const directionText =
    wind.kind === 'direction'
      ? `(${wind.direction.toFixed(0).padStart(3, '0')}/${wind.speed.toFixed(0)}${wind.gust !== null ? `G${wind.gust.toFixed(0)}` : ''})`
      : '';
  if (components === null) {
    return directionText;
  }
  const longitudinal = Math.round(components.headwind);
  return `${directionText}${longitudinal >= 0 ? 'HD' : 'TL'}${Math.abs(longitudinal).toFixed(0)}`;
}

/**
 * @param components the wind on the runway
 * @returns the crosswind as the CONDITIONS panel shows it next to the wind, e.g. R 5 or L 3; empty without one
 */
export function formatCrosswind(components: RunwayWind | null): string {
  const crosswind = components?.gustCrosswind ?? components?.crosswind ?? null;
  if (crosswind === null) {
    return '';
  }
  const rounded = Math.round(crosswind);
  return `${rounded >= 0 ? 'R' : 'L'} ${Math.abs(rounded).toFixed(0)}`;
}

/**
 * @param missing the names of the missing parameters
 * @returns their lines of the ERROR list
 */
export function missingParameterErrors(missing: readonly string[]): string[] {
  return missing.map((parameter) => `Missing parameter ${parameter}`);
}

/**
 * @param elevation the airport elevation in feet
 * @param qnh the QNH in hPa
 * @returns the pressure altitude in feet
 */
function pressureAltitude(elevation: number, qnh: number): number {
  return elevation + 145442.15 * (1 - (qnh / 1013.25) ** 0.190263);
}

/**
 * The ISA deviation next to the OAT: it depends on the airport elevation and the QNH.
 * @param oat the OAT in °C
 * @param elevation the airport elevation in feet
 * @param qnh the QNH in hPa
 * @returns the deviation from the ISA temperature at the airport pressure altitude, in °C
 */
export function isaDeviation(oat: number, elevation: number, qnh: number): number {
  return oat - (15 - 0.0019812 * pressureAltitude(elevation, qnh));
}

/**
 * @param deviation an ISA deviation in °C, or null
 * @returns the deviation as the CONDITIONS panel shows it: +2, -5, 0, or --- when not known
 */
export function formatIsaDeviation(deviation: number | null): string {
  if (deviation === null) {
    return '---';
  }
  const rounded = Math.round(deviation);
  return rounded > 0 ? `+${rounded.toFixed(0)}` : rounded.toFixed(0);
}

/**
 * @param metres a length in metres
 * @param metric whether the lengths are shown in metres (else feet)
 * @returns the length rounded in the display unit
 */
export function formatLength(metres: number | null | undefined, metric: boolean): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) {
    return '';
  }
  return Math.round(metric ? metres : metres * FEET_PER_METRE).toFixed(0);
}

/**
 * @param metric whether the lengths are shown in metres (else feet)
 * @returns the unit label of the lengths
 */
export function lengthUnitLabel(metric: boolean): string {
  return metric ? 'm' : 'ft';
}
