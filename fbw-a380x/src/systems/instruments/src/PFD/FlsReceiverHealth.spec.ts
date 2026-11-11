// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isOwnSideFlsDeviationValid, ownSideFlsFailedTopic } from './FlsReceiverHealth';
import { PFDVars } from './shared/PFDSimvarPublisher';

describe('A380X PFD FLS receiver health', () => {
  const healthy = { beamValid: true, flsFailed: false, mmrPowered: true };

  it('shows the FLS deviation of a valid beam through a powered MMR without failure', () => {
    expect(isOwnSideFlsDeviationValid(healthy)).toBe(true);
  });

  it('shows no FLS deviation without a valid beam', () => {
    expect(isOwnSideFlsDeviationValid({ ...healthy, beamValid: false })).toBe(false);
  });

  it('shows no FLS deviation when the MMR of its side is failed', () => {
    expect(isOwnSideFlsDeviationValid({ ...healthy, flsFailed: true })).toBe(false);
  });

  it('shows no FLS deviation when the MMR of its side has no power', () => {
    expect(isOwnSideFlsDeviationValid({ ...healthy, mmrPowered: false })).toBe(false);
  });

  it('reads the FLS failure of its own side: PFD 1 the MMR 1, PFD 2 the MMR 2', () => {
    expect(ownSideFlsFailedTopic(1)).toBe('fls1Failed');
    expect(ownSideFlsFailedTopic(2)).toBe('fls2Failed');
  });

  it('publishes the FLS failures the systems host writes', () => {
    expect(PFDVars.fls1Failed).toBe('L:A32NX_FLS_1_FAILED');
    expect(PFDVars.fls2Failed).toBe('L:A32NX_FLS_2_FAILED');
  });
});
