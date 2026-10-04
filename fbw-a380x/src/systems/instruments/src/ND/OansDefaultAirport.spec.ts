// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OansAirport, OansDefaultAirportInputs, oansDefaultAirport } from './OansDefaultAirport';

const LFPG: OansAirport = { idarpt: 'LFPG', coordinates: { lat: 49.0097, lon: 2.5479 }, elev: 119 };
const LFPO: OansAirport = { idarpt: 'LFPO', coordinates: { lat: 48.7233, lon: 2.3794 }, elev: 89 };
const EGLL: OansAirport = { idarpt: 'EGLL', coordinates: { lat: 51.47, lon: -0.4543 }, elev: 25 };
const KJFK: OansAirport = { idarpt: 'KJFK', coordinates: { lat: 40.6398, lon: -73.7789 }, elev: 4 };
const airports = [LFPG, LFPO, EGLL, KJFK];

/** A position the given distance (NM) north of an airport */
const northOf = (airport: OansAirport, nm: number) => ({
  lat: airport.coordinates.lat + nm / 60,
  long: airport.coordinates.lon,
});

const inputs = (i: Partial<OansDefaultAirportInputs>): OansDefaultAirportInputs => ({
  airports,
  position: northOf(LFPG, 0),
  altitude: null,
  onGround: false,
  planMode: false,
  origin: 'LFPG',
  destination: 'KJFK',
  alternate: 'KBOS',
  displayed: null,
  ...i,
});

describe('OANS default airport (A380 FCOM DSC-34-10-70-20)', () => {
  it('is the current airport on ground', () => {
    expect(oansDefaultAirport(inputs({ onGround: true, position: northOf(LFPG, 0.5) }))).toBe('LFPG');
    expect(oansDefaultAirport(inputs({ onGround: true, position: northOf(LFPO, 1) }))).toBe('LFPO');
    expect(oansDefaultAirport(inputs({ onGround: true, position: northOf(EGLL, 30) }))).toBe(null);
  });

  it('is an FMS airport in flight within its 20 NM, 5000 ft cylinder (ARC, ROSE-NAV)', () => {
    const toLondon = { origin: 'LFPG', destination: 'EGLL', alternate: 'LFPO' };
    expect(oansDefaultAirport(inputs({ ...toLondon, position: northOf(EGLL, 10), altitude: 3000 }))).toBe('EGLL');
    expect(oansDefaultAirport(inputs({ ...toLondon, position: northOf(EGLL, 10), altitude: 8000 }))).toBe(null);
    expect(oansDefaultAirport(inputs({ ...toLondon, position: northOf(EGLL, 25), altitude: 3000 }))).toBe(null);
    // Diversion to the alternate
    expect(oansDefaultAirport(inputs({ ...toLondon, position: northOf(LFPO, -5), altitude: 2000 }))).toBe('LFPO');
    // No valid altitude: the radius only
    expect(oansDefaultAirport(inputs({ ...toLondon, position: northOf(EGLL, 10), altitude: null }))).toBe('EGLL');
    // Not an FMS airport
    expect(oansDefaultAirport(inputs({ position: northOf(EGLL, 5), altitude: 1000 }))).toBe(null);
  });

  it('keeps the displayed airport while in its cylinder', () => {
    const paris = { origin: 'LFPG', destination: 'EGLL', alternate: 'LFPO', altitude: 2000 };
    // Between LFPG and LFPO, closer to LFPG
    const between = { lat: 48.9, long: 2.48 };
    expect(oansDefaultAirport(inputs({ ...paris, position: between, displayed: null }))).toBe('LFPG');
    expect(oansDefaultAirport(inputs({ ...paris, position: between, displayed: 'LFPO' }))).toBe('LFPO');
  });

  it('is the origin within 50 NM, else the destination in PLAN mode', () => {
    expect(oansDefaultAirport(inputs({ planMode: true, position: northOf(LFPG, 30) }))).toBe('LFPG');
    expect(oansDefaultAirport(inputs({ planMode: true, position: northOf(LFPG, 100) }))).toBe('KJFK');
    // Origin to destination shorter than 300 NM: the destination
    expect(oansDefaultAirport(inputs({ planMode: true, destination: 'EGLL', position: northOf(LFPG, 10) }))).toBe(
      'EGLL',
    );
  });
});
