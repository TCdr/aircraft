// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { createFws, runFwsCycle } from './FwsSpecFixture';

/*
 * The flight warning loop asks about the simulation time for every alert it checks. Reading the simvar each time costs
 * display thread time, and the time cannot change inside one cycle.
 */
describe('FWS simulation time', () => {
  it('is read once per cycle, however many alerts are checked', () => {
    const { core } = createFws(new Set());
    // an alert becoming active reads the time to stamp it: let the alerts that are active from the start settle
    for (let cycle = 0; cycle < 5; cycle++) {
      runFwsCycle(core);
    }

    const simTimeRead = vi.spyOn((core as unknown as { simTime: { get(): number } }).simTime, 'get');
    runFwsCycle(core);

    expect(Object.keys(core.ewdAbnormal).length).toBeGreaterThan(100);
    expect(simTimeRead).toHaveBeenCalledTimes(1);
  });
});
