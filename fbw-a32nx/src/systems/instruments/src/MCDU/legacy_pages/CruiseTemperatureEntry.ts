// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MAXIMUM_CERTIFIED_ALTITUDE } from '@shared/A32NXPerformanceConstants';
import { TemperatureEntry } from '@fmgc/flightplanning/data/temperature';

export type CruiseTemperatureEntryResult = { entry: TemperatureEntry } | { error: 'formatError' | 'entryOutOfRange' };

/**
 * The SAT/ALT field of the CRZ WIND page: "-52/FL350" sets both, "-52" the temperature of the entry shown, "/FL370"
 * its altitude. The first entry needs both. A temperature without sign is negative, as on INIT B.
 * @param shown the entry the field shows (its own or propagated), null if the field is empty
 */
export function parseCruiseTemperatureEntry(
  input: string,
  shown: TemperatureEntry | null,
): CruiseTemperatureEntryResult {
  const [temperatureText, altitudeText, ...rest] = input.split('/');
  if (rest.length > 0) {
    return { error: 'formatError' };
  }

  let temperature = shown?.temperature;
  if (temperatureText !== '') {
    if (!temperatureText.match(/^[+-]?\d{1,3}$/)) {
      return { error: 'formatError' };
    }
    temperature = parseInt(temperatureText, 10);
    if (!temperatureText.startsWith('+') && !temperatureText.startsWith('-')) {
      temperature = -temperature;
    }
    if (temperature <= -270 || temperature >= 100) {
      return { error: 'entryOutOfRange' };
    }
  }

  let altitude = shown?.altitude;
  if (altitudeText !== undefined && altitudeText !== '') {
    if (!altitudeText.match(/^((FL)?\d{1,3}|\d{4,5})$/)) {
      return { error: 'formatError' };
    }
    altitude = parseInt(altitudeText.replace('FL', ''), 10);
    if (altitude < 1000) {
      altitude *= 100;
    }
    if (altitude > MAXIMUM_CERTIFIED_ALTITUDE) {
      return { error: 'entryOutOfRange' };
    }
  }

  if (temperature === undefined || altitude === undefined) {
    return { error: 'formatError' };
  }
  return { entry: { temperature, altitude } };
}
