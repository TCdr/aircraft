// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  formatReportAltitude,
  formatReportTemperature,
  formatReportWind,
  isOverheadReportable,
  nextCruiseProfileChange,
  OverheadRecord,
  OverheadWaypointRecorder,
} from './ProgressReportFields';

const data = (utcMs: number): Omit<OverheadRecord, 'ident'> => ({
  utcMs,
  altitude: 35_000,
  descending: false,
  staticAirTemperature: -54,
  windDirection: 270,
  windSpeed: 45,
  fob: 8.4,
});

describe('PROG REPORT page OVHD', () => {
  it('never shows the pseudo waypoints and the F-PLN markers', () => {
    for (const ident of ['T-P', 'PPOS', 'IN-BND', 'OUT-BND', '(T/D)', '(DECEL)', '(1500)', '(INTCPT)', '']) {
      expect(isOverheadReportable(ident)).toBe(false);
    }
    expect(isOverheadReportable('SIRIC')).toBe(true);
    expect(isOverheadReportable('LFPG')).toBe(true);
  });

  it('records the waypoint, time, altitude, SAT, wind and FOB at the sequencing in flight', () => {
    const recorder = new OverheadWaypointRecorder();
    recorder.update({ uuid: 'a', ident: 'RW27' }, true, () => data(1));
    expect(recorder.record).toEqual({ ident: 'RW27', ...data(1) });
    recorder.update({ uuid: 'b', ident: 'SIRIC' }, true, () => data(2));
    expect(recorder.record).toEqual({ ident: 'SIRIC', ...data(2) });
  });

  it('records nothing while the FROM leg stays the same', () => {
    const recorder = new OverheadWaypointRecorder();
    recorder.update({ uuid: 'b', ident: 'SIRIC' }, true, () => data(2));
    recorder.update({ uuid: 'b', ident: 'SIRIC' }, true, () => data(3));
    expect(recorder.record?.utcMs).toBe(2);
  });

  it('records nothing on the ground (flight plan entry), and keeps the last record over a T-P', () => {
    const recorder = new OverheadWaypointRecorder();
    recorder.update({ uuid: 'a', ident: 'LFPG' }, false, () => data(1));
    expect(recorder.record).toBeNull();
    recorder.update({ uuid: 'b', ident: 'SIRIC' }, true, () => data(2));
    recorder.update({ uuid: 'c', ident: 'T-P' }, true, () => data(3));
    expect(recorder.record?.ident).toBe('SIRIC');
    expect(recorder.record?.utcMs).toBe(2);
  });

  it('reset forgets the record', () => {
    const recorder = new OverheadWaypointRecorder();
    recorder.update({ uuid: 'b', ident: 'SIRIC' }, true, () => data(2));
    recorder.reset();
    expect(recorder.record).toBeNull();
  });
});

describe('PROG REPORT page cell formats', () => {
  it('altitudes as on the F-PLN pages: FL above the transition altitude in climb/cruise, at or above the level in descent', () => {
    expect(formatReportAltitude(35_000, false, 5000, 50)).toBe('FL350');
    expect(formatReportAltitude(4_996, false, 5000, 50)).toBe('5000');
    expect(formatReportAltitude(5_000, true, 5000, 50)).toBe('FL050');
    expect(formatReportAltitude(4_990, true, 5000, 50)).toBe('4990');
    expect(formatReportAltitude(9_000, false, null, null)).toBe('9000');
  });

  it('SAT signed whole degrees, wind DDD°/SSS, dashes without data', () => {
    expect(formatReportTemperature(-54.4)).toBe('-54°');
    expect(formatReportTemperature(3)).toBe('+3°');
    expect(formatReportTemperature(null)).toBe('---°');
    expect(formatReportWind(5, 8)).toBe('005°/008');
    expect(formatReportWind(359.7, 120)).toBe('360°/120');
    expect(formatReportWind(null, 10)).toBe('---°/---');
  });
});

describe('PROG REPORT page T/D/UTC/DIST', () => {
  const pwps = [
    { ident: '(DECEL)', flightPlanInfo: { secondsFromPresent: 3000, distanceFromAircraft: 300 } },
    { ident: '(T/D)', flightPlanInfo: { secondsFromPresent: 1800, distanceFromAircraft: 220 } },
    { ident: '(S/C)', flightPlanInfo: { secondsFromPresent: 600, distanceFromAircraft: 80 } },
    { ident: '(S/D)', flightPlanInfo: null },
  ];

  it('the nearest cruise profile change ahead, in the cruise phase only', () => {
    expect(nextCruiseProfileChange(pwps, true)).toEqual({ name: 'S/C', secondsFromPresent: 600, distance: 80 });
    expect(nextCruiseProfileChange(pwps, false)).toBeNull();
  });

  it('none ahead: no data', () => {
    expect(nextCruiseProfileChange([pwps[0], pwps[3]], true)).toBeNull();
    expect(
      nextCruiseProfileChange(
        [{ ident: '(T/D)', flightPlanInfo: { secondsFromPresent: -5, distanceFromAircraft: -1 } }],
        true,
      ),
    ).toBeNull();
  });
});
