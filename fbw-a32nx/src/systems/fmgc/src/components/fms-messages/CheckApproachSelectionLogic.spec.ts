// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { isCheckApproachSelection } from './CheckApproachSelectionLogic';

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
