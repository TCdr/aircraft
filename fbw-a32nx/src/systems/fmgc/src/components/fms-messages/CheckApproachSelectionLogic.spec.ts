// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { glsChannelCorrespondsWithApproach, isCheckApproachSelection } from './CheckApproachSelectionLogic';

describe('CHECK APPR SELECTION message', () => {
  it('applies to a non ILS approach with a manually tuned ILS in descent and approach', () => {
    expect(isCheckApproachSelection(ApproachType.Rnav, true, FmgcFlightPhase.Descent, -20)).toBe(true);
    expect(isCheckApproachSelection(ApproachType.Vor, true, FmgcFlightPhase.Approach, null)).toBe(true);
  });

  it('applies in cruise less than 100 NM from the T/D only', () => {
    expect(isCheckApproachSelection(ApproachType.Rnav, true, FmgcFlightPhase.Cruise, 100)).toBe(false);
    expect(isCheckApproachSelection(ApproachType.Rnav, true, FmgcFlightPhase.Cruise, 99)).toBe(true);
    expect(isCheckApproachSelection(ApproachType.Rnav, true, FmgcFlightPhase.Cruise, null)).toBe(false);
    expect(isCheckApproachSelection(ApproachType.Rnav, true, FmgcFlightPhase.Climb, 50)).toBe(false);
  });

  it('does not apply to an ILS (LOC, LDA...) approach or without a manual ILS', () => {
    expect(isCheckApproachSelection(ApproachType.Ils, true, FmgcFlightPhase.Approach, null)).toBe(false);
    expect(isCheckApproachSelection(ApproachType.Loc, true, FmgcFlightPhase.Approach, null)).toBe(false);
    expect(isCheckApproachSelection(ApproachType.Rnav, false, FmgcFlightPhase.Approach, null)).toBe(false);
    expect(isCheckApproachSelection(null, true, FmgcFlightPhase.Approach, null)).toBe(false);
  });
});

describe('CHECK APPR SELECTION with a GLS', () => {
  it('does not apply to a GLS approach', () => {
    expect(isCheckApproachSelection(ApproachType.Gls, true, FmgcFlightPhase.Approach, null)).toBe(false);
  });

  it('compares the channel of a tuned GLS with the one of the approach', () => {
    expect(glsChannelCorrespondsWithApproach(31434, 31434)).toBe(true);
    expect(glsChannelCorrespondsWithApproach(31434, 28968)).toBe(false);
    expect(glsChannelCorrespondsWithApproach(31434, null)).toBe(false);
    expect(glsChannelCorrespondsWithApproach(null, 31434)).toBe(false);
  });
});
