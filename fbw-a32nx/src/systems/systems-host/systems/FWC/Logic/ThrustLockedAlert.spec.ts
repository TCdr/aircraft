// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { THRUST_LOCKED_KEY, THRUST_LOCKED_PHASE_INHIBITION, ThrustLockedAlert } from './ThrustLockedAlert';
import { ewdLines, ewdTexts, pseudoFwcSource } from './FwcAlertSpecHelpers';

/** Runs the alert for some seconds in 0.25 s steps, returns the times of the repeated attention getters */
function run(alert: ThrustLockedAlert, thrustLocked: boolean, seconds: number): number[] {
  const repeats: number[] = [];
  for (let i = 1; i <= Math.round(seconds * 4); i++) {
    alert.update(thrustLocked, 0.25);
    if (alert.repeatAttentionGetters) {
      repeats.push(i * 0.25);
    }
  }
  return repeats;
}

/* ENG THRUST LOCKED: triggers when the thrust levers are not moved within 5 s of an involuntary A/THR disconnection;
   the title flashes, the single chime and the MASTER CAUTION repeat every 5 s. */
describe('ENG THRUST LOCKED', () => {
  it('triggers after 5 s of thrust lock, and stops when the levers are moved', () => {
    const alert = new ThrustLockedAlert();
    run(alert, true, 4.75);
    expect(alert.isActive).toBe(false);
    run(alert, true, 0.25);
    expect(alert.isActive).toBe(true);
    run(alert, false, 0.25);
    expect(alert.isActive).toBe(false);
  });

  it('repeats the single chime and the MASTER CAUTION every 5 s after the first one', () => {
    const alert = new ThrustLockedAlert();
    expect(run(alert, true, 21)).toEqual([10, 15, 20]);
  });

  it('shows THR LEVERS MOVE and a flashing title, in phases 5, 6 and 7 only', () => {
    const alert = new ThrustLockedAlert();
    run(alert, true, 6);
    const item = alert.ewdFailures[THRUST_LOCKED_KEY];
    expect(ewdLines(item)).toEqual(['ENG THRUST LOCKED', ' -THR LEVERS........MOVE']);
    expect(ewdTexts([item.codesToReturn[0]])[0]).toContain('\x1b)m');
    expect(item.failure).toBe(2);
    expect(THRUST_LOCKED_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 8, 9, 10]);
  });

  it('is wired in the PseudoFWC: the alert, its input and the repeated attention getters', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.thrustLockedAlert.ewdFailures');
    expect(fwc).toContain('this.thrustLockedAlert.update(this.thrLocked.get()');
    expect(fwc).toContain('this.thrustLockedAlert.repeatAttentionGetters');
  });
});
