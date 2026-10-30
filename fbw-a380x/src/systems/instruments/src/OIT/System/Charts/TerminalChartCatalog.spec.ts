// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LidoChartType } from '@microsoft/msfs-sdk';
import {
  addManualAirport,
  airportList,
  chartRunwayText,
  chartsOfTab,
  chartTabOf,
  chartTypeText,
  chartValidity,
  filterByRunway,
  formatChartDate,
  formatChartValidity,
  MAX_AIRPORTS,
  MAX_MANUAL_AIRPORTS,
  normalizeIcao,
  removeManualAirport,
  runwayChoices,
  runwayLabel,
} from './TerminalChartCatalog';
import { ChartRunway, TerminalChart } from './TerminalChartSource';

/**
 * @param name the chart name
 * @param type the chart type of the provider
 * @param runways the runways of the chart
 * @param from the start of the validity
 * @param until the end of the validity
 * @returns a chart
 */
function chart(
  name: string,
  type: string,
  runways: ChartRunway[] = [],
  from: number | null = null,
  until: number | null = null,
) {
  return { guid: `${type}-${name}`, name, type, runways, validFrom: from, validUntil: until } as TerminalChart;
}

const rwy = (number: string, designator = ''): ChartRunway => ({ number, designator });

describe('chart tabs', () => {
  it.each([
    [LidoChartType.Aoi, 'GEN'],
    [LidoChartType.Mrc, 'GEN'],
    [LidoChartType.Lvc, 'GEN'],
    [LidoChartType.Agc, 'ARPT'],
    [LidoChartType.Apc, 'ARPT'],
    [LidoChartType.Afc, 'ARPT'],
    [LidoChartType.Sid, 'DEP'],
    [LidoChartType.SidPt, 'DEP'],
    [LidoChartType.SidInitialClimb, 'DEP'],
    [LidoChartType.ObstDep, 'DEP'],
    [LidoChartType.Star, 'ARR'],
    [LidoChartType.Iac, 'APPR'],
    [LidoChartType.Vac, 'APPR'],
  ])('puts %s on the %s tab', (type, tab) => {
    expect(chartTabOf(type)).toBe(tab);
  });

  it('keeps a chart of an unknown type, as general information', () => {
    expect(chartTabOf(LidoChartType.Unknown)).toBe('GEN');
    expect(chartTabOf('SOMETHING NEW')).toBe('GEN');
  });
});

describe('chart order', () => {
  it('keeps the sheets of one SID together, the graphic chart before its text', () => {
    const charts = [
      chart('TOU 2B', LidoChartType.SidPt),
      chart('ALB 1A', LidoChartType.Sid),
      chart('TOU 2B', LidoChartType.Sid),
      chart('ALB 1A', LidoChartType.SidPt),
      chart('TOU 2B', LidoChartType.SidInitialClimb),
    ];
    expect(chartsOfTab(charts, 'DEP').map((c) => `${c.name}/${c.type}`)).toEqual([
      'ALB 1A/SID',
      'ALB 1A/SIDPT',
      'TOU 2B/SID',
      'TOU 2B/SID Initial Climb',
      'TOU 2B/SIDPT',
    ]);
  });

  it('lists only the charts of the tab', () => {
    const charts = [chart('ILS 14L', LidoChartType.Iac), chart('STAR 1', LidoChartType.Star)];
    expect(chartsOfTab(charts, 'APPR').map((c) => c.name)).toEqual(['ILS 14L']);
    expect(chartsOfTab(charts, 'DEP')).toEqual([]);
  });

  it('orders the approach charts of one type by runway, left before centre before right', () => {
    const charts = [
      chart('ILS 32R', LidoChartType.Iac, [rwy('32', 'R')]),
      chart('ILS 14L', LidoChartType.Iac, [rwy('14', 'L')]),
      chart('ILS 14R', LidoChartType.Iac, [rwy('14', 'R')]),
      chart('ILS 32L', LidoChartType.Iac, [rwy('32', 'L')]),
    ];
    // the names are in the order of the runways too: the runways decide, not the names, when the names disagree
    const named = charts.map((c, i) => ({ ...c, name: `Z${i}` }));
    expect(chartsOfTab(named, 'APPR').map((c) => runwayLabel(c.runways[0]))).toEqual(['14L', '14R', '32L', '32R']);
  });

  it('puts a visual approach after the instrument approaches', () => {
    const charts = [chart('VOR A', LidoChartType.Vac), chart('ILS 14L', LidoChartType.Iac)];
    expect(chartsOfTab(charts, 'APPR').map((c) => c.type)).toEqual([LidoChartType.Iac, LidoChartType.Vac]);
  });

  it('breaks a tie by name', () => {
    const charts = [chart('B', LidoChartType.Afc), chart('A', LidoChartType.Afc)];
    expect(chartsOfTab(charts, 'ARPT').map((c) => c.name)).toEqual(['A', 'B']);
  });
});

describe('chart type text', () => {
  it('tells the sheets of one procedure apart', () => {
    expect(chartTypeText(LidoChartType.Sid)).toBe('SID');
    expect(chartTypeText(LidoChartType.SidPt)).toBe('SID TEXT');
    expect(chartTypeText(LidoChartType.SidInitialClimb)).toBe('SID CLIMB');
    expect(chartTypeText(LidoChartType.Iac)).toBe('IAC');
  });

  it('says nothing for an unknown type', () => {
    expect(chartTypeText(LidoChartType.Unknown)).toBe('');
  });
});

describe('runway filter', () => {
  const charts = [
    chart('ILS 14L', LidoChartType.Iac, [rwy('14', 'L')]),
    chart('ILS 32R', LidoChartType.Iac, [rwy('32', 'R')]),
    chart('VOR 14L/14R', LidoChartType.Iac, [rwy('14', 'R'), rwy('14', 'L')]),
    chart('RNP', LidoChartType.Iac),
  ];

  it('lists the runways of the charts once, in the order of the airport', () => {
    expect(runwayChoices(charts)).toEqual(['14L', '14R', '32R']);
  });

  it('keeps the charts of the runway and the charts without a runway', () => {
    expect(filterByRunway(charts, '14L').map((c) => c.name)).toEqual(['ILS 14L', 'VOR 14L/14R', 'RNP']);
    expect(filterByRunway(charts, '32R').map((c) => c.name)).toEqual(['ILS 32R', 'RNP']);
  });

  it('keeps every chart for all runways', () => {
    expect(filterByRunway(charts, null)).toHaveLength(4);
  });

  it('names the runways of a chart left to right', () => {
    expect(chartRunwayText(charts[2])).toBe('14L/14R');
    expect(chartRunwayText(charts[3])).toBe('');
  });

  it('ignores a designator it does not know', () => {
    expect(runwayLabel(rwy('09', 'NONE'))).toBe('09');
  });
});

describe('airport selection', () => {
  it('lists the airports of the flight plan first, then the added ones', () => {
    expect(airportList('LFBO', 'LFBD', ['EGLL'])).toEqual(['LFBO', 'LFBD', 'EGLL']);
  });

  it('lists an airport once, whatever the source', () => {
    expect(airportList('LFBO', 'LFBO', ['LFBO', 'EGLL', 'EGLL'])).toEqual(['LFBO', 'EGLL']);
  });

  it('leaves out an empty or invalid entry of the flight plan', () => {
    expect(airportList(null, 'lfbd', [])).toEqual(['LFBD']);
    expect(airportList('LF', '', ['EGLL'])).toEqual(['EGLL']);
  });

  it('shows no more airports than the keys', () => {
    const manual = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE'];
    expect(airportList('LFBO', 'LFBD', manual)).toHaveLength(MAX_AIRPORTS);
  });

  it('adds an airport last and in capitals', () => {
    expect(addManualAirport(['EGLL'], ' lfpg ')).toEqual(['EGLL', 'LFPG']);
  });

  it('refuses a code that is not four characters, and an airport already added', () => {
    expect(addManualAirport(['EGLL'], 'LFP')).toEqual(['EGLL']);
    expect(addManualAirport(['EGLL'], 'EGLL')).toEqual(['EGLL']);
    expect(addManualAirport([], 'LF-P')).toEqual([]);
  });

  it('drops the oldest added airport when there are too many', () => {
    const full = ['AAAA', 'BBBB', 'CCCC', 'DDDD'];
    expect(full).toHaveLength(MAX_MANUAL_AIRPORTS);
    expect(addManualAirport(full, 'EEEE')).toEqual(['BBBB', 'CCCC', 'DDDD', 'EEEE']);
  });

  it('removes an added airport', () => {
    expect(removeManualAirport(['EGLL', 'LFPG'], 'EGLL')).toEqual(['LFPG']);
  });

  it('accepts four letters or digits as an ICAO code', () => {
    expect(normalizeIcao('lfbo')).toBe('LFBO');
    expect(normalizeIcao('1AB2')).toBe('1AB2');
    expect(normalizeIcao('LFBOX')).toBeNull();
    expect(normalizeIcao(null)).toBeNull();
  });
});

describe('chart validity', () => {
  const day = (d: number) => Date.UTC(2026, 7, d);

  it('is the window in which every chart is valid', () => {
    const charts = [
      chart('A', LidoChartType.Sid, [], day(7), day(27)),
      chart('B', LidoChartType.Sid, [], day(10), day(30)),
      chart('C', LidoChartType.Sid, [], day(5), day(25)),
    ];
    expect(chartValidity(charts)).toEqual({ from: day(10), until: day(25) });
  });

  it('ignores a chart that has no dates', () => {
    const charts = [chart('A', LidoChartType.Sid, [], day(7), day(27)), chart('B', LidoChartType.Sid)];
    expect(chartValidity(charts)).toEqual({ from: day(7), until: day(27) });
  });

  it('is the window of a single chart', () => {
    expect(chartValidity([chart('A', LidoChartType.Sid, [], day(7), day(27))])).toEqual({
      from: day(7),
      until: day(27),
    });
  });

  it('is none when the provider gives no dates, or one date only', () => {
    expect(chartValidity([chart('A', LidoChartType.Sid), chart('B', LidoChartType.Star)])).toBeNull();
    expect(chartValidity([chart('A', LidoChartType.Sid, [], day(7), null)])).toBeNull();
    expect(chartValidity([])).toBeNull();
  });

  it('is none when the windows do not overlap', () => {
    const charts = [
      chart('A', LidoChartType.Sid, [], day(1), day(10)),
      chart('B', LidoChartType.Sid, [], day(20), day(30)),
    ];
    expect(chartValidity(charts)).toBeNull();
  });

  it('writes a date as day, month and year', () => {
    expect(formatChartDate(Date.UTC(2008, 7, 7))).toBe('07-AUG-08');
    expect(formatChartDate(Date.UTC(2026, 11, 31, 23, 59))).toBe('31-DEC-26');
  });

  it('writes the two dates of the window', () => {
    expect(formatChartValidity({ from: Date.UTC(2008, 7, 7), until: Date.UTC(2008, 7, 27) })).toBe(
      '07-AUG-08 27-AUG-08',
    );
  });
});
