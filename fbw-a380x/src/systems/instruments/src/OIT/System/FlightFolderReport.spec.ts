// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { elapsedSeconds, FlightReportTimes, NO_FLIGHT_REPORT_TIMES, takeoffToRecord } from './FlightFolderReport';

describe('flight report', () => {
  it('gives the block and flight times in seconds, nothing for none', () => {
    expect(elapsedSeconds(null)).toBeNull();
    expect(elapsedSeconds(0)).toBe(0);
    expect(elapsedSeconds((11 * 60 + 5) * 60 * 1000)).toBe(11 * 3600 + 5 * 60);
  });

  it('gives nothing for a time that runs backwards: the sim clock was set back', () => {
    expect(elapsedSeconds(-1000)).toBeNull();
  });

  describe('take-off to record', () => {
    const flown: FlightReportTimes = { ...NO_FLIGHT_REPORT_TIMES, offMs: 1000, offFobKg: 150_000 };

    it('is the OFF time and fuel once the aircraft is off the ground', () => {
      expect(takeoffToRecord(flown)).toEqual({ timeMs: 1000, fobKg: 150_000 });
    });

    it('is nothing before the take-off', () => {
      expect(takeoffToRecord(NO_FLIGHT_REPORT_TIMES)).toBeNull();
    });

    it('is nothing after the landing: the avionics keep the OFF time of the last flight until the next turnaround', () => {
      expect(takeoffToRecord({ ...flown, onMs: 5000 })).toBeNull();
    });
  });
});
