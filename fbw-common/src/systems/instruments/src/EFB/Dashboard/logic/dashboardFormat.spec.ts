// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  adviceReplacements,
  formatHoursMinutes,
  formatLocalClock,
  formatSignedWeight,
  formatUtcClock,
  formatWeight,
  formatWeightThousands,
  localOffsetSeconds,
  ofpRouteText,
  simbriefWeightKg,
  simbriefWeightSumKg,
  sunsetLocal,
} from './dashboardFormat';
import { sunsetUtc } from './sunset';

describe('simbriefWeightKg', () => {
  it('keeps a kilogram OFP and converts a pound OFP', () => {
    expect(simbriefWeightKg('61200', 'kgs')).toBe(61200);
    expect(simbriefWeightKg(1000, 'lbs')).toBeCloseTo(453.59, 2);
  });

  it('reads an unparsable value as 0', () => {
    expect(simbriefWeightKg('', 'kgs')).toBe(0);
  });
});

describe('simbriefWeightSumKg', () => {
  it('adds the OFP values as numbers, not as text', () => {
    expect(simbriefWeightSumKg(['1407', '920'], 'kgs')).toBe(2327);
    expect(simbriefWeightSumKg(['1000', 1000], 'lbs')).toBeCloseTo(907.185, 2);
  });

  it('skips missing values', () => {
    expect(simbriefWeightSumKg([undefined, '920'], 'kgs')).toBe(920);
  });
});

describe('formatWeight', () => {
  it('shows kilograms rounded to tens with grouped thousands', () => {
    expect(formatWeight(68243, true)).toBe('68,240 kg');
    expect(formatWeight(512345, true)).toBe('512,350 kg');
    expect(formatWeight(990, true)).toBe('990 kg');
  });

  it('converts to pounds for a user in pounds', () => {
    expect(formatWeight(1000, false)).toBe('2,200 lb');
  });
});

describe('formatHoursMinutes', () => {
  it('formats minutes as h:mm', () => {
    expect(formatHoursMinutes(65)).toBe('1:05');
    expect(formatHoursMinutes(0)).toBe('0:00');
    expect(formatHoursMinutes(-12)).toBe('0:00');
  });
});

describe('clocks', () => {
  it('formats a UTC time with the z suffix', () => {
    expect(formatUtcClock(Date.UTC(2026, 9, 23, 13, 5))).toBe('13:05z');
  });

  it('formats seconds after local midnight', () => {
    expect(formatLocalClock(14 * 3600 + 12 * 60 + 59)).toBe('14:12');
  });
});

describe('adviceReplacements', () => {
  it('converts kilogram args to the user unit and adds the unit name', () => {
    expect(adviceReplacements({ delta: '1000' }, ['delta'], false)).toEqual([{ unit: 'lb' }, { delta: '2,200' }]);
    expect(adviceReplacements({ delta: '700' }, ['delta'], true)).toEqual([{ unit: 'kg' }, { delta: '700' }]);
  });

  it('passes other args through', () => {
    expect(adviceReplacements({ icao: 'EGLL' }, undefined, true)).toEqual([{ unit: 'kg' }, { icao: 'EGLL' }]);
  });
});

describe('sunsetLocal', () => {
  // Paris, 23 October 2026, 12:00 UTC; local time is UTC + 2 h
  const NOW = Date.UTC(2026, 9, 23, 12, 0) / 1000;

  it('shows the sunset in local time with the minutes left', () => {
    const sunsetSeconds = sunsetUtc(49.0, 2.55, new Date(NOW * 1000))!.getTime() / 1000;
    const result = sunsetLocal(NOW, 49.0, 2.55, 7200)!;
    expect(result.minutesLeft).toBeCloseTo((sunsetSeconds - NOW) / 60, 5);
    expect(result.clock).toBe(formatLocalClock((sunsetSeconds + 7200) % 86400));
  });

  it('is null once the sun has set, and in the polar night', () => {
    expect(sunsetLocal(Date.UTC(2026, 9, 23, 23, 0) / 1000, 49.0, 2.55, 7200)).toBeNull();
    expect(sunsetLocal(Date.UTC(2026, 11, 21, 12, 0) / 1000, 85, 0, 0)).toBeNull();
  });
});

describe('localOffsetSeconds', () => {
  it('is local minus UTC', () => {
    expect(localOffsetSeconds(14 * 3600, 12 * 3600)).toBe(7200);
  });

  it('folds a day boundary between the clocks into the time zone', () => {
    // 01:00 local while it is 23:00 UTC: UTC + 2 h
    expect(localOffsetSeconds(3600, 23 * 3600)).toBe(7200);
    // 22:00 local while it is 03:00 UTC: UTC - 5 h
    expect(localOffsetSeconds(22 * 3600, 3 * 3600)).toBe(-5 * 3600);
  });
});

describe('formatSignedWeight', () => {
  it('signs a difference and shows no sign for zero', () => {
    expect(formatSignedWeight(400, true)).toBe('+400 kg');
    expect(formatSignedWeight(-400, false)).toBe('-880 lb');
    expect(formatSignedWeight(3, true)).toBe('0 kg');
  });
});

describe('formatWeightThousands', () => {
  it('gives tonnes or thousands of pounds with one decimal', () => {
    expect(formatWeightThousands(6840, true)).toBe('6.8 t');
    expect(formatWeightThousands(180000, true)).toBe('180.0 t');
    expect(formatWeightThousands(6803.9, false)).toBe('15.0 klb');
  });
});

describe('ofpRouteText', () => {
  const ofp = {
    departingAirport: 'LFPG',
    departingRunway: '09L',
    route: 'LATRA6W LATRA UN859 VESAN',
    arrivingAirport: 'EGLL',
    arrivingRunway: '27R',
  };

  it('runs from runway to runway', () => {
    expect(ofpRouteText(ofp)).toBe('LFPG/09L LATRA6W LATRA UN859 VESAN EGLL/27R');
  });

  it('leaves out a missing runway or route', () => {
    expect(ofpRouteText({ ...ofp, departingRunway: '', route: '' })).toBe('LFPG EGLL/27R');
  });
});
