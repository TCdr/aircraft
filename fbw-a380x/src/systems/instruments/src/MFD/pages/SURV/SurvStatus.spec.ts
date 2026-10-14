// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { selectedTransponderFailed, tawsInUseText, tawsSystem, wxrFunctionsFailed } from './SurvStatus';

describe('SURV CONTROLS XPDR label', () => {
  it('is failed when the XPDR of the selected system is failed', () => {
    expect(selectedTransponderFailed(0, true, false)).toBe(true);
    expect(selectedTransponderFailed(1, false, true)).toBe(true);
  });

  it('is not failed when only the XPDR of the other system is failed', () => {
    expect(selectedTransponderFailed(0, false, true)).toBe(false);
    expect(selectedTransponderFailed(1, true, false)).toBe(false);
  });
});

describe('SURV STATUS & SWITCHING WXR functions', () => {
  it('fails TURB and PRED W/S with the WXR of their system', () => {
    expect(wxrFunctionsFailed(true)).toEqual({ wxDisplay: true, turb: true, predWs: true });
    expect(wxrFunctionsFailed(false)).toEqual({ wxDisplay: false, turb: false, predWs: false });
  });
});

describe('SURV STATUS & SWITCHING TAWS in use', () => {
  it('takes the TAWS system in use, else the selected WXR/TAWS system', () => {
    expect(tawsSystem(1, 2)).toBe(2);
    expect(tawsSystem(2, 0)).toBe(2);
    expect(tawsSystem(0, 0)).toBe(0);
  });

  it('shows TAWS n IN USE only when the TAWS comes from the other system', () => {
    expect(tawsInUseText(1, 2)).toBe('TAWS 2 IN USE');
    expect(tawsInUseText(2, 1)).toBe('TAWS 1 IN USE');
    expect(tawsInUseText(1, 1)).toBeNull();
    expect(tawsInUseText(2, 0)).toBeNull();
  });
});
