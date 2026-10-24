// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MetarWind } from '../../../../Dashboard/logic/metarTokens';
import { TafMainEntry, TafTemporaryGroup, parseTafTimeline } from '../../../../Dashboard/logic/tafThunderstorm';
import { FlightCategory, ceilingFt, flightCategory } from './flightCategory';
import { ReportElements, Visibility, parseReportElements } from './reportElements';
import { hourStarts } from './stationTime';

const MS_PER_HOUR = 3_600_000;

export interface TafHour {
  startMs: number;
  /** Lowest and highest visibility over the main forecast and the temporary groups; null when none states one */
  visibility: { min: Visibility; max: Visibility } | null;
  /** Lowest and highest ceiling; null inside means no ceiling; undefined when no group states clouds */
  ceilingFt?: { min: number | null; max: number | null };
}

export const mergeElements = (under: ReportElements, over: ReportElements): ReportElements => ({
  wind: over.wind ?? under.wind,
  visibility: over.visibility ?? under.visibility,
  weather: over.weather ?? under.weather,
  clouds: over.clouds ?? under.clouds,
});

/**
 * The main forecast at an instant: FM groups replace everything, a BECMG group changes what it states once complete,
 * or as soon as it starts when `withChangesInProgress`
 */
export const mainStateAt = (
  entries: TafMainEntry[],
  instantMs: number,
  withChangesInProgress: boolean,
): ReportElements => {
  let state: ReportElements = {};
  entries.forEach((entry) => {
    if (entry.startMs > instantMs) {
      return;
    }
    if (entry.kind !== 'becoming') {
      state = parseReportElements(entry.tokens);
    } else if (withChangesInProgress || entry.changeEndMs <= instantMs) {
      state = mergeElements(state, parseReportElements(entry.tokens));
    }
  });
  return state;
};

export const sameWind = (a: MetarWind | undefined, b: MetarWind | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const stateCategory = (state: ReportElements): FlightCategory | null =>
  flightCategory(state.clouds ? ceilingFt(state.clouds) : undefined, state.visibility?.metres);

/** No ceiling counts as the highest */
const ceilingRank = (ceiling: number | null): number => (ceiling === null ? Infinity : ceiling);

const hourOf = (startMs: number, entries: TafMainEntry[], temporary: TafTemporaryGroup[]): TafHour => {
  const endMs = startMs + MS_PER_HOUR;
  const atStart = mainStateAt(entries, startMs, false);
  const atEnd = mainStateAt(entries, endMs - 1, true);
  const changingEntry = entries.find(
    (entry) =>
      (entry.kind === 'becoming' && entry.startMs < endMs && entry.changeEndMs > startMs) ||
      (entry.kind === 'from' && entry.startMs > startMs && entry.startMs < endMs),
  );
  const states: ReportElements[] = changingEntry ? [atStart, atEnd] : [atStart];
  temporary.forEach((group) => {
    if (group.startMs < endMs && group.endMs > startMs) {
      states.push(mergeElements(atEnd, parseReportElements(group.tokens)));
    }
  });

  let visibility: TafHour['visibility'] = null;
  let ceiling: TafHour['ceilingFt'];
  for (const state of states) {
    if (state.visibility) {
      visibility = visibility
        ? {
            min: state.visibility.metres < visibility.min.metres ? state.visibility : visibility.min,
            max: state.visibility.metres > visibility.max.metres ? state.visibility : visibility.max,
          }
        : { min: state.visibility, max: state.visibility };
    }
    if (state.clouds) {
      const value = ceilingFt(state.clouds);
      ceiling = ceiling
        ? {
            min: ceilingRank(value) < ceilingRank(ceiling.min) ? value : ceiling.min,
            max: ceilingRank(value) > ceilingRank(ceiling.max) ? value : ceiling.max,
          }
        : { min: value, max: value };
    }
  }

  return { startMs, visibility, ceilingFt: ceiling };
};

/** The TAF hour by hour over its validity; empty when it has no validity period */
export const tafHours = (taf: string, referenceMs: number): TafHour[] => {
  const timeline = parseTafTimeline(taf, referenceMs);
  if (!timeline) {
    return [];
  }
  return hourStarts(timeline.validity.startMs, timeline.validity.endMs).map((startMs) =>
    hourOf(startMs, timeline.main, timeline.temporary),
  );
};

const LINE_MARKER = /^(FM\d{6}|BECMG|TEMPO|PROB\d{2})$/;

/** The raw TAF with each change group on a line of its own; PROBxx TEMPO stays on one line */
export const tafLines = (taf: string): string[] => {
  const lines: string[][] = [];
  const tokens = taf.trim().split(/\s+/);
  tokens.forEach((token, index) => {
    const continuesProb = token === 'TEMPO' && /^PROB\d{2}$/.test(tokens[index - 1] ?? '');
    if (lines.length === 0 || (LINE_MARKER.test(token) && !continuesProb)) {
      lines.push([token]);
    } else {
      lines[lines.length - 1].push(token);
    }
  });
  return lines.map((line) => line.join(' '));
};
