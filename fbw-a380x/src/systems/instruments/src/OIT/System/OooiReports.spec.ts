// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { FreetextMessage } from '@datalink/common';
import { OooiReports, oooiMessage } from './OooiReports';

const FLIGHT = { flightNumber: 'AFR006', origin: 'LFPG', destination: 'KJFK' };
const NINE_O_FIVE = Date.UTC(2026, 9, 17, 9, 5);

/**
 * @param station the OOOI station at the start, null for none
 * @returns the reports with the station and what was sent through the AOC
 */
function setup(station: string | null = 'AFROPS') {
  const stationSubject = Subject.create<string | null>(station);
  const sent: { key: string; subject: string; message: FreetextMessage | null }[] = [];
  const reports = new OooiReports(
    stationSubject,
    (key, subject, message) => {
      sent.push({ key, subject, message });
      return message !== null;
    },
    () => 'KG',
  );
  return { stationSubject, sent, reports };
}

describe('OOOI reports', () => {
  it('writes the flight, the event time UTC and the fuel on board', () => {
    expect(oooiMessage('OUT', NINE_O_FIVE, 150_000, FLIGHT, 'AFROPS', 'KG')?.Message).toBe(
      'OOOI OUT\nFLT NBR AFR006\nFROM LFPG\nDEST KJFK\nOUT 0905\nFOB 150000 KG',
    );
  });

  it('leaves out what is not known', () => {
    const none = { flightNumber: null, origin: null, destination: null };
    expect(oooiMessage('IN', NINE_O_FIVE, null, none, 'AFROPS', 'KG')?.Message).toBe('OOOI IN\nIN 0905');
  });

  it('sends the report at once to the station, under one key per event', () => {
    const { sent, reports } = setup();
    reports.report('OFF', NINE_O_FIVE, 140_000, FLIGHT);
    expect(sent).toHaveLength(1);
    expect(sent[0].key).toBe('oooi/off');
    expect(sent[0].subject).toBe('OOOI OFF');
    expect(sent[0].message?.Station).toBe('AFROPS');
  });

  it('keeps the reports until a station is entered, then sends them in order', () => {
    const { stationSubject, sent, reports } = setup(null);
    reports.report('OUT', NINE_O_FIVE, 150_000, FLIGHT);
    reports.report('OFF', NINE_O_FIVE + 600_000, 148_000, FLIGHT);
    expect(sent).toHaveLength(0);
    stationSubject.set('AFROPS');
    expect(sent.map((s) => s.key)).toEqual(['oooi/out', 'oooi/off']);
    stationSubject.set('OTHER');
    expect(sent).toHaveLength(2);
  });

  it('forgets the waiting reports on clear', () => {
    const { stationSubject, sent, reports } = setup(null);
    reports.report('OUT', NINE_O_FIVE, 150_000, FLIGHT);
    reports.clear();
    stationSubject.set('AFROPS');
    expect(sent).toHaveLength(0);
  });
});
