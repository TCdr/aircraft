// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { describe, expect, it } from 'vitest';
import { withRenderedSdElement } from '../../../SdSpecSupport';
import AvionicsVentilation from './AvionicsVentilation';
import CargoTemperatures from './CargoTemperatures';
import { avionicsBaySmokeLegend, cargoSmokeIndications } from './CondSmokeIndications';

/** @returns the x position of every SMOKE legend that is shown on the COND page element */
function shownSmokeLegends(element: React.ReactElement, simVars: Record<string, number>): string[] {
  return withRenderedSdElement(element, simVars, (container) =>
    Array.from(container.querySelectorAll('text'))
      .filter((text) => /SMOKE$/.test(text.textContent ?? '') && text.classList.contains('Show'))
      .map((text) => `${text.textContent}@${text.getAttribute('x')},${text.getAttribute('y')}`),
  );
}

describe('COND page cargo SMOKE', () => {
  it('shows the forward cargo smoke in the forward area', () => {
    expect(cargoSmokeIndications(true, false, false)).toEqual({ fwd: true, aftBulk: false });
  });

  it('shows the aft and the bulk cargo smoke in the aft/bulk area', () => {
    expect(cargoSmokeIndications(false, true, false)).toEqual({ fwd: false, aftBulk: true });
    expect(cargoSmokeIndications(false, false, true)).toEqual({ fwd: false, aftBulk: true });
  });

  it('shows nothing without smoke', () => {
    expect(cargoSmokeIndications(false, false, false)).toEqual({ fwd: false, aftBulk: false });
  });

  it('is drawn from the smoke detection: forward cargo at x 340, aft and bulk cargo at x 640', () => {
    const cargo = <CargoTemperatures x={0} y={0} />;
    expect(shownSmokeLegends(cargo, {})).toEqual([]);
    expect(shownSmokeLegends(cargo, { 'L:A32NX_SMOKE_FWD_CARGO_DETECTED': 1 })).toEqual(['SMOKE@340,380']);
    expect(shownSmokeLegends(cargo, { 'L:A32NX_SMOKE_AFT_CARGO_DETECTED': 1 })).toEqual(['SMOKE@640,380']);
    expect(shownSmokeLegends(cargo, { 'L:A32NX_SMOKE_BULK_CARGO_DETECTED': 1 })).toEqual(['SMOKE@640,380']);
  });
});

describe('COND page avionics SMOKE', () => {
  it('names the circuit with smoke', () => {
    expect(avionicsBaySmokeLegend(true, false)).toBe('L SMOKE');
    expect(avionicsBaySmokeLegend(false, true)).toBe('R SMOKE');
    expect(avionicsBaySmokeLegend(true, true)).toBe('L R SMOKE');
    expect(avionicsBaySmokeLegend(false, false)).toBeNull();
  });

  it('is drawn for the main and the upper avionics bays, from the smoke of each circuit', () => {
    const ventilation = <AvionicsVentilation x={0} y={0} />;
    expect(shownSmokeLegends(ventilation, {})).toEqual([]);
    // the upper bay legend is at y 165, the main bay legend at y 398
    expect(shownSmokeLegends(ventilation, { 'L:A32NX_SMOKE_L_UPPER_AVNCS_DETECTED': 1 })).toEqual(['L SMOKE@77,165']);
    expect(shownSmokeLegends(ventilation, { 'L:A32NX_SMOKE_R_UPPER_AVNCS_DETECTED': 1 })).toEqual(['R SMOKE@77,165']);
    expect(shownSmokeLegends(ventilation, { 'L:A32NX_SMOKE_L_MAIN_AVNCS_DETECTED': 1 })).toEqual(['L SMOKE@77,398']);
    expect(shownSmokeLegends(ventilation, { 'L:A32NX_SMOKE_R_MAIN_AVNCS_DETECTED': 1 })).toEqual(['R SMOKE@77,398']);
  });
});
