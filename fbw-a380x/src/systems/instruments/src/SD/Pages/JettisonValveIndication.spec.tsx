// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { describe, expect, it } from 'vitest';
import { withRenderedSdElement } from '../SdSpecSupport';
import { FuelPage } from './FuelPage';
import { jettisonValveIndication } from './JettisonValveIndication';

describe('SD FUEL jettison indication', () => {
  it('is normal (white, no fault) when the valve is open during a jettison', () => {
    expect(jettisonValveIndication(true, true)).toEqual({ fault: false, textClass: 'White' });
  });

  it('is amber when the valve is open without a jettison (abnormally open)', () => {
    expect(jettisonValveIndication(true, false)).toEqual({ fault: true, textClass: 'Amber' });
  });

  it('is amber when the jettison is active but the valve is closed', () => {
    expect(jettisonValveIndication(false, true).textClass).toBe('Amber');
  });

  it('the FUEL page takes the jettison state from the FQMS', () => {
    const legendClasses = (simVars: Record<string, number>) =>
      withRenderedSdElement(<FuelPage />, simVars, (container) =>
        Array.from(container.querySelectorAll('text'))
          .filter((text) => text.textContent === 'JETTISON')
          .map((text) => text.getAttribute('class')),
      );
    const bothValvesOpen = { 'FUELSYSTEM VALVE OPEN:57': 1, 'FUELSYSTEM VALVE OPEN:58': 1 };
    expect(legendClasses({ ...bothValvesOpen, 'L:A380X_FUEL_JETTISON_IN_PROGRESS': 1 })).toEqual([
      'White T2',
      'White T2',
    ]);
    expect(legendClasses({ ...bothValvesOpen, 'L:A380X_FUEL_JETTISON_IN_PROGRESS': 0 })).toEqual([
      'Amber T2',
      'Amber T2',
    ]);
    // jettison running with the valves closed: FUEL JETTISON FAULT
    expect(legendClasses({ 'L:A380X_FUEL_JETTISON_IN_PROGRESS': 1 })).toEqual(['Amber T2', 'Amber T2']);
  });
});
