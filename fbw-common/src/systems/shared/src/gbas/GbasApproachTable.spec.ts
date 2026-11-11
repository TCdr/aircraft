// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  findGbasApproachByChannel,
  findGbasApproachByRpi,
  findRunwayOfGbasApproach,
  GBAS_APPROACHES,
  GBAS_CHANNEL_MAX,
  GBAS_CHANNEL_MIN,
  gbasAirports,
  gbasApproachesOfAirport,
  gbasApproachesOfRunway,
  gbasRunwayDesignation,
  hasGbasApproaches,
  isGbasChannel,
} from './GbasApproachTable';

describe('the GBAS runway table', () => {
  it('holds the 39 charted procedures of the 7 airports', () => {
    expect(GBAS_APPROACHES).toHaveLength(39);
    const countByAirport: Record<string, number> = {};
    for (const approach of GBAS_APPROACHES) {
      countByAirport[approach.airport] = (countByAirport[approach.airport] ?? 0) + 1;
    }
    expect(countByAirport).toEqual({ EDDF: 12, KEWR: 5, KIAH: 6, KSFO: 4, LEMG: 2, YSSY: 6, YMML: 4 });
  });

  it('has every row checked against the current chart', () => {
    const toRecheck = GBAS_APPROACHES.filter((approach) => !approach.verified).map(
      (approach) => `${approach.airport} ${approach.runway}${approach.suffix} ${approach.rpi}`,
    );
    expect(toRecheck).toEqual([]);
  });

  it('names a chart of the current edition as the source of every row, not an archived copy', () => {
    const fromArchive = GBAS_APPROACHES.filter((approach) => /Wayback|not read/.test(approach.source)).map(
      (approach) => `${approach.airport} ${approach.runway}${approach.suffix}`,
    );
    expect(fromArchive).toEqual([]);
  });

  describe('every row', () => {
    it.each(GBAS_APPROACHES.map((approach) => [`${approach.airport} ${approach.runway}${approach.suffix}`, approach]))(
      '%s is well formed',
      (_name, approach) => {
        expect(approach.airport).toMatch(/^[A-Z]{4}$/);
        expect(approach.runway).toMatch(/^(0[1-9]|[12]\d|3[0-6])[LCR]?$/);
        expect(Number.isInteger(approach.channel)).toBe(true);
        expect(approach.channel).toBeGreaterThanOrEqual(GBAS_CHANNEL_MIN);
        expect(approach.channel).toBeLessThanOrEqual(GBAS_CHANNEL_MAX);
        // G, the runway number and one letter
        expect(approach.rpi).toMatch(/^G\d{2}[A-Z]$/);
        expect(approach.rpi.substring(1, 3)).toBe(approach.runway.substring(0, 2));
        expect(approach.suffix).toMatch(/^[YZ]?$/);
        expect(approach.gpa).toBeGreaterThanOrEqual(2.5);
        expect(approach.gpa).toBeLessThanOrEqual(3.5);
        expect(approach.tch).toBeGreaterThanOrEqual(30);
        expect(approach.tch).toBeLessThanOrEqual(80);
        expect(approach.course).toBeGreaterThanOrEqual(0);
        expect(approach.course).toBeLessThan(360);
        expect(typeof approach.verified).toBe('boolean');
        expect(approach.source.trim().length).toBeGreaterThan(0);
      },
    );

    it('has a channel that is unique at its airport', () => {
      const keys = GBAS_APPROACHES.map((approach) => `${approach.airport}/${approach.channel}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('is the only one with its runway and suffix', () => {
      const keys = GBAS_APPROACHES.map((approach) => `${approach.airport}/${approach.runway}/${approach.suffix}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('has a suffix whenever the runway end has several procedures', () => {
      for (const approach of GBAS_APPROACHES) {
        const sameRunway = gbasApproachesOfRunway(approach.airport, approach.runway);
        if (sameRunway.length > 1) {
          expect(approach.suffix).not.toBe('');
        }
      }
    });
  });

  describe('lookups', () => {
    it('finds the procedures of an airport', () => {
      expect(gbasApproachesOfAirport('KSFO').map((approach) => approach.runway)).toEqual(['19L', '19R', '28L', '28R']);
    });

    it('finds nothing at an airport that is not in the table', () => {
      expect(gbasApproachesOfAirport('LFPG')).toEqual([]);
      expect(gbasApproachesOfAirport('')).toEqual([]);
    });

    it('finds the Y and Z procedures of one EDDF runway end', () => {
      const approaches = gbasApproachesOfRunway('EDDF', '25C');
      expect(approaches.map((approach) => approach.suffix).sort()).toEqual(['Y', 'Z']);
      expect(approaches.find((approach) => approach.suffix === 'Z')).toMatchObject({
        channel: 31434,
        rpi: 'G25P',
        gpa: 3,
        tch: 50,
        course: 246,
      });
      expect(approaches.find((approach) => approach.suffix === 'Y')).toMatchObject({
        channel: 28968,
        rpi: 'G25M',
        gpa: 3.2,
      });
    });

    it('takes the runway with or without the RW prefix of the database ident', () => {
      expect(gbasApproachesOfRunway('KEWR', 'RW22L')).toEqual(gbasApproachesOfRunway('KEWR', '22L'));
      expect(gbasApproachesOfRunway('KEWR', 'RW22L')).toHaveLength(1);
    });

    it('does not find a runway of a listed airport that has no GLS', () => {
      expect(gbasApproachesOfRunway('KSFO', '01L')).toEqual([]);
      expect(gbasApproachesOfRunway('KSFO', '10L')).toEqual([]);
    });

    it('keeps the charted values of a procedure with an unusual slope and crossing height', () => {
      expect(gbasApproachesOfRunway('KEWR', '22L')[0]).toMatchObject({ channel: 21494, rpi: 'G22A', gpa: 3, tch: 43 });
      expect(gbasApproachesOfRunway('KSFO', '28L')[0]).toMatchObject({
        channel: 21037,
        rpi: 'G28B',
        gpa: 2.85,
        tch: 53,
      });
    });

    it('finds a procedure by channel at its airport only', () => {
      expect(findGbasApproachByChannel('LEMG', 21519)?.runway).toBe('12');
      expect(findGbasApproachByChannel('KSFO', 21519)).toBeUndefined();
      expect(findGbasApproachByChannel('LEMG', 20000)).toBeUndefined();
    });

    it('finds a procedure by RPI at its airport only, as RPIs repeat between airports', () => {
      expect(findGbasApproachByRpi('KSFO', 'G19A')?.channel).toBe(21448);
      expect(findGbasApproachByRpi('KEWR', 'G22A')?.runway).toBe('22L');
      expect(findGbasApproachByRpi('KIAH', 'G22A')).toBeUndefined();
      expect(findGbasApproachByRpi('KSFO', 'g19a')).toBeUndefined();
    });
  });

  describe('channel range', () => {
    it('accepts 20001 to 39999', () => {
      expect(isGbasChannel(20001)).toBe(true);
      expect(isGbasChannel(39999)).toBe(true);
      expect(isGbasChannel(31434)).toBe(true);
    });

    it('refuses 20000, 40000, fractions and non numbers', () => {
      expect(isGbasChannel(20000)).toBe(false);
      expect(isGbasChannel(40000)).toBe(false);
      expect(isGbasChannel(25000.5)).toBe(false);
      expect(isGbasChannel(Number.NaN)).toBe(false);
    });
  });
});

describe('GBAS runway designation', () => {
  it('reads the runway of an ARINC ident and of an ident prefixed with the airport', () => {
    expect(gbasRunwayDesignation('RW25C')).toBe('25C');
    expect(gbasRunwayDesignation('EDDF25C')).toBe('25C');
    expect(gbasRunwayDesignation('25C')).toBe('25C');
    expect(gbasApproachesOfRunway('KEWR', 'KEWR22L')).toHaveLength(1);
  });

  it('knows which airports have a procedure', () => {
    expect(hasGbasApproaches('EDDF')).toBe(true);
    expect(hasGbasApproaches('LFPG')).toBe(false);
    expect(gbasAirports().sort()).toEqual(['EDDF', 'KEWR', 'KIAH', 'KSFO', 'LEMG', 'YMML', 'YSSY']);
  });

  it('finds the sim runway of a table row in both ident styles, and none for a runway that is not there', () => {
    const row = { runway: '25C' };
    const arinc = { ident: 'RW25C' };
    const prefixed = { ident: 'EDDF25C' };

    expect(findRunwayOfGbasApproach([{ ident: 'RW25L' }, arinc], row)).toBe(arinc);
    expect(findRunwayOfGbasApproach([{ ident: 'EDDF25L' }, prefixed], row)).toBe(prefixed);
    expect(findRunwayOfGbasApproach([{ ident: 'RW25L' }], row)).toBeUndefined();
  });
});
