// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface MetarWind {
  /** Null for variable wind */
  dirDeg: number | null;
  speedKt: number;
  gustKt: number | null;
}

const WIND_TOKEN = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/;
const WEATHER_TOKEN =
  /^[-+]?(VC)?((MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+|TS)$/;
const CLOUD_CB_TOKEN = /^(FEW|SCT|BKN|OVC)\d{3}CB$/;
const KT_PER_MPS = 1.94384;

/** Trend and remark groups describe the future or free text, not the observation */
const TREND_MARKERS = ['RMK', 'TEMPO', 'BECMG', 'NOSIG'];

export const splitTokens = (report: string): string[] =>
  report
    .toUpperCase()
    .replace(/=/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

export const isWeatherToken = (token: string): boolean => WEATHER_TOKEN.test(token);

export type ThunderstormPresence = 'none' | 'vicinity' | 'overhead';

/** VCTS is a thunderstorm near the airport (5 to 10 km away), not at it */
const thunderstormToken = (token: string): ThunderstormPresence => {
  if (CLOUD_CB_TOKEN.test(token)) {
    return 'overhead';
  }
  if (!WEATHER_TOKEN.test(token) || token.indexOf('TS') < 0) {
    return 'none';
  }
  return token.indexOf('VC') >= 0 ? 'vicinity' : 'overhead';
};

export const strongestThunderstorm = (tokens: string[]): ThunderstormPresence => {
  let strongest: ThunderstormPresence = 'none';
  for (const token of tokens) {
    const presence = thunderstormToken(token);
    if (presence === 'overhead') {
      return presence;
    }
    if (presence === 'vicinity') {
      strongest = presence;
    }
  }
  return strongest;
};

/** The observation part of a METAR: everything after the time group, up to the first trend or remark */
export const observationTokens = (metar: string): string[] => {
  const tokens = splitTokens(metar);
  const timeIndex = tokens.findIndex((token) => /^\d{6}Z$/.test(token));
  const afterTime = tokens.slice(timeIndex + 1);
  const trendIndex = afterTime.findIndex((token) => TREND_MARKERS.indexOf(token) >= 0);
  return trendIndex >= 0 ? afterTime.slice(0, trendIndex) : afterTime;
};

/** A wind group such as 32005KT, VRB02KT or 25010G20MPS, in knots; null for any other token */
export const parseWindToken = (token: string): MetarWind | null => {
  const match = WIND_TOKEN.exec(token);
  if (!match) {
    return null;
  }
  const unitFactor = match[4] === 'MPS' ? KT_PER_MPS : 1;
  return {
    dirDeg: match[1] === 'VRB' ? null : parseInt(match[1], 10),
    speedKt: Math.round(parseInt(match[2], 10) * unitFactor),
    gustKt: match[3] ? Math.round(parseInt(match[3], 10) * unitFactor) : null,
  };
};

export const parseMetarWind = (metar: string | undefined): MetarWind | null => {
  if (!metar) {
    return null;
  }
  for (const token of observationTokens(metar)) {
    const wind = parseWindToken(token);
    if (wind) {
      return wind;
    }
  }
  return null;
};

export const metarPresentWeather = (metar: string | undefined): string[] =>
  metar ? observationTokens(metar).filter(isWeatherToken) : [];

export const metarThunderstorm = (metar: string | undefined): ThunderstormPresence =>
  metar ? strongestThunderstorm(observationTokens(metar)) : 'none';

/** Day, hour and minute (UTC) of the DDHHMMZ observation time group; the month is not in the report */
export const metarObservationTime = (
  metar: string | undefined,
): { day: number; hour: number; minute: number } | null => {
  const match = metar ? /(?:^|\s)(\d{2})(\d{2})(\d{2})Z(?:\s|$)/.exec(metar.toUpperCase()) : null;
  return match ? { day: parseInt(match[1], 10), hour: parseInt(match[2], 10), minute: parseInt(match[3], 10) } : null;
};
