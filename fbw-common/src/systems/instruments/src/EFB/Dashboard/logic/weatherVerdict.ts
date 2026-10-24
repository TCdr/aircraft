// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { StationWx } from './advice';
import { crosswindKt, crosswindLimit } from './crosswind';
import { metarPresentWeather, parseMetarWind } from './metarTokens';
import { thunderstormAt } from './tafThunderstorm';

/** The same share of the limit as the crosswind advice, so card and advice agree */
const CROSSWIND_CAUTION_FRACTION = 0.8;

export interface RunwayWind {
  /** Negative for a tailwind */
  headwindKt: number;
  crosswindKt: number;
  /** The crosswind of the gust, null without a gust */
  gustCrosswindKt: number | null;
}

/** The wind of a METAR along and across the runway; null for a calm or variable wind or an unknown runway */
export const runwayWind = (metar: string | undefined, runwayHeadingDeg: number | null): RunwayWind | null => {
  const wind = parseMetarWind(metar);
  if (!wind || wind.dirDeg === null || runwayHeadingDeg === null || wind.speedKt <= 0) {
    return null;
  }
  const angleRad = ((wind.dirDeg - runwayHeadingDeg) * Math.PI) / 180;
  return {
    headwindKt: Math.round(wind.speedKt * Math.cos(angleRad)),
    crosswindKt: Math.round(Math.abs(wind.speedKt * Math.sin(angleRad))),
    gustCrosswindKt: wind.gustKt === null ? null : crosswindKt(wind.dirDeg, wind.gustKt, null, runwayHeadingDeg),
  };
};

/** The wind group of the METAR as reported, e.g. 25018G28KT */
export const metarWindGroup = (metar: string | undefined): string | null => {
  if (!metar) {
    return null;
  }
  const match = /(?:^|\s)((?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?(?:KT|MPS))(?:\s|$)/.exec(metar.toUpperCase());
  return match ? match[1] : null;
};

export type VerdictTone = 'warn' | 'busy' | 'active' | 'idle';

export interface StationVerdict {
  tone: VerdictTone;
  /** Localisation key under Dashboard.Weather.Verdict */
  key: string;
  replacements: Record<string, string>[];
}

const SEVERITY: VerdictTone[] = ['warn', 'busy', 'active', 'idle'];

/**
 * One short verdict per station for the trip weather tiles, from the same rules as the advice: a thunderstorm around
 * the arrival time at the arrival airports, a crosswind close to the limit at the departure and destination
 */
export const stationVerdict = (
  station: StationWx | undefined,
  aircraft: 'a32nx' | 'a380x',
  etaUtc: Date | null,
  checksArrival: boolean,
): StationVerdict => {
  if (!station || !station.metar) {
    return { tone: 'idle', key: 'Dashboard.Weather.Verdict.NoReport', replacements: [] };
  }
  if (checksArrival && etaUtc) {
    const outlook = thunderstormAt(station.taf, station.metar, etaUtc);
    if (outlook !== 'none') {
      return {
        tone: outlook === 'likely' ? 'warn' : 'busy',
        key:
          outlook === 'likely'
            ? 'Dashboard.Weather.Verdict.Thunderstorm'
            : 'Dashboard.Weather.Verdict.ThunderstormProb',
        replacements: [],
      };
    }
  }
  const wind = parseMetarWind(station.metar);
  const crosswind = wind ? crosswindKt(wind.dirDeg, wind.speedKt, wind.gustKt, station.runwayHeadingDeg) : null;
  if (crosswind !== null) {
    const { limitKt } = crosswindLimit(aircraft, metarPresentWeather(station.metar));
    if (crosswind >= CROSSWIND_CAUTION_FRACTION * limitKt) {
      return {
        tone: crosswind > limitKt ? 'warn' : 'busy',
        key: 'Dashboard.Weather.Verdict.Crosswind',
        replacements: [{ crosswind: String(crosswind) }],
      };
    }
  }
  return { tone: 'active', key: 'Dashboard.Weather.Verdict.Ok', replacements: [] };
};

/** The index of the worst verdict, -1 when none is worse than OK */
export const worstVerdictIndex = (verdicts: readonly StationVerdict[]): number => {
  let worst = -1;
  verdicts.forEach((verdict, index) => {
    const rank = SEVERITY.indexOf(verdict.tone);
    if (rank <= 1 && (worst < 0 || rank < SEVERITY.indexOf(verdicts[worst].tone))) {
      worst = index;
    }
  });
  return worst;
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The OFP's average wind as a component along the great-circle course from departure to destination: positive for a
 * tailwind, negative for a headwind. Null without a wind or with both airports at the same place.
 */
export const routeWindComponentKt = (
  windFromDeg: number,
  windSpeedKt: number,
  departure: { lat: number; long: number },
  arrival: { lat: number; long: number },
): number | null => {
  if (!Number.isFinite(windFromDeg) || !Number.isFinite(windSpeedKt) || windSpeedKt <= 0) {
    return null;
  }
  const lat1 = toRad(departure.lat);
  const lat2 = toRad(arrival.lat);
  const dLong = toRad(arrival.long - departure.long);
  const y = Math.sin(dLong) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLong);
  if (x === 0 && y === 0) {
    return null;
  }
  const courseRad = Math.atan2(y, x);
  // A wind from the course's own direction is a headwind
  return Math.round(-windSpeedKt * Math.cos(toRad(windFromDeg) - courseRad));
};
