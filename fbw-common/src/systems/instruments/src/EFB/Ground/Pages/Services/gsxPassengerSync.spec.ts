// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaxStationInfo } from '@flybywiresim/fbw-sdk-react';
import { announceGsxPassengers, GSX_NUM_PASSENGERS_VAR } from './gsxPassengerSync';

// the real seat flags, without the whole flyPad SDK
vi.mock('@flybywiresim/fbw-sdk-react', async () => {
  const bitFlags = await import('../../../../../../shared/src/bitFlags');
  return { SeatFlags: bitFlags.SeatFlags };
});

/** Two seat stations of 20 seats, as in a cabin config */
const SEAT_MAP = [
  { simVar: 'A32NX_PAX_A', capacity: 20 },
  { simVar: 'A32NX_PAX_B', capacity: 20 },
] as PaxStationInfo[];

/** The seat flags of n filled seats */
const seats = (n: number) => 2 ** n - 1;

const set = (name: string, value: number) => SimVar.SetSimVarValue(name, 'number', value);

describe('GSX passenger number written by the Services and Payload pages', () => {
  beforeEach(() => {
    set('L:A32NX_PAX_A', seats(20));
    set('L:A32NX_PAX_B', seats(18));
    set('L:A32NX_PAX_A_DESIRED', 0);
    set('L:A32NX_PAX_B_DESIRED', 0);
    set('L:FSDT_GSX_BOARDING_STATE', 6);
    set('L:FSDT_GSX_DEBOARDING_STATE', 1);
    set('L:A32NX_FMGC_FLIGHT_PHASE', 1);
    set(GSX_NUM_PASSENGERS_VAR, 0);
  });

  it('gives GSX the 38 passengers on board, not the 0 of the Payload target, when GSX deboarding is requested', () => {
    set('L:FSDT_GSX_DEBOARDING_STATE', 4);

    announceGsxPassengers(SEAT_MAP, true);

    expect(SimVar.GetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number')).toBe(38);
  });

  it('gives GSX the planned passengers for a boarding', () => {
    set('L:A32NX_PAX_A', 0);
    set('L:A32NX_PAX_B', 0);
    set('L:A32NX_PAX_A_DESIRED', seats(20));
    set('L:A32NX_PAX_B_DESIRED', seats(10));
    set('L:FSDT_GSX_BOARDING_STATE', 1);

    announceGsxPassengers(SEAT_MAP, true);

    expect(SimVar.GetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number')).toBe(30);
  });

  it('leaves the number while GSX deboards, and when the page may not write it', () => {
    set(GSX_NUM_PASSENGERS_VAR, 38);
    set('L:A32NX_PAX_A', seats(5));
    set('L:FSDT_GSX_DEBOARDING_STATE', 5);
    announceGsxPassengers(SEAT_MAP, true);
    expect(SimVar.GetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number')).toBe(38);

    set('L:FSDT_GSX_DEBOARDING_STATE', 4);
    announceGsxPassengers(SEAT_MAP, false);
    expect(SimVar.GetSimVarValue(GSX_NUM_PASSENGERS_VAR, 'number')).toBe(38);
  });
});
