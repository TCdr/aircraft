// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// first: the fmgc modules it loads depend on their import order
import { createAdvisoryMessages, withStubbedSimVars } from './FmsAdvisoryMessagesSpecSupport';
import { describe, expect, it, vi } from 'vitest';

// FmsAdvisoryMessages only needs the PI leg class for an instanceof check: the real leg classes import each other in a cycle
vi.mock('@fmgc/guidance/lnav/legs/PI', () => ({ PILeg: class {} }));
import { NXSystemMessages } from '../shared/NXSystemMessages';
import { FmgcFlightPhase } from '@shared/flightphase';

describe('RUNWAY / LS DISAGREE on the MFD', () => {
  const scenarioWith = (runwayLsMismatch: boolean) => ({ flightPhase: FmgcFlightPhase.Cruise, runwayLsMismatch });

  it('is an amber type II message', () => {
    expect(NXSystemMessages.rwyLsDisagree.text).toBe('RUNWAY / LS DISAGREE');
    expect(NXSystemMessages.rwyLsDisagree.isAmber).toBe(true);
  });

  it('is queued once while the tuned landing system differs from the one of the runway', () => {
    withStubbedSimVars({}, () => {
      const { advisoryMessages, queued } = createAdvisoryMessages(scenarioWith(true));
      advisoryMessages.update();
      advisoryMessages.update();
      expect(queued.filter((message) => message === NXSystemMessages.rwyLsDisagree)).toHaveLength(1);
    });
  });

  it('is not queued while the two agree', () => {
    withStubbedSimVars({}, () => {
      const { advisoryMessages, queued, removedTexts } = createAdvisoryMessages(scenarioWith(false));
      advisoryMessages.update();
      expect(queued).not.toContain(NXSystemMessages.rwyLsDisagree);
      expect(removedTexts).not.toContain('RUNWAY / LS DISAGREE');
    });
  });

  it('is removed when the crew clears the manual tuning, and comes back with the next mismatch', () => {
    withStubbedSimVars({}, () => {
      const scenario = scenarioWith(true);
      const { advisoryMessages, queued, removedTexts } = createAdvisoryMessages(scenario);
      advisoryMessages.update();
      expect(removedTexts).not.toContain('RUNWAY / LS DISAGREE');

      scenario.runwayLsMismatch = false;
      advisoryMessages.update();
      expect(removedTexts).toContain('RUNWAY / LS DISAGREE');

      scenario.runwayLsMismatch = true;
      advisoryMessages.update();
      expect(queued.filter((message) => message === NXSystemMessages.rwyLsDisagree)).toHaveLength(2);
    });
  });
});
