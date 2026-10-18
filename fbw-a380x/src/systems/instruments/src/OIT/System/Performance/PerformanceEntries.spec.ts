// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  KG_PER_LB,
  formatCrosswind,
  formatIsaDeviation,
  formatWeight,
  formatWindEntry,
  isaDeviation,
  parseQnhEntry,
  parseTemperatureEntry,
  parseWeightEntry,
  parseWindEntry,
  roundWeightUpForPerformance,
  runwayWind,
} from './PerformanceEntries';

describe('performance entries', () => {
  describe('weights', () => {
    it('takes tonnes (klbs), a full weight from 10 000 on, and * for the maximum weight', () => {
      expect(parseWeightEntry('569.0', true, 510_000)).toBe(569_000);
      expect(parseWeightEntry('512345', true, 510_000)).toBe(512_345);
      expect(parseWeightEntry('*', true, 510_000)).toBe(510_000);
      expect(parseWeightEntry('1234.6', false, 510_000)).toBeCloseTo(1_234_600 * KG_PER_LB, 3);
      expect(parseWeightEntry('ABC', true, 510_000)).toBeNull();
      expect(parseWeightEntry('0', true, 510_000)).toBeNull();
    });

    it('shows one decimal in tonnes or klbs', () => {
      expect(formatWeight(569_000, true)).toBe('569.0');
      expect(formatWeight(1_234_600 * KG_PER_LB, false)).toBe('1234.6');
      expect(formatWeight(null, true)).toBe('');
    });

    it('rounds a LOADSHEET weight up to the next 100 kg (100 lb)', () => {
      expect(roundWeightUpForPerformance(450_201, true)).toBe(450_300);
      expect(roundWeightUpForPerformance(450_300, true)).toBe(450_300);
      const kg = 1_000_001 * KG_PER_LB;
      expect(roundWeightUpForPerformance(kg, false) / KG_PER_LB).toBeCloseTo(1_000_100, 6);
    });
  });

  it('detects a QNH in inHg', () => {
    expect(parseQnhEntry('1013')).toBe(1013);
    expect(parseQnhEntry('29.92')).toBeCloseTo(1013.2, 1);
    expect(parseQnhEntry('29')).toBeCloseTo(982.1, 1);
    expect(parseQnhEntry('500')).toBeNull();
    expect(parseQnhEntry('Q1013')).toBeNull();
  });

  it('takes negative temperatures with - or M', () => {
    expect(parseTemperatureEntry('15')).toBe(15);
    expect(parseTemperatureEntry('-5')).toBe(-5);
    expect(parseTemperatureEntry('M12')).toBe(-12);
    expect(parseTemperatureEntry('150')).toBeNull();
  });

  describe('wind', () => {
    it('takes a longitudinal component', () => {
      expect(parseWindEntry('H10')).toEqual({ kind: 'longitudinal', headwind: 10 });
      expect(parseWindEntry('HD5')).toEqual({ kind: 'longitudinal', headwind: 5 });
      expect(parseWindEntry('T6')).toEqual({ kind: 'longitudinal', headwind: -6 });
      expect(parseWindEntry('TL8')).toEqual({ kind: 'longitudinal', headwind: -8 });
    });

    it('takes a direction and a speed, with a gust', () => {
      expect(parseWindEntry('080/15')).toEqual({ kind: 'direction', direction: 80, speed: 15, gust: null });
      expect(parseWindEntry('080/15G25')).toEqual({ kind: 'direction', direction: 80, speed: 15, gust: 25 });
      expect(parseWindEntry('080/15/G25')).toEqual({ kind: 'direction', direction: 80, speed: 15, gust: 25 });
      expect(parseWindEntry('080/15G10')).toBeNull();
      expect(parseWindEntry('400/15')).toBeNull();
    });

    it('projects a direction on the runway and shows it as on the CONDITIONS panel', () => {
      // 080/15 on runway 06 (bearing 060): 14 kt of headwind, 5 kt from the right
      const wind = parseWindEntry('080/15')!;
      const components = runwayWind(wind, 60)!;
      expect(components.headwind).toBeCloseTo(14.1, 1);
      expect(components.crosswind).toBeCloseTo(5.1, 1);
      expect(formatWindEntry(wind, components)).toBe('(080/15)HD14');
      expect(formatCrosswind(components)).toBe('R 5');
      expect(formatCrosswind(runwayWind(parseWindEntry('040/15')!, 60))).toBe('L 5');
      expect(formatWindEntry(parseWindEntry('TL5')!, runwayWind(parseWindEntry('TL5')!, null))).toBe('TL5');
    });

    it('needs a runway to project a direction', () => {
      expect(runwayWind(parseWindEntry('080/15')!, null)).toBeNull();
    });

    it('takes the gust for the crosswind', () => {
      expect(formatCrosswind(runwayWind(parseWindEntry('150/10G30')!, 60))).toBe('R 30');
    });
  });

  it('computes the ISA deviation with the airport elevation and the QNH', () => {
    expect(isaDeviation(15, 0, 1013.25)).toBeCloseTo(0, 5);
    // 820 ft at QNH 1013: ISA 13.4 °C, so 15 °C is ISA +2 (the T.O PERF interface example)
    expect(formatIsaDeviation(isaDeviation(15, 820, 1013))).toBe('+2');
    expect(formatIsaDeviation(null)).toBe('---');
  });
});
