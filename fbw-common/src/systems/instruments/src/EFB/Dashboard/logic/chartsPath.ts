// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const NAVIGATION = '/navigation/';
const WEATHER_PAGE = '/navigation/weather';
const FIRST_CHARTS_PAGE = '/navigation/lido';

/**
 * Where the dashboard's Charts button goes: the chart tab seen last, never the weather tab that shares the Navigation
 * section (the section itself reopens its last tab, which can be the weather)
 * @param seenPathnames the pathnames of the flyPad history, oldest first
 */
export const chartsPath = (seenPathnames: readonly string[]): string => {
  for (let i = seenPathnames.length - 1; i >= 0; i--) {
    const pathname = seenPathnames[i];
    if (pathname.indexOf(NAVIGATION) === 0 && pathname.indexOf(WEATHER_PAGE) !== 0) {
      return pathname;
    }
  }
  return FIRST_CHARTS_PAGE;
};
