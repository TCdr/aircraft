// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { publishedTawsSystem, tawsSystemInUse, WxrTawsSystemsState } from './TawsSystemInUse';

const healthy: WxrTawsSystemsState = {
  selected: 1,
  taws1Failed: false,
  taws2Failed: false,
  wxr1Failed: false,
  wxr2Failed: false,
};

describe('the TAWS system in use', () => {
  it('is the selected system in normal operation', () => {
    expect(tawsSystemInUse(healthy)).toBe(1);
    expect(tawsSystemInUse({ ...healthy, selected: 2 })).toBe(2);
  });

  it('is none without a selected system', () => {
    expect(tawsSystemInUse({ ...healthy, selected: 0 })).toBe(0);
  });

  it('moves to the other system when the selected TAWS fails and the other WXR is failed', () => {
    expect(tawsSystemInUse({ ...healthy, taws1Failed: true, wxr2Failed: true })).toBe(2);
    expect(tawsSystemInUse({ ...healthy, selected: 2, taws2Failed: true, wxr1Failed: true })).toBe(1);
  });

  it('stays on the selected system while the other WXR is operative (the crew selects the other system)', () => {
    expect(tawsSystemInUse({ ...healthy, taws1Failed: true })).toBe(1);
  });

  it('stays on the selected system when both TAWS are failed', () => {
    expect(tawsSystemInUse({ ...healthy, taws1Failed: true, taws2Failed: true, wxr2Failed: true })).toBe(1);
  });

  it('does not move for a failure of the other system only', () => {
    expect(tawsSystemInUse({ ...healthy, taws2Failed: true, wxr2Failed: true })).toBe(1);
  });
});

describe('the published TAWS system', () => {
  it('is the TAWS system in use, else the selected system', () => {
    expect(publishedTawsSystem(1, 2)).toBe(2);
    expect(publishedTawsSystem(2, 0)).toBe(2);
    expect(publishedTawsSystem(0, 0)).toBe(0);
  });
});
