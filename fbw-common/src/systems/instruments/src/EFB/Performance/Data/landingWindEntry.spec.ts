// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  formatLandingWindEntry,
  landingWindForCheck,
  metarLandingWind,
  parseLandingWindEntry,
  windAgainstLimits,
} from './landingWindEntry';
import { assessLandingWind, rankRunwaysByWind } from './landingWind';

const A380_LIMITS = { crosswind: 30, tailwind: 10 };

/** A parsed METAR as the parser gives it: a variable wind comes out as 180 degrees */
const metar = (rawWind: string, wind: { degrees: number; speed_kts: number; gust_kts: number }) => ({
  raw_text: `LFPG 311030Z ${rawWind} 9999 FEW040 12/08 Q1015`,
  wind,
});

describe('landing wind entry', () => {
  it('parses a gust after the speed', () => {
    expect(parseLandingWindEntry('270/15G35')).toEqual({ windDirection: 270, windMagnitude: 15, windGust: 35 });
  });

  it('parses an entry without a gust as before', () => {
    expect(parseLandingWindEntry('270/15')).toEqual({ windDirection: 270, windMagnitude: 15, windGust: undefined });
  });

  it('ignores a gust that is not above the steady speed', () => {
    expect(parseLandingWindEntry('270/15G15')?.windGust).toBeUndefined();
    expect(parseLandingWindEntry('270/15G10')?.windGust).toBeUndefined();
  });

  it('rejects an entry that is not a direction and speed', () => {
    expect(parseLandingWindEntry('TL10')).toBeUndefined();
    expect(parseLandingWindEntry('270/15G')).toBeUndefined();
  });

  it('gives a page without gust handling the steady wind of an entry with a gust', () => {
    const entered = parseLandingWindEntry('270/15G35');
    expect(entered?.windDirection).toBe(270);
    expect(entered?.windMagnitude).toBe(15);
  });

  it('writes the gust string as ddd/ssGgg and reads it back unchanged', () => {
    const entry = formatLandingWindEntry(270, 15, 35);
    expect(entry).toBe('270/15G35');
    expect(parseLandingWindEntry(entry)).toEqual({ windDirection: 270, windMagnitude: 15, windGust: 35 });
    expect(formatLandingWindEntry(90, 8, undefined)).toBe('090/08');
  });
});

describe('landing wind from a METAR', () => {
  it('keeps the gust of 270/15G35 and writes it into the entry', () => {
    const w = metarLandingWind(metar('27015G35KT', { degrees: 270, speed_kts: 15, gust_kts: 35 }), 0);
    expect(w).toEqual({
      windDirection: 270,
      windMagnitude: 15,
      windGust: 35,
      windVariable: false,
      windEntry: '270/15G35',
    });
  });

  it('turns the direction magnetic', () => {
    const w = metarLandingWind(metar('27015KT', { degrees: 270, speed_kts: 15, gust_kts: 15 }), -2);
    expect(w.windDirection).toBe(272);
    expect(w.windGust).toBeUndefined();
    expect(w.windEntry).toBe('272/15');
  });

  it('turns VRB08 into the worst case: a tailwind of the full speed, with no direction', () => {
    const w = metarLandingWind(metar('VRB08KT', { degrees: 180, speed_kts: 8, gust_kts: 8 }), 3);
    expect(w).toEqual({
      windDirection: undefined,
      windMagnitude: -8,
      windGust: undefined,
      windVariable: true,
      windEntry: 'TL8',
    });
  });

  it('includes the gust in the VRB worst case', () => {
    const w = metarLandingWind(metar('VRB08G20KT', { degrees: 180, speed_kts: 8, gust_kts: 20 }), 3);
    expect(w.windMagnitude).toBe(-20);
    expect(w.windEntry).toBe('TL20');
  });

  it('takes VRB08G20KT as the main wind group for the variable worst case', () => {
    const w = metarLandingWind(
      {
        raw_text: 'EGLL 311020Z VRB08G20KT 9999 FEW040 12/08 Q1015',
        wind: { degrees: 180, speed_kts: 8, gust_kts: 20 },
      },
      0,
    );
    expect(w.windVariable).toBe(true);
    expect(w.windMagnitude).toBe(-20);
  });

  it('ignores a VRB group of a trend after the main wind', () => {
    const w = metarLandingWind(
      {
        raw_text: 'EGLL 311020Z 24012KT 9999 FEW040 12/08 Q1015 BECMG VRB03KT',
        wind: { degrees: 240, speed_kts: 12, gust_kts: 12 },
      },
      0,
    );
    expect(w.windVariable).toBe(false);
    expect(w.windDirection).toBe(240);
    expect(w.windMagnitude).toBe(12);
  });

  it('ignores a gusting VRB group of a TEMPO trend', () => {
    const w = metarLandingWind(
      {
        raw_text: 'EGLL 311020Z 24012KT 9999 FEW040 12/08 Q1015 TEMPO VRB05G15KT',
        wind: { degrees: 240, speed_kts: 12, gust_kts: 12 },
      },
      0,
    );
    expect(w.windVariable).toBe(false);
    expect(w.windMagnitude).toBe(12);
  });

  it('keeps a wind from 180 degrees with a varying sector as a normal wind', () => {
    const w = metarLandingWind(metar('18012KT 150V210', { degrees: 180, speed_kts: 12, gust_kts: 12 }), 0);
    expect(w.windVariable).toBe(false);
    expect(w.windDirection).toBe(180);
  });
});

describe('wind given to the wind check', () => {
  it('passes the gust of the entry on', () => {
    expect(landingWindForCheck(270, 15, 35, false)).toEqual({ direction: 270, speed: 15, gust: 35 });
    expect(landingWindForCheck(270, 15, undefined, false)).toEqual({ direction: 270, speed: 15, gust: 15 });
  });

  it('shows VRB08 as the worst case the wind check ranks', () => {
    const wind = landingWindForCheck(undefined, -8, undefined, true);
    expect(wind).toEqual({ direction: 'VRB', speed: 8, gust: 8 });
    const ranked = rankRunwaysByWind([{ magneticBearing: 360 }], wind!.direction, wind!.speed, wind!.gust, {
      crosswind: 5,
      tailwind: 5,
    });
    expect(ranked[0].crosswindExceeded).toBe(true);
    expect(ranked[0].tailwindExceeded).toBe(true);
  });

  it('has no wind to check without a direction when the wind is not variable', () => {
    expect(landingWindForCheck(undefined, 10, undefined, false)).toBeUndefined();
    expect(landingWindForCheck(undefined, undefined, undefined, false)).toBeUndefined();
  });
});

describe('wind 270/15G35 on RWY 36', () => {
  const steady = { headwind: 0, crosswind: 15 };

  it('exceeds the crosswind limit with the gust, which the steady wind does not', () => {
    expect(assessLandingWind(steady, A380_LIMITS).crosswindExceeded).toBe(false);
    const gusting = windAgainstLimits(steady, 360, 270, 15, 35);
    expect(Math.round(gusting.crosswind)).toBe(35);
    expect(assessLandingWind(gusting, A380_LIMITS).crosswindExceeded).toBe(true);
  });

  it('is not listed as within the limits by the wind check', () => {
    const wind = landingWindForCheck(270, 15, 35, false)!;
    const [rwy36] = rankRunwaysByWind([{ magneticBearing: 360 }], wind.direction, wind.speed, wind.gust, A380_LIMITS);
    expect(rwy36.within).toBe(false);
    expect(rwy36.crosswindExceeded).toBe(true);
  });

  it('shows VRB18 over a 15 kt crosswind limit and as a full tailwind', () => {
    const steady = { headwind: -18, crosswind: 0 };
    const variable = windAgainstLimits(steady, 360, undefined, -18, undefined, true);
    expect(variable).toEqual({ headwind: -18, crosswind: 18 });
    expect(assessLandingWind(variable, { crosswind: 15, tailwind: 10 })).toEqual({
      crosswindExceeded: true,
      tailwindExceeded: true,
    });
  });

  it('includes the gust in the variable worst case', () => {
    const variable = windAgainstLimits({ headwind: -8, crosswind: 0 }, 360, undefined, -8, 20, true);
    expect(variable).toEqual({ headwind: -20, crosswind: 20 });
  });

  it('keeps the steady components when there is no gust or no direction', () => {
    expect(windAgainstLimits(steady, 360, 270, 15, undefined)).toBe(steady);
    const noDirection = { headwind: 10, crosswind: 0 };
    expect(windAgainstLimits(noDirection, 360, undefined, 10, 30)).toBe(noDirection);
  });
});
