// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightCategory } from './flightCategory';
import { CloudLayer, MetarReport } from './reportElements';
import { groupThousands } from '../../../../Dashboard/logic/dashboardFormat';
import { formatDirection, formatPressure, formatVisibility } from './weatherFormat';

export type Translate = (key: string, replacements?: Record<string, string>[]) => string;

const WX = 'NavigationAndCharts.Weather.Wx';
const DECODED = 'NavigationAndCharts.Weather.Decoded';

const WEATHER_PARTS =
  /^([-+])?(VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/;

/** A weather group in words, e.g. -SHRA "light showers of rain", BCFG "patches of fog"; the group itself if unknown */
export const weatherPhrase = (group: string, t: Translate): string => {
  const match = WEATHER_PARTS.exec(group);
  if (!match || (!match[3] && !match[4])) {
    return group;
  }
  const [, intensity, vicinity, descriptor, phenomenaCodes] = match;
  const phenomena: string[] = [];
  for (let i = 0; i < phenomenaCodes.length; i += 2) {
    phenomena.push(t(`${WX}.Phenomenon.${phenomenaCodes.slice(i, i + 2)}`));
  }
  const words: string[] = [];
  if (intensity) {
    words.push(t(intensity === '-' ? `${WX}.Light` : `${WX}.Heavy`));
  }
  if (descriptor) {
    words.push(t(phenomena.length > 0 ? `${WX}.Descriptor.${descriptor}` : `${WX}.DescriptorAlone.${descriptor}`));
  }
  if (phenomena.length > 0) {
    words.push(phenomena.join(` ${t(`${WX}.And`)} `));
  }
  const phrase = words.join(' ');
  return vicinity ? t(`${WX}.Vicinity`, [{ weather: phrase }]) : phrase;
};

/** Several weather groups in words, separated by commas */
export const weatherPhrases = (groups: string[], t: Translate): string =>
  groups.map((group) => weatherPhrase(group, t)).join(', ');

export const capitalise = (text: string): string => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const layerPhrase = (layer: CloudLayer, isCeiling: boolean, t: Translate): string => {
  const height = layer.baseFt === 0 ? t(`${DECODED}.Surface`) : `${groupThousands(layer.baseFt)} ft`;
  let phrase = t(`${DECODED}.Layer.${layer.cover}`, [{ height }]);
  if (layer.convective) {
    phrase += ` ${t(`${DECODED}.Convective.${layer.convective}`)}`;
  }
  if (isCeiling) {
    phrase += ` ${t(`${DECODED}.CeilingMark`)}`;
  }
  return phrase;
};

export interface DecodeInput {
  report: MetarReport;
  /** "03:00 LT" or "1800Z"; null when the report has no time group */
  observedText: string | null;
  ceilingFt: number | null;
  category: FlightCategory | null;
  metric: boolean;
}

/** The METAR in plain sentences, one per element it reports */
export const decodeMetar = (input: DecodeInput, t: Translate): string[] => {
  const { report, metric } = input;
  const sentences: string[] = [];
  if (input.observedText) {
    sentences.push(t(`${DECODED}.Observed`, [{ time: input.observedText }]));
  }
  const { wind } = report;
  if (wind) {
    const speed = String(wind.speedKt);
    if (wind.speedKt === 0) {
      sentences.push(t(`${DECODED}.WindCalm`));
    } else if (wind.dirDeg === null) {
      sentences.push(t(`${DECODED}.WindVariable`, [{ speed }]));
    } else {
      sentences.push(t(`${DECODED}.Wind`, [{ direction: formatDirection(wind.dirDeg) }, { speed }]));
    }
    if (wind.gustKt !== null) {
      sentences.push(t(`${DECODED}.Gusts`, [{ gust: String(wind.gustKt) }]));
    }
  }
  if (report.visibility) {
    const shown = formatVisibility(report.visibility, metric);
    const visibility = `${shown.value} ${shown.unit}`;
    sentences.push(
      t(report.visibility.orMore ? `${DECODED}.VisibilityOrMore` : `${DECODED}.Visibility`, [{ visibility }]),
    );
  }
  if (report.weather && report.weather.length > 0) {
    sentences.push(t(`${DECODED}.Weather`, [{ weather: weatherPhrases(report.weather, t) }]));
  }
  if (report.clouds) {
    if (report.clouds.length === 0) {
      sentences.push(t(`${DECODED}.NoCloud`));
    } else {
      let ceilingMarked = false;
      const layers = report.clouds.map((layer) => {
        const isCeiling =
          !ceilingMarked && layer.baseFt === input.ceilingFt && layer.cover !== 'FEW' && layer.cover !== 'SCT';
        ceilingMarked = ceilingMarked || isCeiling;
        return layerPhrase(layer, isCeiling, t);
      });
      sentences.push(`${capitalise(layers.join(', '))}.`);
    }
  }
  if (report.temperatureC !== undefined) {
    const temperature = String(report.temperatureC);
    sentences.push(
      report.dewPointC !== undefined
        ? t(`${DECODED}.Temperature`, [{ temperature }, { dewPoint: String(report.dewPointC) }])
        : t(`${DECODED}.TemperatureOnly`, [{ temperature }]),
    );
  }
  if (report.qnh) {
    const qnh = formatPressure(report.qnh, metric);
    sentences.push(t(`${DECODED}.Qnh`, [{ qnh: `${qnh.value} ${qnh.unit}` }]));
  }
  if (input.category) {
    sentences.push(t(`${DECODED}.Category`, [{ category: input.category }]));
  }
  return sentences;
};
