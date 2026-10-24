// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { thunderstormAt } from './tafThunderstorm';

const at = (iso: string) => new Date(iso);
const QUIET_METAR = 'EDDF 231150Z 27010KT 9999 FEW040 12/08 Q1015';

describe('thunderstormAt', () => {
  const taf = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 SCT040 TEMPO 2316/2319 4000 TSRA BKN020CB';

  it('is likely when a TEMPO TS group overlaps the ETA', () => {
    expect(thunderstormAt(taf, QUIET_METAR, at('2026-10-23T17:00:00Z'))).toBe('likely');
  });

  it('is likely when the ETA is outside the group but the window reaches into it', () => {
    expect(thunderstormAt(taf, QUIET_METAR, at('2026-10-23T15:30:00Z'))).toBe('likely');
  });

  it('is none when the group is outside ETA plus the window', () => {
    expect(thunderstormAt(taf, QUIET_METAR, at('2026-10-23T13:00:00Z'))).toBe('none');
    expect(thunderstormAt(taf, QUIET_METAR, at('2026-10-24T02:00:00Z'))).toBe('none');
  });

  it('honours a custom window', () => {
    expect(thunderstormAt(taf, QUIET_METAR, at('2026-10-23T14:30:00Z'), 120)).toBe('likely');
    expect(thunderstormAt(taf, QUIET_METAR, at('2026-10-23T14:30:00Z'), 30)).toBe('none');
  });

  it('is prob for PROB30 and PROB40 groups', () => {
    const probTaf = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 SCT040 PROB30 TEMPO 2316/2319 TSRA';
    expect(thunderstormAt(probTaf, QUIET_METAR, at('2026-10-23T17:00:00Z'))).toBe('prob');
    const prob40 = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 SCT040 PROB40 2316/2319 TS';
    expect(thunderstormAt(prob40, QUIET_METAR, at('2026-10-23T17:00:00Z'))).toBe('prob');
  });

  it('is likely when a prob group and a plain group both apply', () => {
    const both = 'TAF EDDF 231100Z 2312/2418 27010KT PROB30 2316/2319 TSRA BECMG 2317/2318 BKN020CB';
    expect(thunderstormAt(both, QUIET_METAR, at('2026-10-23T17:00:00Z'))).toBe('likely');
  });

  it('treats a TS in the base forecast as likely and BECMG groups like TEMPO', () => {
    const base = 'TAF EDDF 231100Z 2312/2418 27010KT 4000 TSRA';
    expect(thunderstormAt(base, QUIET_METAR, at('2026-10-23T20:00:00Z'))).toBe('likely');
    const becoming = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 BECMG 2318/2320 4000 +TSRA';
    expect(thunderstormAt(becoming, QUIET_METAR, at('2026-10-23T19:00:00Z'))).toBe('likely');
  });

  it('ends the base forecast where the first FM group begins', () => {
    const fm = 'TAF EDDF 231100Z 2312/2418 27010KT 4000 TSRA FM231800 27010KT 9999 SCT040';
    expect(thunderstormAt(fm, QUIET_METAR, at('2026-10-23T20:00:00Z'))).toBe('none');
    expect(thunderstormAt(fm, QUIET_METAR, at('2026-10-23T14:00:00Z'))).toBe('likely');
  });

  it('applies an FM group until the next FM group', () => {
    const fm = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 FM231600 4000 TSRA FM232000 9999 SCT040';
    expect(thunderstormAt(fm, QUIET_METAR, at('2026-10-23T18:00:00Z'))).toBe('likely');
    expect(thunderstormAt(fm, QUIET_METAR, at('2026-10-23T22:30:00Z'))).toBe('none');
  });

  it('handles a group crossing midnight', () => {
    const night = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 TEMPO 2322/2402 TSRA';
    expect(thunderstormAt(night, QUIET_METAR, at('2026-10-24T01:00:00Z'))).toBe('likely');
    expect(thunderstormAt(night, QUIET_METAR, at('2026-10-24T04:00:00Z'))).toBe('none');
  });

  it('handles hour 24 as the end of the day', () => {
    const endOfDay = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 TEMPO 2322/2324 TSRA';
    expect(thunderstormAt(endOfDay, QUIET_METAR, at('2026-10-23T23:30:00Z'))).toBe('likely');
    expect(thunderstormAt(endOfDay, QUIET_METAR, at('2026-10-24T02:00:00Z'))).toBe('none');
  });

  it('handles a month change', () => {
    const monthEnd = 'TAF EDDF 311100Z 3112/0112 27010KT 9999 TEMPO 3122/0102 TSRA FM010600 27010KT 9999';
    expect(thunderstormAt(monthEnd, QUIET_METAR, at('2026-10-31T23:30:00Z'))).toBe('likely');
    expect(thunderstormAt(monthEnd, QUIET_METAR, at('2026-11-01T01:00:00Z'))).toBe('likely');
    expect(thunderstormAt(monthEnd, QUIET_METAR, at('2026-11-01T08:00:00Z'))).toBe('none');
  });

  it('handles a year change', () => {
    const newYear = 'TAF EDDF 311100Z 3118/0118 27010KT 9999 TEMPO 0100/0104 TSRA';
    expect(thunderstormAt(newYear, QUIET_METAR, at('2026-12-31T20:00:00Z'))).toBe('none');
    expect(thunderstormAt(newYear, QUIET_METAR, at('2027-01-01T02:00:00Z'))).toBe('likely');
  });

  describe('METAR', () => {
    const tsMetar = (time: string) => `EDDF ${time} 27010KT 3000 TSRA BKN020CB Q1015`;

    it('is likely for a thunderstorm or cumulonimbus observed within the window of the ETA', () => {
      expect(thunderstormAt(undefined, tsMetar('231650Z'), at('2026-10-23T17:00:00Z'))).toBe('likely');
      expect(thunderstormAt(undefined, 'EDDF 231650Z 27010KT 9999 BKN025CB Q1015', at('2026-10-23T17:00:00Z'))).toBe(
        'likely',
      );
    });

    it('is ignored when the observation is older than the window before the ETA', () => {
      expect(thunderstormAt(undefined, tsMetar('231050Z'), at('2026-10-23T17:00:00Z'))).toBe('none');
      expect(thunderstormAt(undefined, tsMetar('231550Z'), at('2026-10-23T17:00:00Z'))).toBe('none');
    });

    it('falls back to the TAF when the observation is stale', () => {
      const quietTaf = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 SCT040';
      expect(thunderstormAt(quietTaf, tsMetar('231050Z'), at('2026-10-23T17:00:00Z'))).toBe('none');
      expect(thunderstormAt(taf, tsMetar('231050Z'), at('2026-10-23T17:00:00Z'))).toBe('likely');
    });

    it('is ignored without an observation time', () => {
      expect(thunderstormAt(undefined, 'EDDF 27010KT 3000 TSRA', at('2026-10-23T17:00:00Z'))).toBe('none');
    });

    it('reads the observation time across a month change', () => {
      expect(thunderstormAt(undefined, tsMetar('010030Z'), at('2026-10-31T23:45:00Z'))).toBe('likely');
      expect(thunderstormAt(undefined, tsMetar('312345Z'), at('2026-11-01T00:15:00Z'))).toBe('likely');
    });
  });

  describe('thunderstorm in the vicinity', () => {
    it('is only prob in a METAR', () => {
      expect(thunderstormAt(undefined, 'EDDF 231650Z 27010KT 9999 VCTS FEW020 Q1015', at('2026-10-23T17:00:00Z'))).toBe(
        'prob',
      );
    });

    it('is only prob in a TAF group', () => {
      const vicinity = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 TEMPO 2316/2319 VCTS';
      expect(thunderstormAt(vicinity, undefined, at('2026-10-23T17:00:00Z'))).toBe('prob');
    });
  });

  describe('BECMG', () => {
    it('counts a thunderstorm from the start of the change, not only inside its period', () => {
      const becoming = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 BECMG 2314/2316 4000 TSRA';
      expect(thunderstormAt(becoming, undefined, at('2026-10-23T18:00:00Z'))).toBe('likely');
      expect(thunderstormAt(becoming, undefined, at('2026-10-23T14:30:00Z'))).toBe('likely');
      expect(thunderstormAt(becoming, undefined, at('2026-10-23T12:30:00Z'))).toBe('none');
    });

    it('ends earlier weather when the change is complete', () => {
      const clearing = 'TAF EDDF 231100Z 2312/2418 27010KT 4000 TSRA BECMG 2314/2316 9999 NSW';
      expect(thunderstormAt(clearing, undefined, at('2026-10-23T18:00:00Z'))).toBe('none');
      expect(thunderstormAt(clearing, undefined, at('2026-10-23T13:00:00Z'))).toBe('likely');
      // Still possible while the change is under way
      expect(thunderstormAt(clearing, undefined, at('2026-10-23T15:00:00Z'))).toBe('likely');
    });

    it('keeps the earlier weather when the change is only wind', () => {
      const windOnly = 'TAF EDDF 231100Z 2312/2418 27010KT 4000 TSRA BECMG 2314/2316 27015KT';
      expect(thunderstormAt(windOnly, undefined, at('2026-10-23T18:00:00Z'))).toBe('likely');
    });

    it('keeps the earlier weather when the change is only cloud or visibility', () => {
      const cloudOnly = 'TAF EDDF 231100Z 2312/2418 27010KT 4000 TSRA BECMG 2314/2316 BKN010';
      expect(thunderstormAt(cloudOnly, undefined, at('2026-10-23T18:00:00Z'))).toBe('likely');
      const visibilityOnly = 'TAF EDDF 231100Z 2312/2418 27010KT 4000 TSRA BECMG 2314/2316 8000';
      expect(thunderstormAt(visibilityOnly, undefined, at('2026-10-23T18:00:00Z'))).toBe('likely');
    });

    it('ends the earlier weather when the change brings CAVOK', () => {
      const cavok = 'TAF EDDF 231100Z 2312/2418 27010KT 4000 TSRA BECMG 2314/2316 CAVOK';
      expect(thunderstormAt(cavok, undefined, at('2026-10-23T18:00:00Z'))).toBe('none');
    });

    it('keeps weather through a wind-only change that follows a weather change', () => {
      const chain = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 BECMG 2314/2316 4000 TSRA BECMG 2317/2318 27020KT';
      expect(thunderstormAt(chain, undefined, at('2026-10-23T21:00:00Z'))).toBe('likely');
    });

    it('replaces an FM group in the same way', () => {
      const fmThenBecmg = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 FM231400 27010KT 4000 TSRA BECMG 2317/2319 9999 NSW';
      expect(thunderstormAt(fmThenBecmg, undefined, at('2026-10-23T15:00:00Z'))).toBe('likely');
      expect(thunderstormAt(fmThenBecmg, undefined, at('2026-10-23T21:00:00Z'))).toBe('none');
    });

    it('lets an FM group end the weather of an earlier BECMG', () => {
      const becomingThenFm = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 BECMG 2314/2316 4000 TSRA FM231800 27010KT 9999';
      expect(thunderstormAt(becomingThenFm, undefined, at('2026-10-23T17:00:00Z'))).toBe('likely');
      expect(thunderstormAt(becomingThenFm, undefined, at('2026-10-23T21:00:00Z'))).toBe('none');
    });

    it('works across midnight and a month change', () => {
      const midnight = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 BECMG 2322/2401 4000 TSRA';
      expect(thunderstormAt(midnight, undefined, at('2026-10-24T05:00:00Z'))).toBe('likely');
      const monthEnd = 'TAF EDDF 311100Z 3112/0112 27010KT 4000 TSRA BECMG 3122/0102 9999 NSW';
      expect(thunderstormAt(monthEnd, undefined, at('2026-10-31T23:00:00Z'))).toBe('likely');
      expect(thunderstormAt(monthEnd, undefined, at('2026-11-01T05:00:00Z'))).toBe('none');
    });

    it('does not stretch TEMPO or PROB groups beyond their own period', () => {
      const tempo = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 TEMPO 2314/2316 TSRA BECMG 2317/2319 8000';
      expect(thunderstormAt(tempo, undefined, at('2026-10-23T20:00:00Z'))).toBe('none');
    });
  });

  it('is none without any report or with an unreadable TAF', () => {
    expect(thunderstormAt(undefined, undefined, at('2026-10-23T17:00:00Z'))).toBe('none');
    expect(thunderstormAt('', '', at('2026-10-23T17:00:00Z'))).toBe('none');
    expect(thunderstormAt('TAF NIL', QUIET_METAR, at('2026-10-23T17:00:00Z'))).toBe('none');
  });
});
