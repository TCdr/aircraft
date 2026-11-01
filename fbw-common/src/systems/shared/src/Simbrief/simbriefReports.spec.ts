// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ofpMetarsByIcao, ofpTafsByIcao } from './simbriefReports';

describe('ofpTafsByIcao', () => {
  it('files each TAF of the plan under the ICAO written in it', () => {
    expect(
      ofpTafsByIcao({
        orig_metar: 'RJAA 242100Z VRB02KT 0500 FG BKN001 18/17 Q1015',
        orig_taf: 'TAF RJAA 241705Z 2418/2600 29004KT 9999 FEW020',
        dest_taf: 'TAF AMD RJOA 241905Z 2418/2600 32005KT 6000 -SHRA BKN012',
        altn_taf: 'RJBB 241700Z 2418/2524 05008KT 9999 FEW030',
      }),
    ).toEqual({
      RJAA: 'TAF RJAA 241705Z 2418/2600 29004KT 9999 FEW020',
      RJOA: 'TAF AMD RJOA 241905Z 2418/2600 32005KT 6000 -SHRA BKN012',
      RJBB: 'RJBB 241700Z 2418/2524 05008KT 9999 FEW030',
    });
  });

  it('reads lists of TAFs (several alternates) and joins the lines of a TAF', () => {
    expect(
      ofpTafsByIcao({
        altn_taf: [
          'TAF RJBB 241700Z 2418/2524 05008KT\n  TEMPO 2421/2503 4000 BR',
          'TAF RJFF 241700Z 2418/2524 VRB03KT',
        ],
        etops_taf: ['TAF PGUM 241700Z 2418/2524 09012KT'],
      }),
    ).toEqual({
      RJBB: 'TAF RJBB 241700Z 2418/2524 05008KT TEMPO 2421/2503 4000 BR',
      RJFF: 'TAF RJFF 241700Z 2418/2524 VRB03KT',
      PGUM: 'TAF PGUM 241700Z 2418/2524 09012KT',
    });
  });

  it('keeps the first TAF of an airport that is both departure and alternate, and skips empty entries', () => {
    expect(
      ofpTafsByIcao({
        orig_taf: 'TAF RJAA 241705Z 2418/2600 29004KT',
        altn_taf: 'TAF RJAA 241100Z 2412/2518 30010KT',
        toaltn_taf: '',
        enrt_taf: {},
      }),
    ).toEqual({ RJAA: 'TAF RJAA 241705Z 2418/2600 29004KT' });
  });

  it('gives nothing without a weather block', () => {
    expect(ofpTafsByIcao(undefined)).toEqual({});
    expect(ofpTafsByIcao('none')).toEqual({});
  });
});

describe('ofpMetarsByIcao', () => {
  it('files each METAR of the plan under the ICAO written in it, with or without the METAR word', () => {
    expect(
      ofpMetarsByIcao({
        orig_metar: 'RJAA 242100Z 18005KT 9999 FEW030 20/15 Q1015',
        dest_metar: 'METAR RJOA 242100Z VRB02KT 0500 FG BKN001 18/17 Q1015',
        altn_metar: 'SPECI COR RJBB 242110Z 05008KT 9999 FEW030 20/14 Q1016',
        orig_taf: 'TAF RJAA 241705Z 2418/2600 29004KT 9999 FEW020',
      }),
    ).toEqual({
      RJAA: 'RJAA 242100Z 18005KT 9999 FEW030 20/15 Q1015',
      RJOA: 'METAR RJOA 242100Z VRB02KT 0500 FG BKN001 18/17 Q1015',
      RJBB: 'SPECI COR RJBB 242110Z 05008KT 9999 FEW030 20/14 Q1016',
    });
  });

  it('skips empty entries and gives nothing without a weather block', () => {
    expect(ofpMetarsByIcao({ orig_metar: '', dest_metar: {} })).toEqual({});
    expect(ofpMetarsByIcao(undefined)).toEqual({});
  });
});
