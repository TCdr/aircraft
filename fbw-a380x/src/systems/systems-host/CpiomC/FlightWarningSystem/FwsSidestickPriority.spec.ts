// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FwsSidestickPriority, SidestickPriorityAural } from './FwsSidestickPriority';

/** A step exact in binary floating point, so the times add up exactly */
const STEP = 0.125;

/** Holds the pbs for some seconds, returns each voice with its time in the segment */
function hold(
  logic: FwsSidestickPriority,
  capt: boolean,
  fo: boolean,
  seconds: number,
  inhibited = false,
): { aural: SidestickPriorityAural; at: number }[] {
  const said: { aural: SidestickPriorityAural; at: number }[] = [];
  for (let step = 1; step <= Math.round(seconds / STEP); step++) {
    const aural = logic.update(capt, fo, inhibited, STEP);
    if (aural !== null) {
      said.push({ aural, at: step * STEP });
    }
  }
  return said;
}

describe('A380 PRIORITY LEFT / PRIORITY RIGHT', () => {
  it('PRIORITY LEFT once when the CAPT holds the sidestick pb', () => {
    // the first update sees the press: the priority is held from there
    expect(hold(new FwsSidestickPriority(), true, false, 5)).toEqual([{ aural: 'priorityLeft', at: 1.125 }]);
  });

  it('PRIORITY RIGHT once when the F/O holds the sidestick pb', () => {
    expect(hold(new FwsSidestickPriority(), false, true, 5)).toEqual([{ aural: 'priorityRight', at: 1.125 }]);
  });

  it('nothing for a short press (autopilot disconnection)', () => {
    const logic = new FwsSidestickPriority();
    expect(hold(logic, true, false, 0.5)).toEqual([]);
    expect(hold(logic, false, false, 3)).toEqual([]);
  });

  it('the last pilot to press gets the priority', () => {
    const logic = new FwsSidestickPriority();
    expect(hold(logic, true, false, 2)).toEqual([{ aural: 'priorityLeft', at: 1.125 }]);
    // the F/O presses while the CAPT still holds: PRIORITY RIGHT
    expect(hold(logic, true, true, 2)).toEqual([{ aural: 'priorityRight', at: 1.125 }]);
    // the F/O releases, the CAPT still holds: nobody has the priority (taken by a press only)
    expect(hold(logic, true, false, 2)).toEqual([]);
  });

  it('called again at the next press', () => {
    const logic = new FwsSidestickPriority();
    hold(logic, true, false, 2);
    hold(logic, false, false, 1);
    expect(hold(logic, true, false, 2)).toEqual([{ aural: 'priorityLeft', at: 1.125 }]);
  });

  it('waits while a GPWS alert is active', () => {
    const logic = new FwsSidestickPriority();
    expect(hold(logic, true, false, 3, true)).toEqual([]);
    expect(hold(logic, true, false, 0.125)).toEqual([{ aural: 'priorityLeft', at: 0.125 }]);
  });
});
