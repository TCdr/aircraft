// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage } from '../../Common/SdPageSpecHarness';
import { PressureComponent } from './Crz';
import { deltaPClass, deltaPPulses } from './DeltaPIndication';

/* Delta P pulses above 1.5 PSI (resets at 1 PSI) in flight phase 7. */
describe('CRUISE page delta P', () => {
  it('is steady green in cruise (phase 6) at 7.9 PSI', () => {
    const pulsing = deltaPPulses(7.9, 6, false);
    expect(deltaPClass(7.9, pulsing)).toBe('Green');
  });

  it('pulses green in phase 7 above 1.5 PSI', () => {
    expect(deltaPClass(1.6, deltaPPulses(1.6, 7, false))).toBe('GreenTextPulse');
  });

  it('keeps pulsing down to 1 PSI (hysteresis)', () => {
    expect(deltaPPulses(1.2, 7, true)).toBe(true);
    expect(deltaPPulses(1.2, 7, false)).toBe(false);
    expect(deltaPPulses(0.9, 7, true)).toBe(false);
  });

  it('is amber out of the normal range', () => {
    expect(deltaPClass(8.6, false)).toBe('Amber');
    expect(deltaPClass(-0.5, false)).toBe('Amber');
  });
});

describe('CRUISE page delta P', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  const deltaPDigits = () => page.container.querySelector('[id="Large Green"]')?.getAttribute('class');
  const renderDeltaP = (deltaPsi: number, flightPhase: number) => {
    const simVars = { 'L:A32NX_PRESS_MAN_CABIN_DELTA_PRESSURE': deltaPsi, 'L:A32NX_FWC_FLIGHT_PHASE': flightPhase };
    page = renderSdPage(
      <svg>
        <PressureComponent />
      </svg>,
      simVars,
    );
    return simVars;
  };

  it('pulses in flight phase 7 above 1.5 PSI, kept down to 1 PSI', () => {
    const simVars = renderDeltaP(1.6, 7);
    expect(deltaPDigits()).toContain('GreenTextPulse');

    simVars['L:A32NX_PRESS_MAN_CABIN_DELTA_PRESSURE'] = 1.2;
    page.update();
    expect(deltaPDigits()).toContain('GreenTextPulse');

    simVars['L:A32NX_PRESS_MAN_CABIN_DELTA_PRESSURE'] = 0.9;
    page.update();
    expect(deltaPDigits()).not.toContain('GreenTextPulse');
  });

  it('is steady in cruise (phase 6), not pulsing above 1.5 PSI', () => {
    renderDeltaP(7.9, 6);

    expect(deltaPDigits()).not.toContain('Pulse');
  });
});
