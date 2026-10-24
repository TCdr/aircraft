// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { groupThousands } from '../../../../Dashboard/logic/dashboardFormat';
import { METRES_PER_STATUTE_MILE, Pressure, Visibility } from './reportElements';

export interface ValueWithUnit {
  value: string;
  unit: string;
}

/** Below this the metric visibility is given in metres, as in the reports */
const METRES_UP_TO = 5000;
const QUARTERS = ['', '1/4', '1/2', '3/4'];

/** "1 1/2", "3/4", "2": statute miles to the nearest quarter, as written in US reports */
const quarterMiles = (miles: number): string => {
  const quarters = Math.round(miles * 4);
  const whole = Math.floor(quarters / 4);
  const fraction = QUARTERS[quarters % 4];
  if (whole === 0) {
    return fraction === '' ? '0' : fraction;
  }
  return fraction === '' ? String(whole) : `${whole} ${fraction}`;
};

/** Metres or kilometres in metric units, statute miles otherwise; a lower bound keeps its whole number */
export const formatVisibility = (visibility: Visibility, metric: boolean): ValueWithUnit => {
  if (metric) {
    return visibility.metres < METRES_UP_TO
      ? { value: groupThousands(visibility.metres), unit: 'm' }
      : { value: String(Math.round(visibility.metres / 1000)), unit: 'km' };
  }
  const miles = visibility.metres / METRES_PER_STATUTE_MILE;
  if (visibility.orMore) {
    return { value: String(Math.floor(miles)), unit: 'SM' };
  }
  return { value: miles < 3 ? quarterMiles(miles) : String(Math.round(miles)), unit: 'SM' };
};

/** hPa in metric units, inHg otherwise */
export const formatPressure = (pressure: Pressure, metric: boolean): ValueWithUnit =>
  metric ? { value: String(Math.round(pressure.hpa)), unit: 'hPa' } : { value: pressure.inHg.toFixed(2), unit: 'inHg' };

/** "040", the three digits of a wind direction */
export const formatDirection = (degrees: number): string => {
  const text = String(Math.round(degrees));
  return text.length >= 3 ? text : `${'00'.slice(0, 3 - text.length)}${text}`;
};
