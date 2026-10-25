// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isNewFlightOfFlownOfp } from './newFlight';

describe('isNewFlightOfFlownOfp', () => {
  it('is a new flight when the flown OFP is loaded on the ground at its departure airport', () => {
    expect(isNewFlightOfFlownOfp({ flownOfp: true, onGround: true, atDepartureAirport: true })).toBe(true);
  });

  it('is the finished flight at the destination', () => {
    expect(isNewFlightOfFlownOfp({ flownOfp: true, onGround: true, atDepartureAirport: false })).toBe(false);
  });

  it('is not a new flight in the air, e.g. a circuit back over the departure airport', () => {
    expect(isNewFlightOfFlownOfp({ flownOfp: true, onGround: false, atDepartureAirport: true })).toBe(false);
  });

  it('has nothing to reset for an OFP that was not flown', () => {
    expect(isNewFlightOfFlownOfp({ flownOfp: false, onGround: true, atDepartureAirport: true })).toBe(false);
  });
});
