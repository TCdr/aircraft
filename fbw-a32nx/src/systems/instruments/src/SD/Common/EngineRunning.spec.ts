// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isEngineN2BelowIdle, isEngineRunning } from './EngineRunning';

/** An idle N2 of the FADEC (L:A32NX_ENGINE_IDLE_N2) */
const IDLE_N2 = 68;

/* A320 FCOM HYD page l.44057-44058, BLEED page l.57846-57848, ELEC page l.37528 */
describe('SD engine signals', () => {
  it('finds the N2 below idle on an engine off, starting or flamed out (HYD PUMP legend, BLEED engine number)', () => {
    expect(isEngineN2BelowIdle(0, IDLE_N2)).toBe(true);
    // a starting engine at 25 % N2, above the 15 % of the HYD page before: amber until idle
    expect(isEngineN2BelowIdle(25, IDLE_N2)).toBe(true);
    // a windmilling engine at 40 % N2 in flight
    expect(isEngineN2BelowIdle(40, IDLE_N2)).toBe(true);
  });

  it('finds an engine at idle or above not below idle', () => {
    expect(isEngineN2BelowIdle(IDLE_N2, IDLE_N2)).toBe(false);
    expect(isEngineN2BelowIdle(IDLE_N2 - 2, IDLE_N2)).toBe(false);
    expect(isEngineN2BelowIdle(95, IDLE_N2)).toBe(false);
  });

  it('finds the engine running only in the FADEC state ON (ELEC GEN number)', () => {
    expect(isEngineRunning(1)).toBe(true);
    // OFF, STARTING, RESTARTING, SHUTTING
    expect(isEngineRunning(0)).toBe(false);
    expect(isEngineRunning(2)).toBe(false);
    expect(isEngineRunning(3)).toBe(false);
    expect(isEngineRunning(4)).toBe(false);
  });
});
