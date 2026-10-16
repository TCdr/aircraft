// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { WingAntiIceInputs, wingAntiIceIndication } from './WingAntiIceIndication';

const off: WingAntiIceInputs = {
  valvesClosed: true,
  abnormallyClosed: false,
  abnormallyOpen: false,
  lowPressure: false,
  highPressure: false,
};

/* A380 FCOM DSC-30-10-20 BLEED SYSTEM DISPLAY, WING A-ICE INDICATION (a380_fcom.txt l.62050-62079) */
describe('SD BLEED WING A-ICE indication', () => {
  it('is not displayed when wing anti-ice is off', () => {
    expect(wingAntiIceIndication(off)).toBe('hidden');
  });

  it('shows a white legend and a green triangle with wing anti-ice on', () => {
    expect(wingAntiIceIndication({ ...off, valvesClosed: false })).toBe('on');
  });

  it('shows an amber legend without triangle when commanded on but remains off', () => {
    expect(wingAntiIceIndication({ ...off, abnormallyClosed: true })).toBe('commandedOnRemainsOff');
  });

  it('shows an amber legend and triangle when commanded off but remains on, or at an abnormal pressure', () => {
    expect(wingAntiIceIndication({ ...off, valvesClosed: false, abnormallyOpen: true })).toBe('abnormal');
    expect(wingAntiIceIndication({ ...off, valvesClosed: false, lowPressure: true })).toBe('abnormal');
    expect(wingAntiIceIndication({ ...off, valvesClosed: false, highPressure: true })).toBe('abnormal');
  });
});
