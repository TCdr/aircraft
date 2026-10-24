// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FuelServiceInput,
  PayloadServiceInput,
  fuelServiceStatus,
  fuelToleranceKg,
  markServiceRan,
  payloadServiceStatus,
  serviceRan,
} from './serviceStatus';

const idleFuel: FuelServiceInput = {
  gsxSync: false,
  gsxRefuelState: 1,
  startedByUser: false,
  currentKg: 10000,
  targetKg: 10000,
  startKg: 10000,
  minutesLeft: null,
};
const fuel = (changes: Partial<FuelServiceInput>) => fuelServiceStatus({ ...idleFuel, ...changes });

describe('fuelServiceStatus', () => {
  it('is onTheWay when GSX has the refuel requested and sync is on', () => {
    expect(fuel({ gsxSync: true, gsxRefuelState: 4, targetKg: 20000, minutesLeft: 12 }).kind).toBe('onTheWay');
  });

  it('ignores the GSX state when sync is off', () => {
    expect(fuel({ gsxSync: false, gsxRefuelState: 4, targetKg: 20000 }).kind).toBe('notStarted');
  });

  it('refuels with progress from the start fuel to the target', () => {
    const status = fuel({ startedByUser: true, startKg: 10000, currentKg: 12500, targetKg: 20000, minutesLeft: 8 });
    expect(status.kind).toBe('refueling');
    expect(status.progress).toBeCloseTo(0.25);
    expect(status.minutesLeft).toBe(8);
  });

  it('defuels when the target is below the fuel on board', () => {
    const status = fuel({ startedByUser: true, startKg: 20000, currentKg: 15000, targetKg: 10000 });
    expect(status.kind).toBe('defueling');
    expect(status.progress).toBeCloseTo(0.5);
  });

  it('refuels under an active GSX service', () => {
    expect(fuel({ gsxSync: true, gsxRefuelState: 5, currentKg: 11000, targetKg: 20000 }).kind).toBe('refueling');
    expect(fuel({ gsxSync: true, gsxRefuelState: 5, currentKg: 20000, targetKg: 11000 }).kind).toBe('defueling');
  });

  it('is complete when GSX reports completed', () => {
    expect(fuel({ gsxSync: true, gsxRefuelState: 6, currentKg: 19000, targetKg: 20000 }).kind).toBe('complete');
  });

  it('is complete within a kilogram of the target when not started', () => {
    const status = fuel({ currentKg: 20000.5, targetKg: 20000 });
    expect(status.kind).toBe('complete');
    expect(status.progress).toBe(1);
  });

  it('is notStarted with no fuel ordered', () => {
    expect(fuel({ currentKg: 0, targetKg: 0 }).kind).toBe('notStarted');
  });

  it('is complete at a target of 0 once the refuel ran or the OFP fuel was imported', () => {
    expect(fuel({ currentKg: 0, targetKg: 0, ordered: true }).kind).toBe('complete');
  });

  it('uses the tolerance the caller gives', () => {
    expect(fuel({ currentKg: 19995, targetKg: 20000, toleranceKg: 10 }).kind).toBe('complete');
    expect(fuel({ currentKg: 19995, targetKg: 20000 }).kind).toBe('notStarted');
  });

  it('is notStarted when nothing runs and the target differs', () => {
    const status = fuel({ currentKg: 10000, targetKg: 20000 });
    expect(status).toEqual({ kind: 'notStarted', progress: null, minutesLeft: null, done: null, total: null });
  });

  it('has no progress when start and target are the same', () => {
    expect(fuel({ startedByUser: true, startKg: 10000, currentKg: 10000, targetKg: 10000 }).progress).toBeNull();
  });

  it('keeps a user refuel running after a stale GSX completed state', () => {
    expect(
      fuel({ gsxSync: true, gsxRefuelState: 6, startedByUser: true, currentKg: 11000, targetKg: 20000 }).kind,
    ).toBe('refueling');
  });
});

const idlePayload: PayloadServiceInput = {
  gsxSync: false,
  gsxBoardingState: 1,
  gsxDeboardingState: 1,
  startedByUser: false,
  paxOnBoard: 0,
  paxTarget: 0,
  paxStart: 0,
};
const payload = (changes: Partial<PayloadServiceInput>) => payloadServiceStatus({ ...idlePayload, ...changes });

describe('payloadServiceStatus', () => {
  it('is onTheWay when GSX has boarding or deboarding requested and sync is on', () => {
    expect(payload({ gsxSync: true, gsxBoardingState: 4, paxTarget: 100 }).kind).toBe('onTheWay');
    expect(payload({ gsxSync: true, gsxDeboardingState: 4, paxOnBoard: 100 }).kind).toBe('onTheWay');
    expect(payload({ gsxSync: false, gsxBoardingState: 4, paxTarget: 100 }).kind).toBe('notStarted');
  });

  it('boards with boarded and target counts', () => {
    const status = payload({ startedByUser: true, paxStart: 0, paxOnBoard: 40, paxTarget: 160 });
    expect(status.kind).toBe('boarding');
    expect(status.done).toBe(40);
    expect(status.total).toBe(160);
    expect(status.progress).toBeCloseTo(0.25);
  });

  it('deboards when the target is below the passengers on board', () => {
    const status = payload({ startedByUser: true, paxStart: 150, paxOnBoard: 100, paxTarget: 0 });
    expect(status.kind).toBe('deboarding');
    expect(status.done).toBe(50);
    expect(status.total).toBe(150);
    expect(status.progress).toBeCloseTo(50 / 150);
  });

  it('boards under an active GSX boarding and deboards under an active GSX deboarding', () => {
    expect(payload({ gsxSync: true, gsxBoardingState: 5, paxOnBoard: 10, paxTarget: 100 }).kind).toBe('boarding');
    expect(payload({ gsxSync: true, gsxDeboardingState: 5, paxStart: 100, paxOnBoard: 90, paxTarget: 0 }).kind).toBe(
      'deboarding',
    );
  });

  it('is complete when GSX reports completed or the counts match', () => {
    expect(payload({ gsxSync: true, gsxBoardingState: 6, paxOnBoard: 150, paxTarget: 150 }).kind).toBe('complete');
    expect(payload({ paxOnBoard: 150, paxTarget: 150 }).kind).toBe('complete');
  });

  it('is notStarted for a cold aircraft without an OFP, 0 of 0 passengers', () => {
    expect(payload({ paxOnBoard: 0, paxTarget: 0 }).kind).toBe('notStarted');
  });

  it('is complete after a deboarding to 0 and for an imported 0-passenger OFP', () => {
    expect(payload({ paxOnBoard: 0, paxTarget: 0, paxStart: 170, ordered: true }).kind).toBe('complete');
    expect(payload({ paxOnBoard: 0, paxTarget: 0, ordered: true }).kind).toBe('complete');
  });

  it('is notStarted when the target differs and nothing runs', () => {
    expect(payload({ paxOnBoard: 0, paxTarget: 150 }).kind).toBe('notStarted');
  });
});

describe('fuelServiceStatus direction at the target', () => {
  it('reads a started service with the target equal to the fuel on board as defueling, as the Fuel page does', () => {
    expect(fuel({ startedByUser: true, currentKg: 20000, targetKg: 20000, startKg: 20000 }).kind).toBe('defueling');
  });
});

describe('services seen running per OFP', () => {
  it('remembers each service once for the OFP', () => {
    let stored = markServiceRan('', 'A', 'payload');
    stored = markServiceRan(stored, 'A', 'fuel');
    stored = markServiceRan(stored, 'A', 'fuel');
    expect(stored).toBe('A#payload,fuel');
    expect(serviceRan(stored, 'A', 'fuel')).toBe(true);
  });

  it('forgets the services of another OFP', () => {
    expect(serviceRan('A#payload', 'B', 'payload')).toBe(false);
    expect(markServiceRan('A#payload', 'B', 'fuel')).toBe('B#fuel');
    expect(serviceRan('', '', 'fuel')).toBe(false);
  });
});

describe('fuelToleranceKg', () => {
  it('is 10 gallons on the A32NX and 10 kg on the A380X, as on their Fuel pages', () => {
    expect(fuelToleranceKg(false, 3.04)).toBeCloseTo(30.4);
    expect(fuelToleranceKg(true, 3.04)).toBe(10);
  });

  it('lets an A32NX within 10 gallons of its target show complete', () => {
    const kilogramsPerGallon = 3.04;
    const status = fuelServiceStatus({
      ...idleFuel,
      currentKg: 9980,
      targetKg: 10000,
      ordered: true,
      toleranceKg: fuelToleranceKg(false, kilogramsPerGallon),
    });
    expect(status.kind).toBe('complete');
  });
});
