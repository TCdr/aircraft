// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ManualGlsEntryContext, resolveManualGlsEntry } from './ManualGlsEntry';

const TABLE_AIRPORTS = [
  { ident: 'EDDF', location: { lat: 50.033, long: 8.57 } },
  { ident: 'KEWR', location: { lat: 40.69, long: -74.17 } },
  { ident: 'KSFO', location: { lat: 37.62, long: -122.38 } },
  { ident: 'KIAH', location: { lat: 29.98, long: -95.34 } },
  { ident: 'YMML', location: { lat: -37.67, long: 144.84 } },
];

const NEAR_FRANKFURT = { lat: 49.5, long: 8 };
const LONDON = { lat: 51.47, long: -0.45 };

function context(overrides: Partial<ManualGlsEntryContext> = {}): ManualGlsEntryContext {
  return {
    destinationIdent: null,
    originIdent: null,
    presentPosition: NEAR_FRANKFURT,
    tableAirports: TABLE_AIRPORTS,
    ...overrides,
  };
}

describe('manual GLS entry', () => {
  describe('channel', () => {
    it('resolves at the destination', () => {
      // 31434 is EDDF 25C Z; the aircraft is far away, so only the destination can resolve it
      const resolution = resolveManualGlsEntry(31434, context({ destinationIdent: 'EDDF', presentPosition: LONDON }));

      expect(resolution).toMatchObject({ kind: 'resolved', airportIdent: 'EDDF', approach: { rpi: 'G25P' } });
    });

    it('takes a channel typed as text', () => {
      expect(resolveManualGlsEntry('31434', context({ destinationIdent: 'EDDF' })).kind).toBe('resolved');
    });

    it('resolves at the nearest airport of the table within 300 NM when it is not at the destination', () => {
      const resolution = resolveManualGlsEntry(31434, context({ destinationIdent: 'KEWR' }));

      expect(resolution).toMatchObject({ kind: 'resolved', airportIdent: 'EDDF' });
    });

    it('is unknown outside 300 NM of any airport that has it, and without a position', () => {
      expect(resolveManualGlsEntry(31434, context({ destinationIdent: 'KEWR', presentPosition: LONDON }))).toEqual({
        kind: 'unknown-channel',
        channel: 31434,
      });
      expect(resolveManualGlsEntry(31434, context({ destinationIdent: 'KEWR', presentPosition: null })).kind).toBe(
        'unknown-channel',
      );
    });

    it('is unknown when no airport of the table has the channel', () => {
      expect(resolveManualGlsEntry(20002, context({ destinationIdent: 'EDDF' }))).toEqual({
        kind: 'unknown-channel',
        channel: 20002,
      });
    });

    it('accepts 20001 and 39999 and refuses 20000 and 40000', () => {
      expect(resolveManualGlsEntry(20001, context()).kind).toBe('unknown-channel');
      expect(resolveManualGlsEntry(39999, context()).kind).toBe('unknown-channel');
      expect(resolveManualGlsEntry(20000, context()).kind).toBe('invalid');
      expect(resolveManualGlsEntry(40000, context()).kind).toBe('invalid');
    });
  });

  describe('reference path identifier', () => {
    it('resolves at the destination', () => {
      expect(resolveManualGlsEntry('G25P', context({ destinationIdent: 'EDDF' }))).toMatchObject({
        kind: 'resolved',
        airportIdent: 'EDDF',
        approach: { channel: 31434 },
      });
    });

    it('takes the destination for an identifier that two airports share', () => {
      // G09A exists at KIAH and at YMML
      expect(resolveManualGlsEntry('G09A', context({ destinationIdent: 'YMML' }))).toMatchObject({
        airportIdent: 'YMML',
      });
      expect(resolveManualGlsEntry('G09A', context({ destinationIdent: 'KIAH' }))).toMatchObject({
        airportIdent: 'KIAH',
      });
    });

    it('falls back to the origin', () => {
      expect(resolveManualGlsEntry('g25p', context({ destinationIdent: 'KEWR', originIdent: 'EDDF' }))).toMatchObject({
        kind: 'resolved',
        airportIdent: 'EDDF',
      });
    });

    it('is not looked up at any other airport, however near', () => {
      expect(resolveManualGlsEntry('G25P', context({ destinationIdent: 'KEWR', originIdent: 'KSFO' }))).toEqual({
        kind: 'unknown-rpi',
        rpi: 'G25P',
      });
    });
  });

  it('refuses entries that are neither a channel nor an identifier', () => {
    for (const entry of ['', '123', '1234567', 'G25', 'G25PP', '25P5']) {
      expect(resolveManualGlsEntry(entry, context({ destinationIdent: 'EDDF' })).kind).toBe('invalid');
    }
  });
});
