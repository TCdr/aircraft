// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MetarWind } from '../../../../Dashboard/logic/metarTokens';
import { parseTafTimeline } from '../../../../Dashboard/logic/tafThunderstorm';
import { FlightCategory } from './flightCategory';
import { ReportElements, parseReportElements } from './reportElements';
import { mainStateAt, mergeElements, sameWind, stateCategory } from './tafHourly';

export interface TafSpan {
  startMs: number;
  endMs: number;
}

/** A stretch of the main forecast with the same category, visibility, weather and clouds */
export interface TafBaseSpan extends TafSpan {
  category: FlightCategory | null;
  elements: ReportElements;
}

/** A TEMPO or PROB group on its own row of the timeline */
export interface TafTemporaryBar extends TafSpan {
  label: string;
  /** The category of the main forecast with the group's own conditions laid over it */
  category: FlightCategory | null;
  /** What the group itself states */
  elements: ReportElements;
  /** Overlapping groups go on separate rows, 0 being the top one */
  lane: number;
}

export interface TafWindSpan extends TafSpan {
  wind: MetarWind | null;
}

export interface TafBands {
  startMs: number;
  endMs: number;
  base: TafBaseSpan[];
  temporary: TafTemporaryBar[];
  /** Where a BECMG change is in progress */
  becoming: TafSpan[];
  wind: TafWindSpan[];
}

/** Two states that look the same on the category band: the wind has its own track */
const sameConditions = (a: ReportElements, b: ReportElements): boolean =>
  JSON.stringify([a.visibility, a.weather, a.clouds]) === JSON.stringify([b.visibility, b.weather, b.clouds]);

/** Joins neighbouring spans that `same` finds equal */
const joined = <T extends TafSpan>(spans: T[], same: (a: T, b: T) => boolean): T[] =>
  spans.reduce<T[]>((result, span) => {
    const last = result[result.length - 1];
    if (last && same(last, span)) {
      last.endMs = span.endMs;
    } else {
      result.push({ ...span });
    }
    return result;
  }, []);

/** The first row free at the group's start; groups are taken in start order */
const laneOf = (laneEnds: number[], startMs: number): number => {
  const free = laneEnds.findIndex((endMs) => endMs <= startMs);
  return free >= 0 ? free : laneEnds.length;
};

/** The TAF as bands on a time axis: main forecast, temporary groups, BECMG changes, wind; null without validity */
export const tafBands = (taf: string, referenceMs: number): TafBands | null => {
  const timeline = parseTafTimeline(taf, referenceMs);
  if (!timeline) {
    return null;
  }
  const { startMs, endMs } = timeline.validity;
  const clip = (ms: number) => Math.min(Math.max(ms, startMs), endMs);

  // The main forecast only changes where an entry starts or a BECMG change completes
  const breaks = [startMs, endMs];
  timeline.main.forEach((entry) => {
    [entry.startMs, entry.changeEndMs].forEach((ms) => {
      if (ms > startMs && ms < endMs && breaks.indexOf(ms) < 0) {
        breaks.push(ms);
      }
    });
  });
  breaks.sort((a, b) => a - b);
  const pieces = breaks.slice(0, -1).map((pieceStart, index) => ({
    startMs: pieceStart,
    endMs: breaks[index + 1],
    state: mainStateAt(timeline.main, pieceStart, false),
  }));

  const base = joined(
    pieces.map((piece) => ({
      startMs: piece.startMs,
      endMs: piece.endMs,
      category: stateCategory(piece.state),
      elements: piece.state,
    })),
    (a, b) => a.category === b.category && sameConditions(a.elements, b.elements),
  );
  const wind = joined(
    pieces.map((piece) => ({ startMs: piece.startMs, endMs: piece.endMs, wind: piece.state.wind ?? null })),
    (a, b) => sameWind(a.wind ?? undefined, b.wind ?? undefined),
  );

  const laneEnds: number[] = [];
  const temporary = timeline.temporary
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map((group) => {
      const own = parseReportElements(group.tokens);
      const lane = laneOf(laneEnds, group.startMs);
      laneEnds[lane] = group.endMs;
      return {
        startMs: clip(group.startMs),
        endMs: clip(group.endMs),
        label: group.label,
        category: stateCategory(mergeElements(mainStateAt(timeline.main, group.startMs, true), own)),
        elements: own,
        lane,
      };
    });

  const becoming = timeline.main
    .filter((entry) => entry.kind === 'becoming')
    .map((entry) => ({ startMs: clip(entry.startMs), endMs: clip(entry.changeEndMs) }));

  return { startMs, endMs, base, temporary, becoming, wind };
};
