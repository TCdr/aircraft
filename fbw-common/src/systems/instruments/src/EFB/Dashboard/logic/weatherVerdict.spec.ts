// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  metarWindGroup,
  routeWindComponentKt,
  runwayWind,
  stationVerdict,
  StationVerdict,
  worstVerdictIndex,
} from './weatherVerdict';

const METAR_WEST = 'EGLL 231420Z 25018G28KT 9999 SCT030 14/08 Q1009';
const METAR_NORTH = 'LFPG 231400Z 36032KT 9999 FEW035 12/04 Q1016 NOSIG';

describe('runwayWind', () => {
  it('splits the wind along and across the runway', () => {
    expect(runwayWind(METAR_WEST, 270)).toEqual({ headwindKt: 17, crosswindKt: 6, gustCrosswindKt: 10 });
  });

  it('gives a negative headwind for a tailwind', () => {
    expect(runwayWind(METAR_WEST, 90)!.headwindKt).toBe(-17);
  });

  it('is null for a variable or calm wind, or without a runway', () => {
    expect(runwayWind('EGLL 231420Z VRB03KT 9999 Q1009', 270)).toBeNull();
    expect(runwayWind('EGLL 231420Z 00000KT 9999 Q1009', 270)).toBeNull();
    expect(runwayWind(METAR_WEST, null)).toBeNull();
  });
});

describe('metarWindGroup', () => {
  it('finds the wind group', () => {
    expect(metarWindGroup(METAR_WEST)).toBe('25018G28KT');
    expect(metarWindGroup(undefined)).toBeNull();
  });
});

describe('stationVerdict', () => {
  const station = (metar: string | undefined, runwayHeadingDeg: number | null, taf?: string) => ({
    icao: 'XXXX',
    metar,
    taf,
    runwayHeadingDeg,
    isDeparture: false,
  });

  it('says so when there is no report', () => {
    expect(stationVerdict(station(undefined, 270), 'a32nx', null, true).key).toBe('Dashboard.Weather.Verdict.NoReport');
  });

  it('flags a crosswind close to the limit', () => {
    // 32 kt straight across a 090 runway, the A32NX demonstrated value is 38 kt
    expect(stationVerdict(station(METAR_NORTH, 90), 'a32nx', null, false)).toEqual({
      tone: 'busy',
      key: 'Dashboard.Weather.Verdict.Crosswind',
      replacements: [{ crosswind: '32' }],
    });
    // above the 30 kt A380 certified value
    expect(stationVerdict(station(METAR_NORTH, 90), 'a380x', null, false).tone).toBe('warn');
  });

  it('flags a thunderstorm in the METAR at an arrival airport', () => {
    const metar = 'EGLL 231420Z 25008KT 9999 TSRA SCT030CB 14/08 Q1009';
    const eta = new Date(Date.UTC(2026, 9, 23, 14, 40));
    expect(stationVerdict(station(metar, 270), 'a32nx', eta, true).key).toBe('Dashboard.Weather.Verdict.Thunderstorm');
  });

  it('is OK otherwise', () => {
    expect(stationVerdict(station(METAR_WEST, 270), 'a32nx', null, true).tone).toBe('active');
  });
});

describe('worstVerdictIndex', () => {
  const verdict = (tone: StationVerdict['tone']): StationVerdict => ({ tone, key: '', replacements: [] });

  it('picks the most severe station, none when all are fine', () => {
    expect(worstVerdictIndex([verdict('busy'), verdict('warn'), verdict('active')])).toBe(1);
    expect(worstVerdictIndex([verdict('active'), verdict('idle')])).toBe(-1);
  });
});

describe('routeWindComponentKt', () => {
  const west = { lat: 50, long: 0 };
  const east = { lat: 50, long: 10 };

  it('is a tailwind for a wind from behind and a headwind for a wind from ahead', () => {
    // flying east (course about 086 at the start), wind from the west
    expect(routeWindComponentKt(270, 100, west, east)).toBeGreaterThan(95);
    expect(routeWindComponentKt(90, 100, west, east)).toBeLessThan(-95);
  });

  it('is about zero for a wind across the course', () => {
    expect(Math.abs(routeWindComponentKt(0, 100, { lat: 0, long: 0 }, { lat: 0, long: 10 })!)).toBe(0);
  });

  it('is null without wind or course', () => {
    expect(routeWindComponentKt(270, 0, west, east)).toBeNull();
    expect(routeWindComponentKt(NaN, 50, west, east)).toBeNull();
    expect(routeWindComponentKt(270, 50, west, west)).toBeNull();
  });
});
