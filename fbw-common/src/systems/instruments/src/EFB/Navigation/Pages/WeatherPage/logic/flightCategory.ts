// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CloudLayer, METRES_PER_STATUTE_MILE } from './reportElements';

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

/** Best to worst */
const CATEGORY_ORDER: FlightCategory[] = ['VFR', 'MVFR', 'IFR', 'LIFR'];

/** The FAA flight category limits */
const LIFR_CEILING_BELOW_FT = 500;
const IFR_CEILING_BELOW_FT = 1000;
const MVFR_CEILING_UP_TO_FT = 3000;
const LIFR_VISIBILITY_BELOW_SM = 1;
const IFR_VISIBILITY_BELOW_SM = 3;
const MVFR_VISIBILITY_UP_TO_SM = 5;

/** The covers that make a ceiling: broken, overcast and an obscured sky */
const CEILING_COVERS = ['BKN', 'OVC', 'VV'];

/** Height of the lowest broken or overcast layer or vertical visibility; null when no layer makes a ceiling */
export const ceilingFt = (clouds: CloudLayer[]): number | null => {
  let lowest: number | null = null;
  clouds.forEach((layer) => {
    if (CEILING_COVERS.indexOf(layer.cover) >= 0 && (lowest === null || layer.baseFt < lowest)) {
      lowest = layer.baseFt;
    }
  });
  return lowest;
};

/** Null (no ceiling) is VFR */
export const ceilingCategory = (ceiling: number | null): FlightCategory => {
  if (ceiling === null) {
    return 'VFR';
  }
  if (ceiling < LIFR_CEILING_BELOW_FT) {
    return 'LIFR';
  }
  if (ceiling < IFR_CEILING_BELOW_FT) {
    return 'IFR';
  }
  return ceiling <= MVFR_CEILING_UP_TO_FT ? 'MVFR' : 'VFR';
};

export const visibilityCategory = (metres: number): FlightCategory => {
  if (metres < LIFR_VISIBILITY_BELOW_SM * METRES_PER_STATUTE_MILE) {
    return 'LIFR';
  }
  if (metres < IFR_VISIBILITY_BELOW_SM * METRES_PER_STATUTE_MILE) {
    return 'IFR';
  }
  return metres <= MVFR_VISIBILITY_UP_TO_SM * METRES_PER_STATUTE_MILE ? 'MVFR' : 'VFR';
};

const worseCategory = (a: FlightCategory, b: FlightCategory): FlightCategory =>
  CATEGORY_ORDER.indexOf(a) >= CATEGORY_ORDER.indexOf(b) ? a : b;

/**
 * The category of the worse of ceiling and visibility. Undefined means not reported: with neither reported there is no
 * category; with one reported the other does not lower it.
 */
export const flightCategory = (
  ceiling: number | null | undefined,
  visibilityMetres: number | undefined,
): FlightCategory | null => {
  if (ceiling === undefined && visibilityMetres === undefined) {
    return null;
  }
  const byCeiling = ceiling === undefined ? 'VFR' : ceilingCategory(ceiling);
  const byVisibility = visibilityMetres === undefined ? 'VFR' : visibilityCategory(visibilityMetres);
  return worseCategory(byCeiling, byVisibility);
};

/** The standard flight category colours */
export const CategoryColours: Record<FlightCategory, string> = {
  VFR: '#1f9d55',
  MVFR: '#1e6fe0',
  IFR: '#d6302b',
  LIFR: '#a32fc9',
};
