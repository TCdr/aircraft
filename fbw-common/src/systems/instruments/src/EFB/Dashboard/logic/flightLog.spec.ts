// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightLog, flightSummary, parseFlightLog, updateFlightLog } from './flightLog';

const event = (unixSeconds: number, fobKg = 8000, grossWeightKg = 70000) => ({ unixSeconds, fobKg, grossWeightKg });
const PLAN = { blockMinutes: 80, flightMinutes: 60, tripFuelKg: 3000, landingWeightKg: 64000 };

describe('updateFlightLog', () => {
  it('records off blocks when the aircraft leaves the gate', () => {
    const log = updateFlightLog(
      null,
      { phase: 'atGate', onGround: true },
      { ofpKey: 'A', phase: 'taxiOut', onGround: true, event: event(100) },
    );
    expect(log).toEqual({ ofpKey: 'A', offBlocks: event(100) });
  });

  it('records takeoff and touchdown on the ground transitions', () => {
    let log = updateFlightLog(
      { ofpKey: 'A' },
      { phase: 'takeoff', onGround: true },
      { ofpKey: 'A', phase: 'climb', onGround: false, event: event(200, 7900) },
    );
    log = updateFlightLog(
      log,
      { phase: 'approach', onGround: false },
      { ofpKey: 'A', phase: 'approach', onGround: true, event: event(3800, 4800, 64500) },
    );
    expect(log.takeoff).toEqual(event(200, 7900));
    expect(log.touchdown).toEqual(event(3800, 4800, 64500));
  });

  it('records on blocks on arrival', () => {
    const log = updateFlightLog(
      { ofpKey: 'A' },
      { phase: 'taxiIn', onGround: true },
      { ofpKey: 'A', phase: 'arrived', onGround: true, event: event(4400) },
    );
    expect(log.onBlocks).toEqual(event(4400));
  });

  it('starts a new log for a new OFP', () => {
    const old: FlightLog = { ofpKey: 'A', offBlocks: event(1) };
    const log = updateFlightLog(
      old,
      { phase: 'atGate', onGround: true },
      { ofpKey: 'B', phase: 'atGate', onGround: true, event: event(9) },
    );
    expect(log).toEqual({ ofpKey: 'B' });
  });

  it('does not take the arrival of a flown OFP as off blocks', () => {
    const log = updateFlightLog(
      { ofpKey: 'A' },
      { phase: 'atGate', onGround: true },
      { ofpKey: 'A', phase: 'arrived', onGround: true, event: event(9) },
    );
    expect(log.offBlocks).toBeUndefined();
  });
});

describe('parseFlightLog', () => {
  it('reads a stored log and rejects anything else', () => {
    expect(parseFlightLog('{"ofpKey":"A"}')).toEqual({ ofpKey: 'A' });
    expect(parseFlightLog('')).toBeNull();
    expect(parseFlightLog('not json')).toBeNull();
    expect(parseFlightLog('{"x":1}')).toBeNull();
  });
});

describe('flightSummary', () => {
  it('computes the actual figures and the fuel difference against the plan', () => {
    const log: FlightLog = {
      ofpKey: 'A',
      offBlocks: event(0, 8200),
      takeoff: event(600, 8000),
      touchdown: event(4200, 4700, 64100),
      onBlocks: event(4800, 4600),
    };
    expect(flightSummary(log, PLAN)).toEqual({
      blockMinutes: 80,
      flightMinutes: 60,
      fuelUsedKg: 3300,
      landingWeightKg: 64100,
      fuelUsedDeltaKg: 300,
    });
  });

  it('leaves out what was not seen', () => {
    expect(flightSummary({ ofpKey: 'A', touchdown: event(10) }, PLAN)).toMatchObject({
      blockMinutes: null,
      flightMinutes: null,
      fuelUsedKg: null,
      fuelUsedDeltaKg: null,
    });
    expect(flightSummary(null, PLAN).landingWeightKg).toBeNull();
  });
});
