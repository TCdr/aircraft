// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightPlanLegFlags } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { isDirectToKeyBlockedByTemporary } from './DirectToAccess';

describe('INSERT OR ERASE TMPY F-PLN FIRST on the KCCU DIR key', () => {
  it('opens the DIRECT TO page without a temporary flight plan', () => {
    expect(isDirectToKeyBlockedByTemporary(false, undefined)).toBe(false);
  });

  it('refuses the DIR key while a temporary flight plan of a revision is pending', () => {
    expect(isDirectToKeyBlockedByTemporary(true, { isDiscontinuity: false, flags: 0 })).toBe(true);
    expect(isDirectToKeyBlockedByTemporary(true, { isDiscontinuity: true })).toBe(true);
    expect(isDirectToKeyBlockedByTemporary(true, undefined)).toBe(true);
  });

  it('opens the DIRECT TO page for a temporary flight plan of a direct to', () => {
    expect(
      isDirectToKeyBlockedByTemporary(true, {
        isDiscontinuity: false,
        flags: FlightPlanLegFlags.DirectToTurningPoint | FlightPlanLegFlags.PendingDirectToTurningPoint,
      }),
    ).toBe(false);
  });
});
