// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ofpNotams } from './simbriefNotams';

const record = (location: string, text: string) => ({ location_icao: location, notam_text: text });

describe('ofpNotams', () => {
  it('sorts the plan NOTAMs by the airport they are for', () => {
    const notams = ofpNotams(
      {
        notams: {
          notamdrec: [
            record('RJAA', 'A0001/08 RWY 16R CLSD'),
            record('LFBO', 'B0002/08 ILS RWY 14R U/S'),
            record('LFPG', 'C0003/08 TWY A CLSD'),
            record('RJBB', 'D0004/08 FUEL NOT AVBL'),
          ],
        },
      },
      'RJAA',
      'LFBO',
      'LFPG',
    );
    expect(notams.departure.map((n) => n.text)).toEqual(['A0001/08 RWY 16R CLSD']);
    expect(notams.destination.map((n) => n.text)).toEqual(['B0002/08 ILS RWY 14R U/S']);
    expect(notams.alternate.map((n) => n.text)).toEqual(['C0003/08 TWY A CLSD']);
    expect(notams.enroute.map((n) => n.location)).toEqual(['RJBB']);
  });

  it('reads a list that SimBrief gives as one object, and the raw text when the clean text is empty', () => {
    const notams = ofpNotams(
      { notams: { notamdrec: { location_icao: 'RJAA', notam_text: ' ', notam_raw: 'E0005/08 NOTAMN' } } },
      'RJAA',
      'LFBO',
      'LFPG',
    );
    expect(notams.departure).toEqual([{ text: 'E0005/08 NOTAMN', location: 'RJAA' }]);
  });

  it('takes the NOTAMs of an airport block and does not list a NOTAM twice', () => {
    const notams = ofpNotams(
      {
        notams: { notamdrec: [record('RJAA', 'A0001/08 RWY 16R CLSD')] },
        origin: { notam: [record('RJAA', 'A0001/08 RWY 16R CLSD'), { notam_text: 'F0006/08 APRON CLSD' }] },
      },
      'RJAA',
      'LFBO',
      'LFPG',
    );
    expect(notams.departure.map((n) => n.text)).toEqual(['A0001/08 RWY 16R CLSD', 'F0006/08 APRON CLSD']);
  });

  it('is empty without any NOTAM', () => {
    expect(ofpNotams({}, 'RJAA', 'LFBO', 'LFPG')).toEqual({
      departure: [],
      destination: [],
      alternate: [],
      enroute: [],
    });
  });
});
