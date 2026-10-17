// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { bfoAfterRmpBfoKey, isSignalReceived, navigationReceiverFailedVar, RMP_ADF_MODE } from './NavigationReceivers';

describe('A32NX radio navigation receivers', () => {
  it('names the failed L:var of each receiver', () => {
    expect(navigationReceiverFailedVar('VOR', 1)).toBe('L:A32NX_VOR_1_FAILED');
    expect(navigationReceiverFailedVar('ILS', 2)).toBe('L:A32NX_ILS_2_FAILED');
  });

  it('loses the signal of a failed receiver', () => {
    expect(isSignalReceived(1, false)).toBe(true);
    expect(isSignalReceived(1, true)).toBe(false);
    expect(isSignalReceived(0, false)).toBe(false);
  });

  it('toggles the BFO with the RMP BFO key while the ADF is selected in NAV backup', () => {
    expect(bfoAfterRmpBfoKey(true, RMP_ADF_MODE, false)).toBe(true);
    expect(bfoAfterRmpBfoKey(true, RMP_ADF_MODE, true)).toBe(false);
  });

  it('ignores the RMP BFO key without the ADF selected', () => {
    // NAV backup on, VOR selected (mode 6)
    expect(bfoAfterRmpBfoKey(true, 6, false)).toBe(null);
    // NAV backup off: the RMP does not control the ADF
    expect(bfoAfterRmpBfoKey(false, RMP_ADF_MODE, false)).toBe(null);
  });
});
