// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { tafBands } from './tafBands';
import { RJOA_TAF } from './rjoaFixtures';

const REFERENCE_MS = Date.UTC(2026, 9, 24, 18, 20);
const at = (day: number, hour: number) => Date.UTC(2026, 9, day, hour);

describe('tafBands, RJOA 241705Z', () => {
  const bands = tafBands(RJOA_TAF, REFERENCE_MS);

  it('spans the validity, 24 18Z to 26 00Z', () => {
    expect(bands?.startMs).toBe(at(24, 18));
    expect(bands?.endMs).toBe(at(26, 0));
  });

  it('keeps one MVFR band: the wind-only BECMG does not split it', () => {
    expect(bands?.base.map((span) => [span.startMs, span.endMs, span.category])).toEqual([
      [at(24, 18), at(26, 0), 'MVFR'],
    ]);
    expect(bands?.base[0].elements.visibility?.metres).toBe(6000);
  });

  it('gives each TEMPO its period and its category over the main forecast', () => {
    expect(bands?.temporary.map((bar) => [bar.label, bar.startMs, bar.endMs, bar.category, bar.lane])).toEqual([
      ['TEMPO', at(24, 21), at(25, 3), 'LIFR', 0],
      ['TEMPO', at(25, 3), at(25, 9), 'IFR', 0],
      ['TEMPO', at(25, 18), at(26, 0), 'LIFR', 0],
    ]);
  });

  it('shows the BECMG change from 09Z to 12Z and the wind before and after it', () => {
    expect(bands?.becoming).toEqual([{ startMs: at(25, 9), endMs: at(25, 12) }]);
    expect(bands?.wind.map((span) => [span.startMs, span.endMs, span.wind?.dirDeg])).toEqual([
      [at(24, 18), at(25, 12), 320],
      [at(25, 12), at(26, 0), 40],
    ]);
  });
});

describe('tafBands, FM and overlapping groups', () => {
  const taf =
    'TAF KJFK 241720Z 2418/2524 31012KT P6SM SCT050 ' +
    'FM250200 28015G25KT P6SM BKN030 ' +
    'TEMPO 2504/2508 3SM -RA ' +
    'PROB30 2506/2509 2SM -RA BR OVC008';
  const bands = tafBands(taf, Date.UTC(2026, 9, 24, 18));

  it('splits the main band where an FM group changes the category', () => {
    expect(bands?.base.map((span) => [span.startMs, span.category])).toEqual([
      [at(24, 18), 'VFR'],
      [at(25, 2), 'MVFR'],
    ]);
  });

  it('puts a group that overlaps another on the next row', () => {
    expect(bands?.temporary.map((bar) => [bar.label, bar.lane, bar.category])).toEqual([
      ['TEMPO', 0, 'MVFR'],
      ['PROB30', 1, 'IFR'],
    ]);
  });

  it('gives nothing for a TAF without a validity period', () => {
    expect(tafBands('TAF XXXX NIL', Date.UTC(2026, 9, 24))).toBeNull();
  });
});
