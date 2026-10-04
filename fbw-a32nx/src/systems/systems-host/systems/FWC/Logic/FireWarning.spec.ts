// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isFireAuralActive, isFireWarningActive } from './FireWarning';

describe('ENG / APU FIRE warning (A320 FCOM DSC-26-20-10)', () => {
  it('is not shown without a fire nor a test (a released FIRE pb alone does not raise it)', () => {
    expect(isFireWarningActive({ fireTest: false, fireDetected: false })).toBe(false);
  });

  it('is shown during the fire test', () => {
    expect(isFireWarningActive({ fireTest: true, fireDetected: false })).toBe(true);
  });

  it('is shown while a fire is detected, whatever the FIRE pb position', () => {
    expect(isFireWarningActive({ fireTest: false, fireDetected: true })).toBe(true);
  });
});

describe('ENG / APU FIRE aural (A320 FCOM DSC-26-20-20)', () => {
  it('sounds while the warning is shown and the FIRE pb is not pushed', () => {
    expect(isFireAuralActive({ fireTest: false, fireDetected: true, fireButtonPushed: false })).toBe(true);
  });

  it('is silenced by pushing the FIRE pb, the warning staying while the fire is detected', () => {
    expect(isFireAuralActive({ fireTest: false, fireDetected: true, fireButtonPushed: true })).toBe(false);
    expect(isFireWarningActive({ fireTest: false, fireDetected: true })).toBe(true);
  });

  it('does not sound without a warning', () => {
    expect(isFireAuralActive({ fireTest: false, fireDetected: false, fireButtonPushed: false })).toBe(false);
  });
});
