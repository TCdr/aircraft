// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import {
  ApproachLandingSystem,
  isCheckApproachSelection,
  ManuallyTunedIls,
  tunedIlsCorrespondsWithApproach,
} from './CheckApproachSelection';

const ILS_23: ApproachLandingSystem = { type: ApproachType.Ils, ident: 'IKL' };
const RNAV_23: ApproachLandingSystem = { type: ApproachType.Rnav, ident: null };
const TUNED_IKL: ManuallyTunedIls = { ident: 'IKL', frequency: 110.3 };
const TUNED_IOT: ManuallyTunedIls = { ident: 'IOT', frequency: 109.5 };

/** CHECK APPR SEL in DESCENT (no T/D or height condition) */
function inDescent(approach: ApproachLandingSystem | null, tuned: ManuallyTunedIls | null, frequency = 110.3) {
  return isCheckApproachSelection(approach, tuned, frequency, FmgcFlightPhase.Descent, null, null);
}

describe('CHECK APPR SEL', () => {
  it('applies to a manually tuned ILS that is not the one of the ILS approach', () => {
    expect(inDescent(ILS_23, TUNED_IOT)).toBe(true);
    expect(inDescent(ILS_23, TUNED_IKL)).toBe(false);
  });

  it('applies to a manually tuned ILS with a non ILS approach', () => {
    expect(inDescent(RNAV_23, TUNED_IKL)).toBe(true);
  });

  it('does not apply without a manually tuned ILS or without an approach', () => {
    expect(inDescent(RNAV_23, null)).toBe(false);
    expect(inDescent(null, TUNED_IOT)).toBe(false);
  });

  it('compares the frequency of an ILS tuned by frequency only', () => {
    const byFrequency = (frequency: number): ManuallyTunedIls => ({ ident: null, frequency });
    expect(tunedIlsCorrespondsWithApproach(ILS_23, byFrequency(110.3), 110.3)).toBe(true);
    expect(tunedIlsCorrespondsWithApproach(ILS_23, byFrequency(109.5), 110.3)).toBe(false);
    expect(tunedIlsCorrespondsWithApproach(RNAV_23, byFrequency(110.3), 110.3)).toBe(false);
  });

  it('applies in cruise less than 100 NM from the T/D only', () => {
    const inCruise = (toTod: number | null) =>
      isCheckApproachSelection(RNAV_23, TUNED_IKL, null, FmgcFlightPhase.Cruise, toTod, null);
    expect(inCruise(99)).toBe(true);
    expect(inCruise(100)).toBe(false);
    expect(inCruise(null)).toBe(false);
  });

  it('applies in approach above 800 ft only', () => {
    const inApproach = (height: number | null) =>
      isCheckApproachSelection(RNAV_23, TUNED_IKL, null, FmgcFlightPhase.Approach, null, height);
    expect(inApproach(801)).toBe(true);
    expect(inApproach(800)).toBe(false);
    expect(inApproach(null)).toBe(false);
  });

  it('does not apply in the other phases', () => {
    for (const phase of [FmgcFlightPhase.Preflight, FmgcFlightPhase.Climb, FmgcFlightPhase.GoAround]) {
      expect(isCheckApproachSelection(RNAV_23, TUNED_IKL, null, phase, 0, 5000)).toBe(false);
    }
  });

  it('the FMS sends it to the MFD and the PFD', () => {
    const source = readFileSync(resolve(__dirname, 'FmsAdvisoryMessages.ts'), 'utf-8');
    expect(source).toContain(
      'this.apply(this.checkApprSelLatch, checkApprSel ? NXSystemMessages.checkApprSel : null);',
    );
    expect(source).toContain('this.setCheckApprSelOnPfd(checkApprSel);');
    expect(source).toContain("const CHECK_APPR_SEL_PFD_VAR = 'L:A32NX_PFD_MSG_CHECK_APPR_SELECTION';");
    const pfd = readFileSync(resolve(__dirname, '../../PFD/shared/PFDSimvarPublisher.tsx'), 'utf-8');
    expect(pfd).toContain("checkApprSel = 'L:A32NX_PFD_MSG_CHECK_APPR_SELECTION'");
  });
});
