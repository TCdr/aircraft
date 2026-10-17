// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  deselectedSatellitesCell,
  deselectSatellite,
  formatTimeOfDay,
  parsePredictiveEta,
  parseSatelliteNumber,
  predictiveDestinationEtaCell,
  predictivePrimaryLine,
} from './PredictiveGpsFields';

describe('PREDICTIVE GPS page entries', () => {
  it('ETA HHMM, leading zeros omitted, 1 or 2 digits as minutes', () => {
    expect(parsePredictiveEta('1435')).toBe(14 * 3600 + 35 * 60);
    expect(parsePredictiveEta('935')).toBe(9 * 3600 + 35 * 60);
    expect(parsePredictiveEta('45')).toBe(45 * 60);
    expect(parsePredictiveEta('2460')).toBe('range');
    expect(parsePredictiveEta('2400')).toBe('range');
    expect(parsePredictiveEta('14:35')).toBe('format');
    expect(parsePredictiveEta('')).toBe('format');
  });

  it('satellite numbers 1 to 32', () => {
    expect(parseSatelliteNumber('7')).toBe(7);
    expect(parseSatelliteNumber('32')).toBe(32);
    expect(parseSatelliteNumber('0')).toBe('range');
    expect(parseSatelliteNumber('33')).toBe('range');
    expect(parseSatelliteNumber('A1')).toBe('format');
  });

  it('up to four deselected satellites, a fifth one overwrites the oldest', () => {
    let deselected: number[] = [];
    for (const satellite of [3, 12, 12, 17, 25]) {
      deselected = deselectSatellite(deselected, satellite);
    }
    expect(deselected).toEqual([3, 12, 17, 25]);
    expect(deselectSatellite(deselected, 30)).toEqual([12, 17, 25, 30]);
  });
});

describe('PREDICTIVE GPS page cells', () => {
  it('DEST ETA: crew entry large, FMS prediction small, amber boxes without prediction or after a CLR', () => {
    expect(predictiveDestinationEtaCell(14 * 3600, false, 15 * 3600)).toEqual({
      text: '{cyan}1400{end}',
      etaSeconds: 14 * 3600,
    });
    expect(predictiveDestinationEtaCell(null, false, 15 * 3600 + 60)).toEqual({
      text: '{cyan}{small}1501{end}{end}',
      etaSeconds: 15 * 3600 + 60,
    });
    expect(predictiveDestinationEtaCell(null, false, null)).toEqual({ text: '{amber}____{end}', etaSeconds: null });
    expect(predictiveDestinationEtaCell(null, true, 15 * 3600)).toEqual({ text: '{amber}____{end}', etaSeconds: null });
  });

  it('times past midnight wrap', () => {
    expect(formatTimeOfDay(86400 + 125 * 60)).toBe('0205');
  });

  it('PRIMARY Y/N line: blank when the place or time is not defined, Y/N from the GPS receivers', () => {
    expect(predictivePrimaryLine(false, true)).toBe('');
    const available = predictivePrimaryLine(true, true);
    expect(available.match(/Y/g)?.length).toBe(7);
    expect(available).not.toContain('N');
    expect(predictivePrimaryLine(true, false).match(/N/g)?.length).toBe(7);
  });

  it('DESELECTED SATELLITES: blue brackets while fewer than four', () => {
    expect(deselectedSatellitesCell([])).toBe('{cyan}[\xa0]{end}');
    expect(deselectedSatellitesCell([3, 12])).toBe('{cyan}03\xa012\xa0[\xa0]{end}');
    expect(deselectedSatellitesCell([3, 12, 17, 25])).toBe('{cyan}03\xa012\xa017\xa025{end}');
  });
});
