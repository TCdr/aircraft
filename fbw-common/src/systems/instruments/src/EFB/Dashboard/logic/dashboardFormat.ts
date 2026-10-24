// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { sunsetUtc } from './sunset';

const KG_PER_LB = 0.4535934;
/** The Fuel and Payload pages show whole tens; the dashboard does the same so both read alike */
const WEIGHT_STEP = 10;

/** A SimBrief OFP gives every weight in the unit of the OFP ('kgs' or 'lbs') */
export const simbriefWeightKg = (value: number | string, ofpUnits: string): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return ofpUnits === 'lbs' ? parsed * KG_PER_LB : parsed;
};

/** The OFP JSON carries weights as strings: they must be parsed before they are added */
export const simbriefWeightSumKg = (values: (number | string | undefined)[], ofpUnits: string): number =>
  values.reduce<number>((sum, value) => (value === undefined ? sum : sum + simbriefWeightKg(value, ofpUnits)), 0);

const roundedUserWeight = (kg: number, metric: boolean): number =>
  Math.round((metric ? kg : kg / KG_PER_LB) / WEIGHT_STEP) * WEIGHT_STEP;

export const weightUnitLabel = (metric: boolean): string => (metric ? 'kg' : 'lb');

/** Thousands separated by commas; the sim browser's toLocaleString does not follow the user's locale */
export const groupThousands = (value: number): string => {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(value));
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    grouped += digits[i] + (fromEnd > 1 && fromEnd % 3 === 1 ? ',' : '');
  }
  return sign + grouped;
};

/** A weight given in kilograms, shown in the user's unit: "68,240 kg" or "150,440 lb" */
export const formatWeight = (kg: number, metric: boolean): string => {
  return `${groupThousands(roundedUserWeight(kg, metric))} ${weightUnitLabel(metric)}`;
};

/** A weight in the user's unit without the unit, for a figure whose unit is shown once next to it */
export const formatWeightValue = (kg: number, metric: boolean): string => groupThousands(roundedUserWeight(kg, metric));

/**
 * A weight in thousands of the user's unit with one decimal, "6.8 t" or "15.0 klb": the narrow fields of the in-flight
 * columns have no room for the full figure
 */
export const formatWeightThousands = (kg: number, metric: boolean): string => {
  const thousands = (metric ? kg : kg / KG_PER_LB) / 1000;
  return `${thousands.toFixed(1)} ${metric ? 't' : 'klb'}`;
};

/** The route of the OFP from runway to runway, e.g. "LFPG/09L LATRA6W LATRA UN859 ... EGLL/27R" */
export const ofpRouteText = (ofp: {
  departingAirport: string;
  departingRunway: string;
  route: string;
  arrivingAirport: string;
  arrivingRunway: string;
}): string => {
  const end = (icao: string, runway: string) => (runway ? `${icao}/${runway}` : icao);
  return [end(ofp.departingAirport, ofp.departingRunway), ofp.route, end(ofp.arrivingAirport, ofp.arrivingRunway)]
    .filter((part) => !!part)
    .join(' ');
};

/** A weight difference with its sign: "+400 kg", "-880 lb" */
export const formatSignedWeight = (kg: number, metric: boolean): string => {
  const text = formatWeight(Math.abs(kg), metric);
  if (text.charAt(0) === '0') {
    return text;
  }
  return `${kg < 0 ? '-' : '+'}${text}`;
};

export const twoDigits = (value: number): string => (value < 10 ? `0${value}` : String(value));

/** A duration as h:mm, e.g. 65 minutes = "1:05"; negative durations are shown as 0:00 */
export const formatHoursMinutes = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes));
  return `${Math.floor(whole / 60)}:${twoDigits(whole % 60)}`;
};

/** A UTC time of day as "13:05z" */
export const formatUtcClock = (unixMs: number): string => {
  const date = new Date(unixMs);
  return `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}z`;
};

/** A local time of day given in seconds after local midnight, as "14:12" */
export const formatLocalClock = (secondsOfDay: number): string => {
  const minutes = Math.floor(secondsOfDay / 60) % (24 * 60);
  return `${twoDigits(Math.floor(minutes / 60))}:${twoDigits(minutes % 60)}`;
};

/**
 * The replacements of an advice message for the translation function: the kilogram args converted to the user's
 * weight unit, with the unit name as {unit}
 */
export const adviceReplacements = (
  args: Record<string, string> | undefined,
  kilogramArgs: string[] | undefined,
  metric: boolean,
): Record<string, string>[] => {
  if (!args) {
    return [];
  }
  const converted: Record<string, string> = { unit: weightUnitLabel(metric) };
  Object.keys(args).forEach((name) => {
    const isWeight = (kilogramArgs ?? []).indexOf(name) >= 0;
    converted[name] = isWeight ? formatWeightValue(Number(args[name]), metric) : args[name];
  });
  return Object.keys(converted).map((name) => ({ [name]: converted[name] }));
};

const SECONDS_PER_DAY = 86_400;

/**
 * Today's sunset at the aircraft as a local clock time and the minutes until it; null in polar day or night and
 * once the sun has set
 */
export const sunsetLocal = (
  nowUnixSeconds: number,
  latDeg: number,
  longDeg: number,
  localMinusUtcSeconds: number,
): { clock: string; minutesLeft: number } | null => {
  const sunset = sunsetUtc(latDeg, longDeg, new Date(nowUnixSeconds * 1000));
  if (!sunset) {
    return null;
  }
  const sunsetUnixSeconds = sunset.getTime() / 1000;
  const minutesLeft = (sunsetUnixSeconds - nowUnixSeconds) / 60;
  if (minutesLeft < 0) {
    return null;
  }
  const localSecondsOfDay =
    (((sunsetUnixSeconds + localMinusUtcSeconds) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return { clock: formatLocalClock(localSecondsOfDay), minutesLeft };
};

const LATEST_ZONE_SECONDS = 14 * 3600;
const EARLIEST_ZONE_SECONDS = -12 * 3600;

/** Local minus UTC time from the two clocks, folded into the time zone range so a day boundary between them does not count */
export const localOffsetSeconds = (localSecondsOfDay: number, zuluSecondsOfDay: number): number => {
  const offset = localSecondsOfDay - zuluSecondsOfDay;
  if (offset > LATEST_ZONE_SECONDS) {
    return offset - SECONDS_PER_DAY;
  }
  return offset < EARLIEST_ZONE_SECONDS ? offset + SECONDS_PER_DAY : offset;
};
