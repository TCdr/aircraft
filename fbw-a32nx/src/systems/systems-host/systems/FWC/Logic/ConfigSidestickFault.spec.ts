// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  CONFIG_SIDESTICK_FAULT_PHASE_INHIBITION,
  ConfigSidestickFault,
  ConfigSidestickFaultCodes,
  ConfigSidestickFaultInputs,
} from './ConfigSidestickFault';
import { ewdTexts, pseudoFwcItem, pseudoFwcSource } from './FwcAlertSpecHelpers';

const inputs = (overrides: Partial<ConfigSidestickFaultInputs>): ConfigSidestickFaultInputs => ({
  leftSidestickDeactivated: false,
  rightSidestickDeactivated: false,
  flightPhase: 2,
  toConfigTest: false,
  ...overrides,
});

/* A320 FCOM DSC-27-20-10 (l.41078-41079): "If one sidestick was deactivated on ground, the CONFIG L(R) SIDESTICK FAULT
   alert is triggered at takeoff power application, or during the TO CONFIG test."; PRO-ABN-CONFIG (l.74286-74298). */
describe('CONFIG L(R) SIDESTICK FAULT (BY TAKE OVER)', () => {
  it('nothing with both sidesticks active, at the TO CONFIG test or at takeoff power', () => {
    const logic = new ConfigSidestickFault();
    const test = logic.update(inputs({ toConfigTest: true }));
    expect(test.left.warning || test.right.warning).toBe(false);
    const power = logic.update(inputs({ flightPhase: 3 }));
    expect(power.left.warning || power.right.warning).toBe(false);
  });

  it('nothing in phase 2 without the TO CONFIG test: a deactivated sidestick alone is no alert', () => {
    const logic = new ConfigSidestickFault();
    expect(logic.update(inputs({ leftSidestickDeactivated: true })).left).toEqual({ warning: false, aural: false });
  });

  it('the TO CONFIG test finds the deactivated left sidestick, with the CRC, in phases 1, 2 and 9', () => {
    for (const flightPhase of [1, 2, 9]) {
      const logic = new ConfigSidestickFault();
      const result = logic.update(inputs({ leftSidestickDeactivated: true, toConfigTest: true, flightPhase }));
      expect(result.left).toEqual({ warning: true, aural: true });
      expect(result.right).toEqual({ warning: false, aural: false });
    }
  });

  it('the takeoff power finds the deactivated right sidestick, and the warning stays until phase 5', () => {
    const logic = new ConfigSidestickFault();
    expect(logic.update(inputs({ rightSidestickDeactivated: true, flightPhase: 3 })).right).toEqual({
      warning: true,
      aural: true,
    });
    expect(logic.update(inputs({ rightSidestickDeactivated: true, flightPhase: 4 })).right.warning).toBe(true);
    expect(logic.update(inputs({ rightSidestickDeactivated: true, flightPhase: 5 })).right.warning).toBe(false);
  });

  it('pressing the takeover pb again (the sidestick active) ends it', () => {
    const logic = new ConfigSidestickFault();
    logic.update(inputs({ leftSidestickDeactivated: true, flightPhase: 3 }));
    expect(logic.update(inputs({ flightPhase: 3 })).left.warning).toBe(false);
  });

  it('red CONFIG L SIDESTICK FAULT (BY TAKE OVER), blue -L TAKEOVER.....DEPRESS', () => {
    expect(ewdTexts([...ConfigSidestickFaultCodes.left])).toEqual([
      '\x1b<2m\x1b4mCONFIG\x1bm L SIDESTICK FAULT',
      '\x1b<2m  (BY TAKE OVER)',
      '\x1b<5m -L TAKEOVER.....DEPRESS',
    ]);
    expect(ewdTexts([...ConfigSidestickFaultCodes.right])).toEqual([
      '\x1b<2m\x1b4mCONFIG\x1bm R SIDESTICK FAULT',
      '\x1b<2m  (BY TAKE OVER)',
      '\x1b<5m -R TAKEOVER.....DEPRESS',
    ]);
  });

  it('is inhibited in flight phases 5 to 8 (FCOM PDF page 4519)', () => {
    expect(CONFIG_SIDESTICK_FAULT_PHASE_INHIBITION).toEqual([5, 6, 7, 8]);
  });

  it('PseudoFWC: two red warnings with the CRC, fed by the FCDC sidestick bits; no T.O CONFIG NORMAL', () => {
    for (const [key, side] of [
      ['2700415', 'Left'],
      ['2700416', 'Right'],
    ]) {
      const item = pseudoFwcItem(key);
      expect(item).toContain(`simVarIsActive: this.config${side}SidestickFault`);
      expect(item).toContain(`this.config${side}SidestickFaultAural.map`);
      expect(item).toContain('failure: 3');
    }
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('leftSidestickDeactivated: sidestickInputs.leftSidestickDeactivated');
    expect(fwc).toContain('toConfigTest: this.toConfigTestHeldMin1s5Pulse.get()');
    expect(fwc).toContain('this.pitchTrimNotTo.get() ||\r\n      this.sidestickDeactivatedBeforeTakeoff');
  });
});
