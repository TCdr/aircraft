// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THRUST_LOCKED_KEY, THRUST_LOCKED_PHASE_INHIBITION, ThrustLockedAlert } from './ThrustLockedAlert';
import { ewdLines, ewdTexts } from './FwcAlertSpecHelpers';
import { installFwcSimVarMocks, normalWord, runFwc } from '../PseudoFwcTestBed';
import { isAlertTriggered, shownText, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

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
});

describe('the real FWC: ENG THRUST LOCKED', () => {
  const THRUST_LOCKED_ECU_BIT = 1 << 11;
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  it.each([1, 2])('is raised by the thrust lock bit of ECU %i and repeats the MASTER CAUTION every 5 s', (ecu) => {
    const { fwc } = startCruiseFwc(simvars);
    expect(isAlertTriggered(fwc, THRUST_LOCKED_KEY)).toBe(false);

    simvars.set(`L:A32NX_ECU_${ecu}_MAINTENANCE_WORD_6`, normalWord(THRUST_LOCKED_ECU_BIT));
    runFwc(fwc, 5.5);
    expect(isAlertTriggered(fwc, THRUST_LOCKED_KEY)).toBe(true);
    expect(shownText(fwc, THRUST_LOCKED_KEY)).toEqual(['ENG THRUST LOCKED', '-THR LEVERS........MOVE']);
    expect((fwc as any).masterCaution.get()).toBe(true);

    // the crew pushed the MASTER CAUTION light: it comes on again by itself
    (fwc as any).requestMasterCautionFromFaults = false;
    runFwc(fwc, 1);
    expect((fwc as any).masterCaution.get()).toBe(false);
    runFwc(fwc, 5);
    expect((fwc as any).masterCaution.get()).toBe(true);
  });
});
