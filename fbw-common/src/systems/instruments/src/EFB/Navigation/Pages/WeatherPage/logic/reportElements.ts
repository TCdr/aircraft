// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MetarWind, isWeatherToken, observationTokens, parseWindToken } from '../../../../Dashboard/logic/metarTokens';

export type CloudCover = 'FEW' | 'SCT' | 'BKN' | 'OVC' | 'VV';

export interface CloudLayer {
  cover: CloudCover;
  baseFt: number;
  convective: 'CB' | 'TCU' | null;
}

export interface Visibility {
  metres: number;
  /** 9999, P6SM and CAVOK give a lower bound, not the visibility itself */
  orMore: boolean;
}

/**
 * The conditions one report or one forecast group states. An element the group does not state stays undefined, so a
 * BECMG or TEMPO group changes only what it names.
 */
export interface ReportElements {
  wind?: MetarWind;
  visibility?: Visibility;
  /** Weather groups as written (-SHRA, BCFG); empty for NSW or CAVOK */
  weather?: string[];
  /** Lowest first; empty for NSC, SKC, CLR, NCD or CAVOK */
  clouds?: CloudLayer[];
}

export const METRES_PER_STATUTE_MILE = 1609;
/** 9999 in a report means 10 km or more */
const TEN_KM_METRES = 10_000;
const HPA_PER_INHG = 33.8639;

const METRE_VISIBILITY = /^(\d{4})(NDV)?$/;
const MILE_VISIBILITY = /^([PM])?(\d+)(?:\/(\d+))?SM$/;
const WHOLE_MILES = /^\d$/;
const CLOUD_LAYER = /^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/;
const VERTICAL_VISIBILITY = /^VV(\d{3})$/;
const NO_CLOUD = ['NSC', 'SKC', 'CLR', 'NCD'];

const parseMileVisibility = (token: string, previous: string | undefined): Visibility | null => {
  const match = MILE_VISIBILITY.exec(token);
  if (!match) {
    return null;
  }
  let miles = match[3] ? parseInt(match[2], 10) / parseInt(match[3], 10) : parseInt(match[2], 10);
  // "1 1/2SM" is written as two tokens
  if (match[3] && previous && WHOLE_MILES.test(previous)) {
    miles += parseInt(previous, 10);
  }
  return { metres: Math.round(miles * METRES_PER_STATUTE_MILE), orMore: match[1] === 'P' };
};

const parseMetreVisibility = (token: string): Visibility | null => {
  const match = METRE_VISIBILITY.exec(token);
  if (!match) {
    return null;
  }
  const metres = parseInt(match[1], 10);
  return metres === 9999 ? { metres: TEN_KM_METRES, orMore: true } : { metres, orMore: false };
};

const parseCloudLayer = (token: string): CloudLayer | null => {
  const layer = CLOUD_LAYER.exec(token);
  if (layer) {
    return {
      cover: layer[1] as CloudCover,
      baseFt: parseInt(layer[2], 10) * 100,
      convective: (layer[3] as 'CB' | 'TCU' | undefined) ?? null,
    };
  }
  const vertical = VERTICAL_VISIBILITY.exec(token);
  return vertical ? { cover: 'VV', baseFt: parseInt(vertical[1], 10) * 100, convective: null } : null;
};

/** The elements of a run of report tokens: a METAR observation, a TAF base forecast or one change group */
export const parseReportElements = (tokens: string[]): ReportElements => {
  const elements: ReportElements = {};
  tokens.forEach((token, index) => {
    if (token === 'CAVOK') {
      elements.visibility = { metres: TEN_KM_METRES, orMore: true };
      elements.weather = [];
      elements.clouds = [];
      return;
    }
    const wind = elements.wind ? null : parseWindToken(token);
    if (wind) {
      elements.wind = wind;
      return;
    }
    const visibility = elements.visibility
      ? null
      : parseMetreVisibility(token) ?? parseMileVisibility(token, tokens[index - 1]);
    if (visibility) {
      elements.visibility = visibility;
      return;
    }
    if (token === 'NSW') {
      elements.weather = [];
      return;
    }
    if (isWeatherToken(token)) {
      elements.weather = (elements.weather ?? []).concat(token);
      return;
    }
    if (NO_CLOUD.indexOf(token) >= 0) {
      elements.clouds = elements.clouds ?? [];
      return;
    }
    const layer = parseCloudLayer(token);
    if (layer) {
      elements.clouds = (elements.clouds ?? []).concat(layer);
    }
  });
  if (elements.clouds) {
    elements.clouds.sort((a, b) => a.baseFt - b.baseFt);
  }
  return elements;
};

export interface Pressure {
  hpa: number;
  inHg: number;
}

export interface MetarReport extends ReportElements {
  temperatureC?: number;
  dewPointC?: number;
  qnh?: Pressure;
}

const TEMPERATURE = /^(M?\d{2})\/(M?\d{2})?$/;
const PRESSURE = /^([QA])(\d{4})$/;

const signedCelsius = (value: string): number => parseInt(value.replace('M', '-'), 10);

/** The observation of a METAR: the elements, temperature, dew point and QNH (each undefined when not reported) */
export const parseMetarReport = (metar: string): MetarReport => {
  const tokens = observationTokens(metar);
  const report: MetarReport = parseReportElements(tokens);
  tokens.forEach((token) => {
    const temperature = TEMPERATURE.exec(token);
    if (temperature && report.temperatureC === undefined) {
      report.temperatureC = signedCelsius(temperature[1]);
      report.dewPointC = temperature[2] ? signedCelsius(temperature[2]) : undefined;
      return;
    }
    const pressure = PRESSURE.exec(token);
    if (pressure && !report.qnh) {
      const value = parseInt(pressure[2], 10);
      report.qnh =
        pressure[1] === 'Q'
          ? { hpa: value, inHg: value / HPA_PER_INHG }
          : { hpa: (value / 100) * HPA_PER_INHG, inHg: value / 100 };
    }
  });
  return report;
};
