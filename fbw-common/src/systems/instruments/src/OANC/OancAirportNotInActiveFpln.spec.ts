// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EfisNdMode, OansFmsDataStore } from '@flybywiresim/fbw-sdk';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { createAirportNotInActiveFpln, isAirportNotInActiveFpln } from './OancMapUtils';

// ARPT NOT IN ACTIVE F-PLN: in PLAN mode, the crew displays an airport that is not the origin, destination or alternate
describe('OANS ARPT NOT IN ACTIVE F-PLN', () => {
  const fpln = ['LFBO', 'EGLL', 'EGKK'] as const;

  it('shows in PLAN mode for an airport that is not the origin, destination or alternate', () => {
    expect(isAirportNotInActiveFpln(EfisNdMode.PLAN, 'LFPG', ...fpln)).toBe(true);
  });

  it.each(fpln)('does not show in PLAN mode for the flight plan airport %s', (icao) => {
    expect(isAirportNotInActiveFpln(EfisNdMode.PLAN, icao, ...fpln)).toBe(false);
  });

  it.each([EfisNdMode.ROSE_NAV, EfisNdMode.ARC])('does not show outside PLAN mode (mode %s)', (mode) => {
    expect(isAirportNotInActiveFpln(mode, 'LFPG', ...fpln)).toBe(false);
  });

  it('does not show without a displayed airport', () => {
    expect(isAirportNotInActiveFpln(EfisNdMode.PLAN, null, ...fpln)).toBe(false);
  });

  it('follows the ND mode, the displayed airport and the airports the FMS publishes (the OANS message)', () => {
    const bus = new EventBus();
    const publisher = bus.getPublisher<{ fmsOrigin: string; fmsDestination: string; fmsAlternate: string }>();
    const fmsData = new OansFmsDataStore(bus);
    const ndMode = Subject.create(EfisNdMode.PLAN);
    const airport = Subject.create<string | null>('LFPG');
    const shown = createAirportNotInActiveFpln(ndMode, airport, fmsData);

    publisher.pub('fmsOrigin', 'LFBO', true);
    publisher.pub('fmsDestination', 'EGLL', true);
    publisher.pub('fmsAlternate', 'EGKK', true);
    expect(shown.get()).toBe(true);

    // each of the three flight plan airports counts as in the flight plan
    for (const icao of fpln) {
      airport.set(icao);
      expect(shown.get()).toBe(false);
    }

    airport.set('LFPG');
    ndMode.set(EfisNdMode.ARC);
    expect(shown.get()).toBe(false);
  });
});
