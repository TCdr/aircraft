// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ThunderstormPresence,
  isWeatherToken,
  metarObservationTime,
  metarThunderstorm,
  splitTokens,
  strongestThunderstorm,
} from './metarTokens';

export type ThunderstormOutlook = 'none' | 'prob' | 'likely';

interface TafGroup {
  startMs: number;
  endMs: number;
  /** PROB groups and thunderstorms only in the vicinity are possible, not expected */
  probabilistic: boolean;
  tokens: string[];
}

/** An entry of the main forecast: the base forecast, an FM group or a BECMG group */
export interface TafMainEntry {
  kind: 'base' | 'from' | 'becoming';
  startMs: number;
  /** Where a BECMG change is complete; the start for the other kinds */
  changeEndMs: number;
  tokens: string[];
}

const MS_PER_MINUTE = 60000;
const VALIDITY_TOKEN = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/;
const FROM_TOKEN = /^FM(\d{2})(\d{2})(\d{2})$/;
const PROB_TOKEN = /^PROB(30|40)$/;
const CHANGE_MARKERS = ['BECMG', 'TEMPO'];

const isGroupMarker = (token: string): boolean =>
  FROM_TOKEN.test(token) || PROB_TOKEN.test(token) || CHANGE_MARKERS.indexOf(token) >= 0;

/** Instant of day/hour/minute in the month before, of or after the ETA month, whichever is nearest to the ETA */
export const nearestInstantMs = (day: number, hour: number, minute: number, etaMs: number): number | null => {
  const eta = new Date(etaMs);
  let best: number | null = null;
  for (let monthOffset = -1; monthOffset <= 1; monthOffset++) {
    const year = eta.getUTCFullYear();
    const month = eta.getUTCMonth() + monthOffset;
    // A day the month does not have (the 31st in a 30 day month) rolls over and must be rejected
    if (new Date(Date.UTC(year, month, day)).getUTCDate() !== day) {
      continue;
    }
    // Hour 24 is the end of the day and rolls over to the next day on purpose
    const candidate = Date.UTC(year, month, day, hour, minute);
    if (best === null || Math.abs(candidate - etaMs) < Math.abs(best - etaMs)) {
      best = candidate;
    }
  }
  return best;
};

/** A DDHH/DDHH period; the end is the first matching instant after the start, so it may be in the next month */
const resolvePeriod = (validity: string, etaMs: number): { startMs: number; endMs: number } | null => {
  const match = VALIDITY_TOKEN.exec(validity);
  if (!match) {
    return null;
  }
  const [startDay, startHour, endDay, endHour] = match.slice(1).map((part) => parseInt(part, 10));
  let bestPeriod: { startMs: number; endMs: number } | null = null;
  let bestDistance = Infinity;
  for (let monthOffset = -1; monthOffset <= 1; monthOffset++) {
    const eta = new Date(etaMs);
    const year = eta.getUTCFullYear();
    const startMonth = eta.getUTCMonth() + monthOffset;
    if (new Date(Date.UTC(year, startMonth, startDay)).getUTCDate() !== startDay) {
      continue;
    }
    const startMs = Date.UTC(year, startMonth, startDay, startHour);
    let endMs = Date.UTC(year, startMonth, endDay, endHour);
    if (new Date(Date.UTC(year, startMonth, endDay)).getUTCDate() !== endDay || endMs <= startMs) {
      endMs = Date.UTC(year, startMonth + 1, endDay, endHour);
    }
    // Distance from the ETA to the period, zero when the ETA is inside it
    const distance = Math.max(startMs - etaMs, etaMs - endMs, 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPeriod = { startMs, endMs };
    }
  }
  return bestPeriod;
};

/** NSW and CAVOK say there is no significant weather, which also replaces earlier weather */
const statesWeather = (tokens: string[]): boolean =>
  tokens.some((token) => isWeatherToken(token) || token === 'NSW' || token === 'CAVOK');

/** A TEMPO or PROBxx [TEMPO] group: conditions that may come and go during its period, over the main forecast */
export interface TafTemporaryGroup {
  /** The group marker as written: TEMPO, PROB30, PROB40 TEMPO... */
  label: string;
  /** PROB groups are possible, not expected */
  probabilistic: boolean;
  startMs: number;
  endMs: number;
  tokens: string[];
}

export interface TafTimeline {
  validity: { startMs: number; endMs: number };
  /** Sorted by start */
  main: TafMainEntry[];
  temporary: TafTemporaryGroup[];
}

/**
 * The groups of a TAF on the time line: the day numbers resolve to the month that puts them nearest to `referenceMs`.
 * Null when the TAF has no validity period.
 */
export const parseTafTimeline = (taf: string, referenceMs: number): TafTimeline | null => {
  const tokens = splitTokens(taf);
  const firstMarker = tokens.findIndex(isGroupMarker);
  const headerEnd = firstMarker >= 0 ? firstMarker : tokens.length;
  const validityToken = tokens.slice(0, headerEnd).find((token) => VALIDITY_TOKEN.test(token));
  const validity = validityToken ? resolvePeriod(validityToken, referenceMs) : null;
  if (!validity) {
    return null;
  }

  // Split into the base forecast and one slice per change group; PROBxx TEMPO stays one slice
  const slices: { marker: string; tokens: string[] }[] = [{ marker: '', tokens: tokens.slice(0, headerEnd) }];
  for (let i = headerEnd; i < tokens.length; i++) {
    const continuesProb = CHANGE_MARKERS.indexOf(tokens[i]) >= 0 && PROB_TOKEN.test(tokens[i - 1] ?? '');
    if (isGroupMarker(tokens[i]) && !continuesProb) {
      slices.push({ marker: tokens[i], tokens: [] });
    } else {
      slices[slices.length - 1].tokens.push(tokens[i]);
    }
  }

  const mainEntries: TafMainEntry[] = [
    { kind: 'base', startMs: validity.startMs, changeEndMs: validity.startMs, tokens: slices[0].tokens },
  ];
  const temporary: TafTemporaryGroup[] = [];
  for (const slice of slices.slice(1)) {
    const fromMatch = FROM_TOKEN.exec(slice.marker);
    if (fromMatch) {
      const startMs = nearestInstantMs(
        parseInt(fromMatch[1], 10),
        parseInt(fromMatch[2], 10),
        parseInt(fromMatch[3], 10),
        referenceMs,
      );
      if (startMs !== null) {
        mainEntries.push({ kind: 'from', startMs, changeEndMs: startMs, tokens: slice.tokens });
      }
      continue;
    }
    // BECMG, TEMPO or PROBxx [TEMPO] DDHH/DDHH: the period is the first validity token of the slice
    const periodIndex = slice.tokens.findIndex((token) => VALIDITY_TOKEN.test(token));
    const period = periodIndex >= 0 ? resolvePeriod(slice.tokens[periodIndex], referenceMs) : null;
    if (!period) {
      continue;
    }
    const conditions = slice.tokens.slice(periodIndex + 1);
    if (slice.marker === 'BECMG') {
      mainEntries.push({ kind: 'becoming', startMs: period.startMs, changeEndMs: period.endMs, tokens: conditions });
    } else {
      // PROBxx TEMPO keeps its TEMPO in the slice tokens, before the period
      const label = [slice.marker].concat(slice.tokens.slice(0, periodIndex)).join(' ');
      temporary.push({ label, probabilistic: PROB_TOKEN.test(slice.marker), ...period, tokens: conditions });
    }
  }
  mainEntries.sort((a, b) => a.startMs - b.startMs);
  return { validity, main: mainEntries, temporary };
};

const parseTafGroups = (taf: string, etaMs: number): TafGroup[] => {
  const timeline = parseTafTimeline(taf, etaMs);
  if (!timeline) {
    return [];
  }
  const { validity, main: mainEntries } = timeline;
  const groups: TafGroup[] = timeline.temporary.map((group) => ({
    startMs: group.startMs,
    endMs: group.endMs,
    probabilistic: group.probabilistic,
    tokens: group.tokens,
  }));

  // The main timeline: each entry holds until the next FM group begins or the next BECMG that states weather is
  // complete. During a BECMG transition both the old and the new weather count, so a thunderstorm is never missed.
  // A BECMG that changes only wind, visibility or cloud leaves the earlier weather in force.
  mainEntries.forEach((entry, index) => {
    const replacing = mainEntries
      .slice(index + 1)
      .find((later) => later.kind === 'from' || statesWeather(later.tokens));
    const endMs = replacing ? Math.max(replacing.changeEndMs, entry.startMs) : validity.endMs;
    groups.push({ startMs: entry.startMs, endMs, probabilistic: false, tokens: entry.tokens });
  });
  return groups;
};

const outlookFor = (presence: ThunderstormPresence, probabilistic: boolean): ThunderstormOutlook => {
  if (presence === 'none') {
    return 'none';
  }
  return presence === 'overhead' && !probabilistic ? 'likely' : 'prob';
};

const strongerOutlook = (a: ThunderstormOutlook, b: ThunderstormOutlook): ThunderstormOutlook => {
  const order: ThunderstormOutlook[] = ['none', 'prob', 'likely'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
};

/** An observation says nothing about the arrival unless the arrival is close to the observation time */
const metarOutlook = (metar: string | undefined, etaMs: number, windowMin: number): ThunderstormOutlook => {
  const time = metarObservationTime(metar);
  const observedMs = time ? nearestInstantMs(time.day, time.hour, time.minute, etaMs) : null;
  if (observedMs === null || Math.abs(observedMs - etaMs) > windowMin * MS_PER_MINUTE) {
    return 'none';
  }
  return outlookFor(metarThunderstorm(metar), false);
};

export const thunderstormAt = (
  taf: string | undefined,
  metar: string | undefined,
  etaUtc: Date,
  windowMin = 60,
): ThunderstormOutlook => {
  const etaMs = etaUtc.getTime();
  let outlook = metarOutlook(metar, etaMs, windowMin);
  if (!taf || outlook === 'likely') {
    return outlook;
  }
  const windowStartMs = etaMs - windowMin * MS_PER_MINUTE;
  const windowEndMs = etaMs + windowMin * MS_PER_MINUTE;
  for (const group of parseTafGroups(taf, etaMs)) {
    const overlaps = group.startMs < windowEndMs && group.endMs > windowStartMs;
    if (overlaps) {
      outlook = strongerOutlook(outlook, outlookFor(strongestThunderstorm(group.tokens), group.probabilistic));
    }
  }
  return outlook;
};
