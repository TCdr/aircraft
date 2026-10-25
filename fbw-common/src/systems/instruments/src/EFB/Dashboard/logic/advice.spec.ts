// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AdviceInput, StationWx, buildAdvice } from './advice';

const ETA = new Date('2026-10-23T17:00:00Z');
const QUIET_METAR = 'EDDF 231150Z 27005KT 9999 FEW040 12/08 Q1015';

const quiet: AdviceInput = {
  aircraft: 'a32nx',
  phase: 'cruise',
  hasOfp: true,
  minutesToTod: 60,
  destQnh: 1015,
  mda: 300,
  dh: 200,
  fmsHasFlightPlan: true,
  turnaroundLateMin: null,
  avgWindComponentKt: 10,
  activeFailures: 0,
  fuelUsedDeltaKg: null,
  etaUtc: ETA,
};
const input = (changes: Partial<AdviceInput>): AdviceInput => ({ ...quiet, ...changes });
const ids = (changes: Partial<AdviceInput>) => buildAdvice(input(changes)).map((advice) => advice.id);
const station = (changes: Partial<StationWx>): StationWx => ({
  icao: 'EDDF',
  metar: QUIET_METAR,
  runwayHeadingDeg: 270,
  isDeparture: false,
  ...changes,
});

describe('buildAdvice', () => {
  it('gives nothing when everything is fine', () => {
    expect(buildAdvice(quiet)).toEqual([]);
  });

  describe('thunderstorm', () => {
    const tsMetar = 'EDDF 231650Z 27005KT 3000 TSRA BKN020CB Q1015';
    const probTaf = 'TAF EDDF 231100Z 2312/2418 27010KT 9999 PROB30 TEMPO 2316/2319 TSRA';

    it('is red for a forecast or observed thunderstorm at the destination', () => {
      const [advice] = buildAdvice(input({ dest: station({ metar: tsMetar }) }));
      expect(advice).toMatchObject({ id: 'thunderstorm-dest', tone: 'warn', args: { icao: 'EDDF' } });
      expect(advice.link).toBeUndefined();
      expect(advice.linkKey).toBe('Dashboard.Advice.Link.Weather');
    });

    it('is amber for a PROB group', () => {
      const [advice] = buildAdvice(input({ dest: station({ taf: probTaf }) }));
      expect(advice).toMatchObject({ id: 'thunderstorm-dest', tone: 'busy' });
    });

    it('also covers the alternate', () => {
      expect(ids({ altn: station({ icao: 'EDDS', metar: tsMetar }) })).toEqual(['thunderstorm-altn']);
    });

    it('is off without an ETA, without a station or when the weather is quiet', () => {
      expect(ids({ dest: station({ metar: tsMetar }), etaUtc: null })).toEqual([]);
      expect(ids({ dest: undefined })).toEqual([]);
      expect(ids({ dest: station({}) })).toEqual([]);
    });

    it('ignores a METAR that is hours older than the arrival', () => {
      const staleMetar = 'EDDF 231050Z 27005KT 3000 TSRA BKN020CB Q1015';
      expect(ids({ phase: 'atGate', dest: station({ metar: staleMetar }) })).toEqual([]);
    });

    it('is off after landing', () => {
      expect(ids({ phase: 'taxiIn', dest: station({ metar: tsMetar }) })).toEqual([]);
    });

    it('skips a station without METAR or TAF (failed fetch) without crashing', () => {
      expect(ids({ dest: station({ metar: undefined, taf: undefined }) })).toEqual([]);
      expect(ids({ dest: station({ metar: '', taf: '' }) })).toEqual([]);
    });
  });

  describe('crosswind', () => {
    const wind = (text: string) => `EDDF 231150Z ${text} 9999 FEW040 12/08 Q1015`;

    it('A32NX is amber from 80 % of the dry demonstrated value', () => {
      // 31 kt crosswind is above 0.8 * 38 = 30.4
      const [advice] = buildAdvice(input({ dest: station({ metar: wind('36031KT') }) }));
      expect(advice).toMatchObject({
        id: 'crosswind-dest',
        tone: 'busy',
        messageKey: 'Dashboard.Advice.Crosswind.Demonstrated',
      });
      expect(ids({ dest: station({ metar: wind('36030KT') }) })).toEqual([]);
    });

    it('A32NX uses the wet limit for rain', () => {
      const [advice] = buildAdvice(input({ dest: station({ metar: wind('36024KT').replace('9999', '-RA') }) }));
      expect(advice).toMatchObject({
        tone: 'busy',
        messageKey: 'Dashboard.Advice.Crosswind.Recommended',
        args: { crosswind: '24', limit: '29' },
      });
    });

    it('A32NX above the demonstrated value stays amber, never red', () => {
      const [advice] = buildAdvice(input({ dest: station({ metar: wind('36045KT') }) }));
      expect(advice.tone).toBe('busy');
    });

    it('A380X is amber near the certified limit and red above it', () => {
      const near = buildAdvice(input({ aircraft: 'a380x', dest: station({ metar: wind('36025KT') }) }));
      expect(near[0]).toMatchObject({ tone: 'busy', messageKey: 'Dashboard.Advice.Crosswind.Certified' });
      expect(ids({ aircraft: 'a380x', dest: station({ metar: wind('36023KT') }) })).toEqual([]);
      const over = buildAdvice(input({ aircraft: 'a380x', dest: station({ metar: wind('36020G32KT') }) }));
      expect(over[0]).toMatchObject({ tone: 'warn', messageKey: 'Dashboard.Advice.CrosswindExceeded' });
    });

    it('uses the departure station on the ground and the destination in the air', () => {
      const dep = station({ metar: wind('36035KT'), isDeparture: true });
      expect(ids({ phase: 'taxiOut', dep })).toEqual(['crosswind-dep']);
      expect(ids({ phase: 'cruise', dep })).toEqual([]);
      expect(ids({ phase: 'cruise', dest: station({ metar: wind('36035KT') }) })).toEqual(['crosswind-dest']);
      expect(ids({ phase: 'taxiOut', dest: station({ metar: wind('36035KT') }) })).toEqual([]);
    });

    it('is off for variable wind, calm wind, a missing heading or a missing METAR', () => {
      expect(ids({ dest: station({ metar: wind('VRB35KT') }) })).toEqual([]);
      expect(ids({ dest: station({ metar: wind('00000KT') }) })).toEqual([]);
      expect(ids({ dest: station({ metar: wind('36035KT'), runwayHeadingDeg: null }) })).toEqual([]);
      expect(ids({ dest: station({ metar: undefined }) })).toEqual([]);
    });
  });

  describe('approach data', () => {
    it('is amber in descent when the QNH is not entered', () => {
      const [advice] = buildAdvice(input({ phase: 'descent', minutesToTod: 0, destQnh: 0 }));
      expect(advice).toMatchObject({ id: 'appr-data', tone: 'busy' });
      expect(advice.link).toBeUndefined();
      expect(advice.linkKey).toBe('Dashboard.Advice.Link.McduPerfAppr');
    });

    it('names the MFD page on the A380X', () => {
      expect(buildAdvice(input({ aircraft: 'a380x', phase: 'descent', minutesToTod: 0, destQnh: 0 }))[0].linkKey).toBe(
        'Dashboard.Advice.Link.MfdPerfAppr',
      );
    });

    it('is amber when the minimums are not entered', () => {
      expect(ids({ phase: 'descent', minutesToTod: 0, mda: 0, dh: -1 })).toEqual(['appr-data']);
      expect(ids({ phase: 'descent', minutesToTod: 0, mda: 0, dh: 200 })).toEqual([]);
    });

    it('starts 15 minutes before the top of descent in cruise', () => {
      expect(ids({ minutesToTod: 15, destQnh: 0 })).toEqual(['appr-data']);
      expect(ids({ minutesToTod: 16, destQnh: 0 })).toEqual([]);
      expect(ids({ minutesToTod: null, destQnh: 0 })).toEqual([]);
    });

    it('follows the planned top of descent over an early FMS descent phase', () => {
      // The FMS can switch to descent long before the T/D (an FCU altitude below the cruise level)
      expect(ids({ phase: 'descent', minutesToTod: 24, destQnh: 0 })).toEqual([]);
      expect(ids({ phase: 'climb', minutesToTod: 10, destQnh: 0 })).toEqual(['appr-data']);
    });

    it('uses the descent phase only without a planned top of descent', () => {
      expect(ids({ phase: 'descent', minutesToTod: null, destQnh: 0 })).toEqual(['appr-data']);
    });

    it('is off when the data is entered, and on the ground', () => {
      expect(ids({ phase: 'descent', minutesToTod: 0 })).toEqual([]);
      expect(ids({ phase: 'atGate', destQnh: 0 })).toEqual([]);
    });
  });

  describe('FMS not initialised', () => {
    it('is amber at the gate with an OFP and no FMS flight plan', () => {
      expect(ids({ phase: 'atGate', fmsHasFlightPlan: false })).toEqual(['fms-not-initialised']);
    });

    it('is off with a flight plan, without an OFP (the no-OFP block explains) or away from the gate', () => {
      expect(ids({ phase: 'atGate' })).toEqual([]);
      expect(ids({ phase: 'atGate', hasOfp: false, fmsHasFlightPlan: false })).toEqual(['no-ofp']);
      expect(ids({ phase: 'cruise', fmsHasFlightPlan: false })).toEqual([]);
    });
  });

  describe('turnaround', () => {
    it('is amber when the projected end is later than the margin before STD', () => {
      expect(ids({ phase: 'atGate', turnaroundLateMin: 10 })).toEqual(['turnaround-late']);
      expect(ids({ phase: 'atGate', turnaroundLateMin: -4 })).toEqual(['turnaround-late']);
    });

    it('is off when early enough, unknown, or after pushback', () => {
      expect(ids({ phase: 'atGate', turnaroundLateMin: -5 })).toEqual([]);
      expect(ids({ phase: 'atGate', turnaroundLateMin: null })).toEqual([]);
      expect(ids({ phase: 'taxiOut', turnaroundLateMin: 20 })).toEqual([]);
    });
  });

  describe('strong wind', () => {
    it('is blue in cruise and descent for a large route wind component of either sign', () => {
      const [headwind] = buildAdvice(input({ avgWindComponentKt: -60 }));
      expect(headwind).toMatchObject({
        id: 'strong-wind',
        tone: 'active',
        messageKey: 'Dashboard.Advice.StrongHeadwind',
        args: { wind: '60' },
      });
      expect(headwind.link).toBeUndefined();
      expect(ids({ phase: 'descent', avgWindComponentKt: 55 })).toEqual(['strong-wind']);
      expect(buildAdvice(input({ avgWindComponentKt: 55 }))[0].messageKey).toBe('Dashboard.Advice.StrongTailwind');
    });

    it('is off for moderate wind, an unknown wind or other phases', () => {
      expect(ids({ avgWindComponentKt: 49 })).toEqual([]);
      expect(ids({ avgWindComponentKt: null })).toEqual([]);
      expect(ids({ phase: 'taxiOut', avgWindComponentKt: 80 })).toEqual([]);
    });
  });

  describe('no OFP and failures', () => {
    it('explains the missing OFP with a link to the import', () => {
      expect(buildAdvice(input({ hasOfp: false }))[0]).toMatchObject({
        id: 'no-ofp',
        tone: 'active',
        link: '/dispatch',
      });
    });

    it('lists active failures with their count', () => {
      expect(buildAdvice(input({ activeFailures: 2 }))[0]).toMatchObject({
        id: 'active-failures',
        tone: 'busy',
        args: { count: '2' },
        link: '/failures',
      });
      expect(ids({ activeFailures: 0 })).toEqual([]);
    });
  });

  describe('fuel used after arrival', () => {
    it('is blue when the burn differs from the plan by the margin or more', () => {
      expect(buildAdvice(input({ phase: 'arrived', fuelUsedDeltaKg: 700 }))[0]).toMatchObject({
        id: 'fuel-used',
        tone: 'active',
        messageKey: 'Dashboard.Advice.FuelUsedHigher',
        args: { delta: '700' },
        kilogramArgs: ['delta'],
      });
      expect(buildAdvice(input({ phase: 'arrived', fuelUsedDeltaKg: -700 }))[0].messageKey).toBe(
        'Dashboard.Advice.FuelUsedLower',
      );
    });

    it('is off for small or unknown differences and before arrival', () => {
      expect(ids({ phase: 'arrived', fuelUsedDeltaKg: 499 })).toEqual([]);
      expect(ids({ phase: 'arrived', fuelUsedDeltaKg: null })).toEqual([]);
      expect(ids({ phase: 'cruise', fuelUsedDeltaKg: 900 })).toEqual([]);
    });
  });

  it('orders red, amber, blue and keeps rule order inside a tone', () => {
    const result = buildAdvice(
      input({
        phase: 'descent',
        minutesToTod: 0,
        hasOfp: false,
        destQnh: 0,
        activeFailures: 1,
        avgWindComponentKt: 70,
        dest: station({ metar: 'EDDF 231650Z 27005KT 3000 TSRA Q1015' }),
      }),
    );
    expect(result.map((advice) => advice.id)).toEqual([
      'thunderstorm-dest',
      'appr-data',
      'active-failures',
      'strong-wind',
      'no-ofp',
    ]);
  });

  it('tags each advice with what it is about', () => {
    const result = buildAdvice(
      input({
        phase: 'descent',
        minutesToTod: 0,
        hasOfp: false,
        destQnh: 0,
        activeFailures: 1,
        avgWindComponentKt: 70,
        dest: station({ metar: 'EDDF 231650Z 27005KT 3000 TSRA Q1015' }),
      }),
    );
    expect(result.map((advice) => [advice.id, advice.category])).toEqual([
      ['thunderstorm-dest', 'weather'],
      ['appr-data', 'fms'],
      ['active-failures', 'failures'],
      ['strong-wind', 'wind'],
      ['no-ofp', 'ofp'],
    ]);
    expect(buildAdvice(input({ phase: 'arrived', fuelUsedDeltaKg: 900 }))[0].category).toBe('fuel');
    expect(buildAdvice(input({ phase: 'atGate', turnaroundLateMin: 0 }))[0].category).toBe('ground');
  });
});
