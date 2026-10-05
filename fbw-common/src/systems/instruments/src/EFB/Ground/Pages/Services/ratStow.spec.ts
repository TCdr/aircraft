// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ratStowLook, ratStowStatusKey } from './ratStow';

describe('RAT stow row of the Services page', () => {
  it('is hidden while the RAT is stowed', () => {
    expect(ratStowLook(0, false, true)).toBe('hidden');
    expect(ratStowLook(0, true, true)).toBe('hidden');
    expect(ratStowLook(Number.NaN, false, true)).toBe('hidden');
  });

  it('offers the stow when the RAT is out and the aircraft is stopped on the ground', () => {
    expect(ratStowLook(1, false, true)).toBe('inactive');
    expect(ratStowLook(0.4, false, true)).toBe('inactive');
  });

  it('is shown greyed out when the RAT is out in flight or while moving', () => {
    expect(ratStowLook(1, false, false)).toBe('disabled');
  });

  it('shows the stow in progress after a request until the RAT is in', () => {
    expect(ratStowLook(0.5, true, true)).toBe('called');
  });

  it('describes each state', () => {
    expect(ratStowStatusKey('inactive')).toBe('Ground.Services.RatExtended');
    expect(ratStowStatusKey('disabled')).toBe('Ground.Services.RatStowGroundOnly');
    expect(ratStowStatusKey('called')).toBe('Ground.Services.RatStowing');
  });
});
