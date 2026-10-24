// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { metarObservationTime, metarPresentWeather, metarThunderstorm, parseMetarWind } from './metarTokens';

describe('parseMetarWind', () => {
  it('reads direction, speed and gust', () => {
    expect(parseMetarWind('EDDF 231150Z 36020G28KT 9999 FEW040 12/08 Q1015')).toEqual({
      dirDeg: 360,
      speedKt: 20,
      gustKt: 28,
    });
  });

  it('returns null direction for variable wind', () => {
    expect(parseMetarWind('EDDF 231150Z VRB05KT 9999 Q1015')?.dirDeg).toBeNull();
  });

  it('converts metres per second', () => {
    expect(parseMetarWind('UUEE 231150Z 18010MPS 9999 Q1015')?.speedKt).toBe(19);
  });

  it('ignores a wind in the trend group', () => {
    expect(parseMetarWind('EDDF 231150Z 00000KT 9999 TEMPO 27030KT')?.speedKt).toBe(0);
  });

  it('returns null for missing or empty reports', () => {
    expect(parseMetarWind(undefined)).toBeNull();
    expect(parseMetarWind('')).toBeNull();
  });
});

describe('present weather and thunderstorm', () => {
  it('lists the weather groups only', () => {
    expect(metarPresentWeather('EDDF 231150Z 27010KT 4000 -SHRA BR BKN010 Q1015')).toEqual(['-SHRA', 'BR']);
  });

  it('does not mistake an airport code for weather', () => {
    expect(metarPresentWeather('EDDS 231150Z 27010KT 9999 Q1015')).toEqual([]);
  });

  it('finds TS and CB in the observation only', () => {
    expect(metarThunderstorm('EDDF 231150Z 27010KT 3000 +TSRA BKN020CB Q1015')).toBe('overhead');
    expect(metarThunderstorm('EDDF 231150Z 27010KT 9999 BKN020CB Q1015')).toBe('overhead');
    expect(metarThunderstorm('EDDF 231150Z 27010KT 9999 FEW020 Q1015 TEMPO TSRA')).toBe('none');
  });

  it('reports a thunderstorm in the vicinity separately', () => {
    expect(metarThunderstorm('EDDF 231150Z 27010KT 9999 VCTS FEW020 Q1015')).toBe('vicinity');
    expect(metarThunderstorm('EDDF 231150Z 27010KT 9999 VCTS TSRA Q1015')).toBe('overhead');
  });
});

describe('metarObservationTime', () => {
  it('reads the DDHHMMZ group', () => {
    expect(metarObservationTime('EDDF 231150Z 27010KT 9999 Q1015')).toEqual({ day: 23, hour: 11, minute: 50 });
    expect(metarObservationTime('EDDF 27010KT 9999')).toBeNull();
    expect(metarObservationTime(undefined)).toBeNull();
  });
});
