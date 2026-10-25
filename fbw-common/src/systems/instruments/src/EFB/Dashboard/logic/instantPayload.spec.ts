// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { loadsPayloadAtOnce } from './instantPayload';

describe('loadsPayloadAtOnce', () => {
  it('boards normally on the ground with the engines off', () => {
    expect(loadsPayloadAtOnce(true, false)).toBe(false);
  });

  it('loads at once on a runway with the engines running', () => {
    expect(loadsPayloadAtOnce(true, true)).toBe(true);
  });

  it('loads at once when airborne', () => {
    expect(loadsPayloadAtOnce(false, false)).toBe(true);
    expect(loadsPayloadAtOnce(false, true)).toBe(true);
  });
});
