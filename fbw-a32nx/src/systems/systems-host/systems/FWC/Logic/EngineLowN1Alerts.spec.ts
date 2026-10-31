// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, plainText, setOnGround, shownText, startCruiseFwc } from '../FwcAlertProbe';
import {
  EngineLowN1Inputs,
  EngineLowN1Monitor,
  LOW_N1_CONFIRM_SECONDS,
  LOW_N1_PHASE_INHIBITION,
  lowN1Lines,
} from './EngineLowN1Alerts';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

/** A ground start with the core at 40 % N2 and the fan not turning */
const noN1Rotation: EngineLowN1Inputs = {
  onGround: true,
  masterOn: true,
  engineStarting: true,
  n1Percent: 0,
  n2Percent: 40,
};

function runFor(monitor: EngineLowN1Monitor, inputs: EngineLowN1Inputs, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) {
    monitor.update(inputs, 0.1);
  }
}

/* ENG 1(2) LOW N1 (ON GROUND): no N1 rotation during a start */
describe('ENG 1(2) LOW N1', () => {
  it('triggers when the N1 has not rotated during a start once the core turns', () => {
    const monitor = new EngineLowN1Monitor();
    runFor(monitor, noN1Rotation, LOW_N1_CONFIRM_SECONDS - 0.5);
    expect(monitor.isActive).toBe(false);
    runFor(monitor, noN1Rotation, 1);
    expect(monitor.isActive).toBe(true);
  });

  it('does not trigger in a normal start, below the N2 threshold, or when the engine is not starting', () => {
    const normal = new EngineLowN1Monitor();
    runFor(normal, { ...noN1Rotation, n1Percent: 5 }, 10);
    expect(normal.isActive).toBe(false);

    const lowCore = new EngineLowN1Monitor();
    runFor(lowCore, { ...noN1Rotation, n2Percent: 25 }, 10);
    expect(lowCore.isActive).toBe(false);

    const running = new EngineLowN1Monitor();
    runFor(running, { ...noN1Rotation, engineStarting: false }, 10);
    expect(running.isActive).toBe(false);

    const inFlight = new EngineLowN1Monitor();
    runFor(inFlight, { ...noN1Rotation, onGround: false }, 10);
    expect(inFlight.isActive).toBe(false);
  });

  it('stays after the core runs down (automatic start abort) until the ENG MASTER is OFF', () => {
    const monitor = new EngineLowN1Monitor();
    runFor(monitor, noN1Rotation, 3);
    runFor(monitor, { ...noN1Rotation, n2Percent: 22 }, 30);
    expect(monitor.isActive).toBe(true);
    monitor.update({ ...noN1Rotation, n2Percent: 22, masterOn: false }, 0.1);
    expect(monitor.isActive).toBe(false);
  });

  it('shows THR LEVER IDLE only while the lever is not at idle, and always ENG MASTER OFF', () => {
    expect(lowN1Lines(0)).toEqual([0, 1, 3]);
    expect(lowN1Lines(25)).toEqual([0, 1, 2, 3]);
  });

  it('is inhibited in the aircraft flight phases', () => {
    expect(LOW_N1_PHASE_INHIBITION).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it.each([
    ['7700921', 1],
    ['7700922', 2],
  ])(
    '%s is the amber ENG caution of engine %i with its E/WD lines, raised by no N1 rotation in a ground start',
    (key, engine) => {
      const { fwc } = startCruiseFwc(simvars, () => {
        setOnGround(simvars);
        simvars.set(`L:A32NX_ENGINE_STATE:${engine}`, 2);
        simvars.set(`L:A32NX_ENGINE_N1:${engine}`, 0);
        simvars.set(`L:A32NX_ENGINE_N2:${engine}`, 40);
      });
      const item = failureItem(fwc, key);
      expect(item.failure).toBe(2);
      expect(item.sysPage).toBe(EcamSysPage.ENG);
      expect(item.flightPhaseInhib).toEqual(LOW_N1_PHASE_INHIBITION);
      expect(isAlertTriggered(fwc, key)).toBe(false);

      runFwc(fwc, LOW_N1_CONFIRM_SECONDS + 1);
      expect(isAlertTriggered(fwc, key)).toBe(true);
      expect(isAlertTriggered(fwc, engine === 1 ? '7700922' : '7700921')).toBe(false);
      // the lever is at idle in the test: THR LEVER IDLE is not asked for
      expect(formatEwdMessages(item.codesToReturn).map(plainText)).toEqual([
        `ENG ${engine} LOW N1`,
        '.IF CONFIRMED:',
        `-THR LEVER ${engine}.......IDLE`,
        `-ENG MASTER ${engine}.......OFF`,
      ]);
      expect(shownText(fwc, key)).toEqual([
        `ENG ${engine} LOW N1`,
        '.IF CONFIRMED:',
        `-ENG MASTER ${engine}.......OFF`,
      ]);
    },
  );
});
