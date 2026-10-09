// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  EngineLowN1Inputs,
  EngineLowN1Monitor,
  LOW_N1_CONFIRM_SECONDS,
  LOW_N1_PHASE_INHIBITION,
  lowN1Lines,
} from './EngineLowN1Alerts';

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

/* A320 FCOM PRO-ABN-ENG ENG 1(2) LOW N1 (ON GROUND), a320_fcom.txt l.80353 */
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

  it('is inhibited in the flight phases of the FCOM figure (2019 PDF page 2277)', () => {
    expect(LOW_N1_PHASE_INHIBITION).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('is wired in the FWC for both engines, amber, with the E/WD lines of the FCOM', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf8');
    expect(fwc).toContain('7700921: this.engineLowN1Alert(1)');
    expect(fwc).toContain('7700922: this.engineLowN1Alert(2)');
    const messages = readFileSync(resolve(__dirname, '../../../../shared/src/EwdMessages.ts'), 'utf8');
    // the E/WD escape sequence as written in EwdMessages.ts (backslash x1b)
    const ESC = String.raw`\x1b`;
    for (const engine of [1, 2]) {
      expect(messages).toContain(`['77009${engine + 20}01', { group: 'ENG$5', text: ' ${engine} LOW N1' }]`);
      expect(messages).toContain(`['77009${engine + 20}02', { text: '${ESC}<7m .IF CONFIRMED:' }]`);
      expect(messages).toContain(`['77009${engine + 20}03', { text: '${ESC}<5m -THR LEVER ${engine}.......IDLE' }]`);
      expect(messages).toContain(`['77009${engine + 20}04', { text: '${ESC}<5m -ENG MASTER ${engine}.......OFF' }]`);
    }
  });
});
