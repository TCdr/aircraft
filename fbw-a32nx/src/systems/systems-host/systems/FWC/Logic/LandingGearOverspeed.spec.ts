// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isGearNotUplockedForVle, VleGearPositionInputs } from './LandingGearOverspeed';

const gearUpAndLocked: VleGearPositionInputs = {
  gearLockedUp: true,
  uplockPositionAvailable: true,
  gearDoorNotClosed: false,
};

/* A320 FCOM PRO-ABN-OVERSPEED: OVER SPEED VLE "with L/G not uplocked or L/G doors not closed" */
describe('OVER SPEED VLE gear condition', () => {
  it('is false with the gear locked up and the doors closed', () => {
    expect(isGearNotUplockedForVle(gearUpAndLocked)).toBe(false);
  });

  it('is true with the gear not locked up', () => {
    expect(isGearNotUplockedForVle({ ...gearUpAndLocked, gearLockedUp: false })).toBe(true);
  });

  it('is true with a gear door not closed', () => {
    expect(isGearNotUplockedForVle({ ...gearUpAndLocked, gearDoorNotClosed: true })).toBe(true);
  });

  // 2026-10-11 sim test: DC EMER CONFIG (DC 1 + DC 2 + DC ESS) at FL180, 290 kt, gear up: red OVER SPEED -VLE
  it('is false with both LGCIUs lost (no uplock position: the FWC cannot see the gear not uplocked)', () => {
    expect(
      isGearNotUplockedForVle({ gearLockedUp: false, uplockPositionAvailable: false, gearDoorNotClosed: false }),
    ).toBe(false);
  });

  it('PseudoFWC uses it for OVER SPEED VLE, with the uplock position available from either LGCIU', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('const gearNotUplocked = isGearNotUplockedForVle({');
    expect(fwc).toContain('uplockPositionAvailable: !lgciu1DiscreteWord3Invalid || !lgciu2DiscreteWord3Invalid,');
  });
});
