// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import type { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import type { GuidanceController } from '@fmgc/guidance/GuidanceController';
import type { Navigation } from '@fmgc/navigation/Navigation';

import { FMMessageUpdate } from './FmsMessages';
import { NoFlsForThisApproach } from './NoFlsForThisApproach';

// The FM message manager loads the whole guidance, whose leg modules import each other; the selector needs the enum
vi.mock('./FmsMessages', () => ({
  FMMessageUpdate: { NO_ACTION: 0, SEND: 1, RECALL: 2 },
}));

describe('NO FLS FOR THIS APPR on the MCDU', () => {
  const selectorWith = (plan: { hasActive: boolean; approachType: ApproachType | null; ident?: string }) => {
    const selector = new NoFlsForThisApproach();
    const flightPlanService = {
      get hasActive() {
        return plan.hasActive;
      },
      get active() {
        return {
          destinationAirport: { ident: 'LFBO' },
          approach: plan.approachType === null ? undefined : { type: plan.approachType, ident: plan.ident ?? 'A' },
        };
      },
    } as unknown as FlightPlanService;
    selector.init({} as Navigation, {} as GuidanceController, flightPlanService);
    return selector;
  };

  it('is an amber type II message that the crew can clear', () => {
    const selector = new NoFlsForThisApproach();
    expect(selector.message.text).toBe('NO FLS FOR THIS APPR');
    expect(selector.message.color).toBe('Amber');
    expect(selector.message.clearable).toBe(true);
  });

  it('is sent for an LDA approach, once, and recalled when the approach changes to one with an FLS beam', () => {
    const plan = { hasActive: true, approachType: ApproachType.Lda as ApproachType | null };
    const selector = selectorWith(plan);
    expect(selector.process(0)).toBe(FMMessageUpdate.SEND);
    expect(selector.process(0)).toBe(FMMessageUpdate.NO_ACTION);
    plan.approachType = ApproachType.Rnav;
    expect(selector.process(0)).toBe(FMMessageUpdate.RECALL);
  });

  it('does nothing without an active plan', () => {
    const selector = selectorWith({ hasActive: false, approachType: ApproachType.Lda });
    expect(selector.process(0)).toBe(FMMessageUpdate.NO_ACTION);
  });

  it('does nothing before it is initialised', () => {
    expect(new NoFlsForThisApproach().process(0)).toBe(FMMessageUpdate.NO_ACTION);
  });

  it('is sent again for a new approach without an FLS beam, and not twice for the same one', () => {
    const plan = { hasActive: true, approachType: ApproachType.Lda as ApproachType | null, ident: 'L19' };
    const selector = selectorWith(plan);
    expect(selector.process(0)).toBe(FMMessageUpdate.SEND);
    plan.approachType = ApproachType.Sdf;
    plan.ident = 'S19';
    expect(selector.process(0)).toBe(FMMessageUpdate.SEND);
    expect(selector.process(0)).toBe(FMMessageUpdate.NO_ACTION);
  });
});
