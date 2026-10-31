// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subscribable } from '@microsoft/msfs-sdk';
import { describe, expect, it, vi } from 'vitest';
import { ProbedAlertItem, discreteWordWithBits, probedFailure, startCruiseFwc } from '../FwcControlsAlertProbe';
import { isAlertTriggered } from '../FwcAlertProbe';
import {
  CONFIG_SIDESTICK_FAULT_PHASE_INHIBITION,
  ConfigSidestickFault,
  ConfigSidestickFaultCodes,
  ConfigSidestickFaultInputs,
} from './ConfigSidestickFault';
import { ewdTexts } from './FwcAlertSpecHelpers';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const inputs = (overrides: Partial<ConfigSidestickFaultInputs>): ConfigSidestickFaultInputs => ({
  leftSidestickDeactivated: false,
  rightSidestickDeactivated: false,
  flightPhase: 2,
  toConfigTest: false,
  ...overrides,
});

/* A sidestick deactivated on the ground: the warning at takeoff power or during the TO CONFIG test */
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

  it('is inhibited in flight phases 5 to 8', () => {
    expect(CONFIG_SIDESTICK_FAULT_PHASE_INHIBITION).toEqual([5, 6, 7, 8]);
  });

  it('PseudoFWC: two red warnings with the CRC, fed by the FCDC sidestick bits; no T.O CONFIG NORMAL', () => {
    // FCDC discrete word 2: bit 28 left sidestick deactivated, bit 29 right sidestick deactivated
    const LEFT_SIDESTICK_DEACTIVATED_BIT = 28;
    const RIGHT_SIDESTICK_DEACTIVATED_BIT = 29;
    const AURAL_NONE = 0;
    const AURAL_CRC = 2;
    const FWC_FLIGHT_PHASE = 'L:A32NX_FWC_FLIGHT_PHASE';

    for (const [key, side, bit] of [
      ['2700415', 'left', LEFT_SIDESTICK_DEACTIVATED_BIT],
      ['2700416', 'right', RIGHT_SIDESTICK_DEACTIVATED_BIT],
    ] as const) {
      const rig = startCruiseFwc();
      rig.simvars.set(FWC_FLIGHT_PHASE, 3);
      rig.run(1);
      const alert = probedFailure(rig.fwc, key) as ProbedAlertItem & { auralWarning: Subscribable<number> };
      expect(alert.codesToReturn).toEqual([...ConfigSidestickFaultCodes[side]]);
      expect(alert.failure).toBe(3);
      expect(alert.flightPhaseInhib).toEqual(CONFIG_SIDESTICK_FAULT_PHASE_INHIBITION);
      expect(alert.simVarIsActive.get()).toBe(false);
      expect(alert.auralWarning.get()).toBe(AURAL_NONE);

      rig.simvars.set('L:A32NX_FCDC_1_DISCRETE_WORD_2', discreteWordWithBits(bit));
      rig.run(1);
      expect(alert.simVarIsActive.get()).toBe(true);
      expect(alert.auralWarning.get()).toBe(AURAL_CRC);
      // only the sidestick that is deactivated
      const otherKey = key === '2700415' ? '2700416' : '2700415';
      expect(isAlertTriggered(rig.fwc, otherKey)).toBe(false);
    }
  });

  it('a sidestick deactivated before takeoff (phases 1, 2, 9) gives no T.O CONFIG NORMAL, not in cruise', () => {
    const LEFT_SIDESTICK_DEACTIVATED_BIT = 28;
    const rig = startCruiseFwc();
    const deactivatedBeforeTakeoff = () => (rig.fwc as any).sidestickDeactivatedBeforeTakeoff;
    rig.simvars.set('L:A32NX_FCDC_1_DISCRETE_WORD_2', discreteWordWithBits(LEFT_SIDESTICK_DEACTIVATED_BIT));
    rig.run(1);
    expect(deactivatedBeforeTakeoff()).toBe(false);
    for (const phase of [1, 2, 9]) {
      rig.simvars.set('L:A32NX_FWC_FLIGHT_PHASE', phase);
      rig.run(1);
      expect(deactivatedBeforeTakeoff()).toBe(true);
    }
    rig.simvars.set('L:A32NX_FWC_FLIGHT_PHASE', 2);
    rig.simvars.set('L:A32NX_FCDC_1_DISCRETE_WORD_2', discreteWordWithBits());
    rig.run(1);
    expect(deactivatedBeforeTakeoff()).toBe(false);
  });
});
