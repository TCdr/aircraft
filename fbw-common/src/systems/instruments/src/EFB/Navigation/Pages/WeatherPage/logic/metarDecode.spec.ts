// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import en from '../../../../Localization/data/en.json';
import { Translate, decodeMetar, weatherPhrase } from './metarDecode';
import { ceilingFt, flightCategory } from './flightCategory';
import { parseMetarReport } from './reportElements';
import { RJOA_METAR_LIFR, RJOA_METAR_VFR } from './rjoaFixtures';

/** The English strings with their placeholders filled, so the spec also proves every key exists */
const t: Translate = (key, replacements) => {
  let text: unknown = en;
  key.split('.').forEach((part) => {
    text = (text as Record<string, unknown>)[part];
  });
  if (typeof text !== 'string') {
    throw new Error(`missing string ${key}`);
  }
  let result = text;
  (replacements ?? []).forEach((replacement) => {
    const name = Object.keys(replacement)[0];
    result = result.replace(`$${name}`, replacement[name]);
  });
  return result;
};

const decode = (metar: string, observedText: string, metric: boolean) => {
  const report = parseMetarReport(metar);
  const ceiling = ceilingFt(report.clouds ?? []);
  return decodeMetar(
    { report, observedText, ceilingFt: ceiling, category: flightCategory(ceiling, report.visibility?.metres), metric },
    t,
  );
};

describe('weatherPhrase', () => {
  it('puts weather groups into words', () => {
    expect(weatherPhrase('-SHRA', t)).toBe('light showers of rain');
    expect(weatherPhrase('BCFG', t)).toBe('patches of fog');
    expect(weatherPhrase('+TSRA', t)).toBe('heavy thunderstorm with rain');
    expect(weatherPhrase('RASN', t)).toBe('rain and snow');
    expect(weatherPhrase('VCSH', t)).toBe('showers in the vicinity');
    expect(weatherPhrase('TS', t)).toBe('thunderstorm');
  });
});

describe('decodeMetar', () => {
  it('decodes RJOA 1800Z', () => {
    expect(decode(RJOA_METAR_VFR, '03:00 LT', true)).toEqual([
      'Observed 03:00 LT.',
      'Wind variable, 2 kt.',
      'Visibility 10 km or more.',
      'Few clouds at 4,800 ft, broken at 20,000 ft (ceiling), overcast at 21,000 ft.',
      'Temperature 20 °C, dew point 19 °C.',
      'QNH 1014 hPa.',
      'Flight category VFR.',
    ]);
  });

  it('decodes RJOA 0400Z in imperial units, the ceiling marked once', () => {
    expect(decode(RJOA_METAR_LIFR, '0400Z', false)).toEqual([
      'Observed 0400Z.',
      'Wind 070° at 6 kt.',
      'Visibility 1 1/4 SM.',
      'Present weather: light showers of rain, patches of fog, mist.',
      'Few clouds at the surface, scattered at 300 ft, broken at 300 ft (ceiling).',
      'Temperature 19 °C, dew point 18 °C.',
      'QNH 30.03 inHg.',
      'Flight category LIFR.',
    ]);
  });

  it('decodes gusts, calm wind and no cloud', () => {
    expect(decode('METAR XXXX 241800Z 00000KT CAVOK 10/05 Q1020', '1800Z', true)).toEqual([
      'Observed 1800Z.',
      'Wind calm.',
      'Visibility 10 km or more.',
      'No significant cloud.',
      'Temperature 10 °C, dew point 5 °C.',
      'QNH 1020 hPa.',
      'Flight category VFR.',
    ]);
    expect(decode('METAR XXXX 241800Z 25018G30KT 9999 SCT040 10/05 Q1020', '1800Z', true)[1]).toBe(
      'Wind 250° at 18 kt.',
    );
    expect(decode('METAR XXXX 241800Z 25018G30KT 9999 SCT040 10/05 Q1020', '1800Z', true)[2]).toBe('Gusts 30 kt.');
  });
});
