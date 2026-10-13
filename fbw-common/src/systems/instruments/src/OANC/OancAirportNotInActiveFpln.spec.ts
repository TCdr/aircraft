// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EfisNdMode } from '@flybywiresim/fbw-sdk';
import { describe, expect, it } from 'vitest';
import { isAirportNotInActiveFpln } from './OancMapUtils';

/*
 * A380 FCOM DSC-34-10-70-20 OANS MESSAGES (a380_fcom.txt l.87262-87264): "ARPT NOT IN ACTIVE F-PLN: In PLAN mode, the
 * flight crew has displayed an airport that is not the origin, destination, or alternate airport."
 */
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

  it('is the condition of the message on the OANS', () => {
    const oanc = readFileSync(resolve(__dirname, 'Oanc.tsx'), 'utf-8');
    expect(oanc).toMatch(
      /airportNotInActiveFpln = MappedSubject\.create\(\s*\(\[[^\]]*\]\) => isAirportNotInActiveFpln\(/,
    );
  });
});
