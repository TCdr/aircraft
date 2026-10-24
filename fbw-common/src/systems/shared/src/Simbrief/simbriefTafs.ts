// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The station of a TAF: the first ICAO after the optional TAF, AMD and COR words */
const TAF_STATION = /^(?:TAF\s+)?(?:(?:AMD|COR)\s+)*([A-Z]{4})\b/;
const TAF_KEY = /_taf$/i;

/**
 * Every TAF of the OFP's weather block, by the ICAO written in it. SimBrief gives one per airport of the plan
 * (departure, destination, alternates, takeoff and en-route alternates) under keys ending in _taf, as a text or a list
 * of texts: reading every such key keeps the airports a plan adds without naming each key.
 */
export const ofpTafsByIcao = (weather: unknown): Record<string, string> => {
  const tafs: Record<string, string> = {};
  if (!weather || typeof weather !== 'object') {
    return tafs;
  }
  const block = weather as Record<string, unknown>;
  Object.keys(block)
    .filter((key) => TAF_KEY.test(key))
    .forEach((key) => {
      const value = block[key];
      const texts = Array.isArray(value) ? value : [value];
      texts.forEach((text) => {
        if (typeof text !== 'string') {
          return;
        }
        const taf = text.trim().replace(/\s+/g, ' ').toUpperCase();
        const station = TAF_STATION.exec(taf);
        if (station && !(station[1] in tafs)) {
          tafs[station[1]] = taf;
        }
      });
    });
  return tafs;
};
