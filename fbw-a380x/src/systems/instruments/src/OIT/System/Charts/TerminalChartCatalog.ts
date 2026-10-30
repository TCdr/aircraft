// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { LidoChartType } from '@microsoft/msfs-sdk';
import { OIS_MONTHS } from '../OisDateTime';
import { ChartRunway, TerminalChart } from './TerminalChartSource';

/** The tabs of the terminal charts, in the order of the tab bar */
export const CHART_TABS = ['GEN', 'ARPT', 'DEP', 'ARR', 'APPR'] as const;

export type ChartTab = (typeof CHART_TABS)[number];

/**
 * Design choice: the provider gives a chart type, the crew looks for a purpose. General information, airport and
 * taxi facilities, departure, arrival and approach procedures are the groups of the terminal charts; the type of each
 * chart picks its group. An unknown type is general information, so that no chart is hidden.
 */
const TAB_OF_TYPE: Readonly<Record<string, ChartTab>> = {
  [LidoChartType.Aoi]: 'GEN',
  [LidoChartType.Mrc]: 'GEN',
  [LidoChartType.Lvc]: 'GEN',
  [LidoChartType.Unknown]: 'GEN',
  [LidoChartType.Agc]: 'ARPT',
  [LidoChartType.Apc]: 'ARPT',
  [LidoChartType.Afc]: 'ARPT',
  [LidoChartType.Sid]: 'DEP',
  [LidoChartType.SidPt]: 'DEP',
  [LidoChartType.SidInitialClimb]: 'DEP',
  [LidoChartType.ObstDep]: 'DEP',
  [LidoChartType.Star]: 'ARR',
  [LidoChartType.Iac]: 'APPR',
  [LidoChartType.Vac]: 'APPR',
};

/** Where a type without a place in TYPE_ORDER sorts: last */
const LAST_TYPE_ORDER = 9999;

/**
 * Where the charts of a type sit among the charts of their tab: the graphic chart before its text, the main chart
 * first
 */
const TYPE_ORDER: Readonly<Record<string, number>> = {
  [LidoChartType.Sid]: 0,
  [LidoChartType.SidInitialClimb]: 1,
  [LidoChartType.SidPt]: 2,
  [LidoChartType.ObstDep]: 3,
  [LidoChartType.Star]: 0,
  [LidoChartType.Iac]: 0,
  [LidoChartType.Vac]: 1,
  [LidoChartType.Afc]: 0,
  [LidoChartType.Agc]: 1,
  [LidoChartType.Apc]: 3,
  [LidoChartType.Aoi]: 0,
  [LidoChartType.Mrc]: 1,
  [LidoChartType.Lvc]: 2,
  [LidoChartType.Unknown]: LAST_TYPE_ORDER,
};

const SID_TYPES: readonly string[] = [LidoChartType.Sid, LidoChartType.SidInitialClimb, LidoChartType.SidPt];

/** The designators in the order of the runways of an airport, left to right */
const DESIGNATOR_ORDER = ['L', 'C', 'R', 'T'];

/** The most airports of the selection: what fits on one line of keys */
export const MAX_AIRPORTS = 6;

/** The manual entries kept: the airports of the flight plan come first and take their keys */
export const MAX_MANUAL_AIRPORTS = 4;

/**
 * @param type the chart type of the provider
 * @returns the tab of the chart
 */
export function chartTabOf(type: string): ChartTab {
  return TAB_OF_TYPE[type] ?? 'GEN';
}

/**
 * @param a a text
 * @param b another text
 * @returns the alphabetical order of the two
 */
function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * @param runway a runway of a chart
 * @returns its name, e.g. 09L
 */
export function runwayLabel(runway: ChartRunway): string {
  return `${runway.number}${DESIGNATOR_ORDER.indexOf(runway.designator) >= 0 ? runway.designator : ''}`;
}

/**
 * @param a a runway
 * @param b another runway
 * @returns the order of the two: by number, then left, centre, right
 */
function compareRunways(a: ChartRunway, b: ChartRunway): number {
  if (a.number !== b.number) {
    return compareText(a.number, b.number);
  }
  return DESIGNATOR_ORDER.indexOf(a.designator) - DESIGNATOR_ORDER.indexOf(b.designator);
}

/**
 * @param runways the runways of a chart
 * @returns the runways in the order of the airport
 */
function sortedRunways(runways: readonly ChartRunway[]): ChartRunway[] {
  return runways.slice().sort(compareRunways);
}

/**
 * @param a a chart
 * @param b another chart
 * @returns the order of the two charts in the list
 */
function compareCharts(a: TerminalChart, b: TerminalChart): number {
  // The charts of one procedure stay together, whatever their types: the sheets of a SID, then its text
  if (SID_TYPES.indexOf(a.type) >= 0 && SID_TYPES.indexOf(b.type) >= 0 && a.name !== b.name) {
    return compareText(a.name, b.name);
  }
  const typeOrder = (TYPE_ORDER[a.type] ?? LAST_TYPE_ORDER) - (TYPE_ORDER[b.type] ?? LAST_TYPE_ORDER);
  if (typeOrder !== 0) {
    return typeOrder;
  }
  const runwaysA = sortedRunways(a.runways);
  const runwaysB = sortedRunways(b.runways);
  if (runwaysA.length > 0 && runwaysB.length > 0) {
    const byRunway = compareRunways(runwaysA[0], runwaysB[0]);
    if (byRunway !== 0) {
      return byRunway;
    }
  }
  return compareText(a.name, b.name);
}

/**
 * @param charts the charts of an airport
 * @param tab a tab
 * @returns the charts of the tab in the order of the list
 */
export function chartsOfTab(charts: readonly TerminalChart[], tab: ChartTab): TerminalChart[] {
  return charts.filter((chart) => chartTabOf(chart.type) === tab).sort(compareCharts);
}

/**
 * @param charts the charts of a tab
 * @returns the runways they apply to, each once, in the order of the airport
 */
export function runwayChoices(charts: readonly TerminalChart[]): string[] {
  const runways: ChartRunway[] = [];
  for (const chart of charts) {
    for (const runway of chart.runways) {
      if (!runways.some((known) => compareRunways(known, runway) === 0)) {
        runways.push(runway);
      }
    }
  }
  return runways.sort(compareRunways).map(runwayLabel);
}

/**
 * Design choice: a chart that names no runway (a general chart) stays in the list when the crew picks a runway: the
 * filter hides the charts of other runways only.
 * @param charts the charts of a tab
 * @param runway the runway the crew picked, null for all
 * @returns the charts that apply to the runway
 */
export function filterByRunway(charts: readonly TerminalChart[], runway: string | null): TerminalChart[] {
  if (runway === null) {
    return charts.slice();
  }
  return charts.filter((chart) => chart.runways.length === 0 || chart.runways.some((r) => runwayLabel(r) === runway));
}

/** How the type of a chart reads in the list, where several charts of a procedure share its name */
const TYPE_TEXT: Readonly<Record<string, string>> = {
  [LidoChartType.SidPt]: 'SID TEXT',
  [LidoChartType.SidInitialClimb]: 'SID CLIMB',
  [LidoChartType.ObstDep]: 'OBST DEP',
  [LidoChartType.Unknown]: '',
};

/**
 * @param type the chart type of the provider
 * @returns the type as shown in the list, empty for an unknown type
 */
export function chartTypeText(type: string): string {
  return TYPE_TEXT[type] ?? type;
}

/**
 * @param chart a chart
 * @returns the runways of the chart as shown next to its name, empty when it names none
 */
export function chartRunwayText(chart: TerminalChart): string {
  return sortedRunways(chart.runways).map(runwayLabel).join('/');
}

/**
 * @param text an airport identifier as typed or taken from the flight plan
 * @returns the ICAO code in capitals, null when it is not a four character code
 */
export function normalizeIcao(text: string | null | undefined): string | null {
  const icao = (text ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(icao) ? icao : null;
}

/**
 * @param from the departure airport of the flight plan
 * @param to its destination airport
 * @param manual the airports the crew added
 * @returns the airports of the selection: those of the flight plan first, then the added ones, each once
 */
export function airportList(from: string | null, to: string | null, manual: readonly string[]): string[] {
  const list: string[] = [];
  for (const candidate of [from, to].concat(manual)) {
    const icao = normalizeIcao(candidate);
    if (icao !== null && list.indexOf(icao) < 0) {
      list.push(icao);
    }
  }
  return list.slice(0, MAX_AIRPORTS);
}

/**
 * @param manual the airports the crew added
 * @param text the airport the crew typed
 * @returns the added airports with the new one last; the oldest goes when there are too many; unchanged for a code that
 * is not valid or already there
 */
export function addManualAirport(manual: readonly string[], text: string): string[] {
  const icao = normalizeIcao(text);
  if (icao === null || manual.indexOf(icao) >= 0) {
    return manual.slice();
  }
  return manual.concat([icao]).slice(-MAX_MANUAL_AIRPORTS);
}

/**
 * @param manual the airports the crew added
 * @param icao the airport to remove
 * @returns the added airports without it
 */
export function removeManualAirport(manual: readonly string[], icao: string): string[] {
  return manual.filter((known) => known !== icao);
}

export interface ChartValidity {
  readonly from: number;
  readonly until: number;
}

/**
 * Design choice: the database is valid where every chart of the airport is valid, so the window starts at the latest
 * start and ends at the earliest end. A provider that gives no dates, or windows that do not overlap, give no validity.
 * @param charts the charts of an airport index
 * @returns the validity window, null when there is none to show
 */
export function chartValidity(charts: readonly TerminalChart[]): ChartValidity | null {
  let from: number | null = null;
  let until: number | null = null;
  for (const chart of charts) {
    if (chart.validFrom !== null && (from === null || chart.validFrom > from)) {
      from = chart.validFrom;
    }
    if (chart.validUntil !== null && (until === null || chart.validUntil < until)) {
      until = chart.validUntil;
    }
  }
  return from !== null && until !== null && from <= until ? { from, until } : null;
}

/**
 * @param t unix ms
 * @returns the UTC date as DD-MMM-YY, e.g. 07-AUG-08
 */
export function formatChartDate(t: number): string {
  const date = new Date(t);
  return `${String(date.getUTCDate()).padStart(2, '0')}-${OIS_MONTHS[date.getUTCMonth()]}-${String(date.getUTCFullYear() % 100).padStart(2, '0')}`;
}

/**
 * @param validity a validity window
 * @returns the two dates as the FLT OPS STS page shows them, e.g. 07-AUG-08 27-AUG-08
 */
export function formatChartValidity(validity: ChartValidity): string {
  return `${formatChartDate(validity.from)} ${formatChartDate(validity.until)}`;
}
