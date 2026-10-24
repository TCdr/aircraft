// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { parseMetarReport, parseReportElements } from './reportElements';
import { RJOA_METAR_LIFR, RJOA_METAR_VFR } from './rjoaFixtures';

describe('parseMetarReport', () => {
  it('reads the RJOA 1800Z METAR: variable wind, 10 km or more, three layers, 20/19, Q1014', () => {
    const report = parseMetarReport(RJOA_METAR_VFR);
    expect(report.wind).toEqual({ dirDeg: null, speedKt: 2, gustKt: null });
    expect(report.visibility).toEqual({ metres: 10000, orMore: true });
    expect(report.weather).toBeUndefined();
    expect(report.clouds).toEqual([
      { cover: 'FEW', baseFt: 4800, convective: null },
      { cover: 'BKN', baseFt: 20000, convective: null },
      { cover: 'OVC', baseFt: 21000, convective: null },
    ]);
    expect(report.temperatureC).toBe(20);
    expect(report.dewPointC).toBe(19);
    expect(report.qnh?.hpa).toBe(1014);
    expect(report.qnh?.inHg).toBeCloseTo(29.94, 2);
  });

  it('reads the RJOA 0400Z METAR: 070/6, 2000 m, three weather groups, a surface layer', () => {
    const report = parseMetarReport(RJOA_METAR_LIFR);
    expect(report.wind).toEqual({ dirDeg: 70, speedKt: 6, gustKt: null });
    expect(report.visibility).toEqual({ metres: 2000, orMore: false });
    expect(report.weather).toEqual(['-SHRA', 'BCFG', 'BR']);
    expect(report.clouds?.map((layer) => `${layer.cover}${layer.baseFt}`)).toEqual(['FEW0', 'SCT300', 'BKN300']);
  });

  it('reads US groups: P6SM, 1 1/2SM, A-pressure, negative temperatures and CB layers', () => {
    const newYork = parseMetarReport('METAR KJFK 241751Z 31015G25KT P6SM BKN035CB M02/M10 A2992');
    expect(newYork.visibility).toEqual({ metres: 9654, orMore: true });
    expect(newYork.wind).toEqual({ dirDeg: 310, speedKt: 15, gustKt: 25 });
    expect(newYork.clouds).toEqual([{ cover: 'BKN', baseFt: 3500, convective: 'CB' }]);
    const boston = parseMetarReport('METAR KBOS 241754Z 04012KT 1 1/2SM BR OVC008 M05/M07 A3001 RMK AO2');
    expect(boston.visibility).toEqual({ metres: 2414, orMore: false });
    expect(boston.temperatureC).toBe(-5);
    expect(boston.dewPointC).toBe(-7);
    expect(boston.qnh?.hpa).toBeCloseTo(1016.3, 1);
  });

  it('leaves out what the report does not give: no temperature group, no QNH', () => {
    const report = parseMetarReport('METAR XXXX 241800Z 27005KT 9999 SCT030');
    expect(report.temperatureC).toBeUndefined();
    expect(report.qnh).toBeUndefined();
  });
});

describe('parseReportElements', () => {
  it('CAVOK states the visibility, no weather and no cloud', () => {
    expect(parseReportElements(['27005KT', 'CAVOK'])).toEqual({
      wind: { dirDeg: 270, speedKt: 5, gustKt: null },
      visibility: { metres: 10000, orMore: true },
      weather: [],
      clouds: [],
    });
  });

  it('a change group states only what it names: a wind-only BECMG leaves the rest undefined', () => {
    expect(parseReportElements(['04006KT'])).toEqual({ wind: { dirDeg: 40, speedKt: 6, gustKt: null } });
  });

  it('NSW and NSC state no weather and no cloud; VV is a layer', () => {
    expect(parseReportElements(['NSW', 'NSC'])).toEqual({ weather: [], clouds: [] });
    expect(parseReportElements(['0100', 'FG', 'VV001']).clouds).toEqual([
      { cover: 'VV', baseFt: 100, convective: null },
    ]);
  });
});
