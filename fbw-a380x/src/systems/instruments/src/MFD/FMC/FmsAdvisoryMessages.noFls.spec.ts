// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// first: the fmgc modules it loads depend on their import order
import { createAdvisoryMessages, withStubbedSimVars } from './FmsAdvisoryMessagesSpecSupport';
import { describe, expect, it, vi } from 'vitest';

// FmsAdvisoryMessages only needs the PI leg class for an instanceof check: the real leg classes import each other in a cycle
vi.mock('@fmgc/guidance/lnav/legs/PI', () => ({ PILeg: class {} }));
import { NXSystemMessages } from '../shared/NXSystemMessages';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';

describe('NO FLS FOR THIS APPR on the MFD', () => {
  const scenarioWith = (type: ApproachType | null) =>
    createAdvisoryMessages({
      flightPhase: FmgcFlightPhase.Cruise,
      approach: type === null ? null : { type, finalLegNavaidIdent: null },
    });

  it('is a type II message', () => {
    expect(NXSystemMessages.noFlsForThisAppr.text).toBe('NO FLS FOR THIS APPR');
  });

  it('is queued once for an LDA approach', () => {
    withStubbedSimVars({}, () => {
      const { advisoryMessages, queued } = scenarioWith(ApproachType.Lda);
      advisoryMessages.update();
      expect(queued).toContain(NXSystemMessages.noFlsForThisAppr);
      advisoryMessages.update();
      expect(queued.filter((message) => message === NXSystemMessages.noFlsForThisAppr)).toHaveLength(1);
    });
  });

  it('is not queued for an RNAV approach, an ILS approach or no approach', () => {
    withStubbedSimVars({}, () => {
      for (const type of [ApproachType.Rnav, ApproachType.Ils, null]) {
        const { advisoryMessages, queued } = scenarioWith(type);
        advisoryMessages.update();
        expect(queued).not.toContain(NXSystemMessages.noFlsForThisAppr);
      }
    });
  });

  it('is sent again for every new approach without an FLS beam, also after the crew cleared it', () => {
    withStubbedSimVars({}, () => {
      const { advisoryMessages, activePlan, queued, removedTexts } = createAdvisoryMessages({
        flightPhase: FmgcFlightPhase.Cruise,
        approach: { type: ApproachType.Lda, finalLegNavaidIdent: null, ident: 'L19' },
      });
      advisoryMessages.update();
      expect(queued).toHaveLength(1);
      // the crew clears the message, the same approach does not bring it back
      removedTexts.length = 0;
      advisoryMessages.update();
      expect(queued).toHaveLength(1);

      activePlan.approach = { type: ApproachType.Sdf, ident: 'S19', legs: [] };
      advisoryMessages.update();
      expect(queued).toHaveLength(2);
      expect(queued[1]).toBe(NXSystemMessages.noFlsForThisAppr);
    });
  });

  it('is recalled when the approach changes to one with an FLS beam', () => {
    withStubbedSimVars({}, () => {
      const { advisoryMessages, activePlan, queued, removedTexts } = createAdvisoryMessages({
        flightPhase: FmgcFlightPhase.Cruise,
        approach: { type: ApproachType.Lda, finalLegNavaidIdent: null, ident: 'L19' },
      });
      advisoryMessages.update();
      activePlan.approach = { type: ApproachType.Rnav, ident: 'R19', legs: [] };
      advisoryMessages.update();
      expect(removedTexts).toContain('NO FLS FOR THIS APPR');
      expect(queued).toHaveLength(1);
    });
  });
});
