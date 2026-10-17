// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { avionicsBaySmokeLegend, cargoSmokeIndications } from './CondSmokeIndications';

const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');

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

  it('is fed by the smoke detection, no longer hard-coded off', () => {
    const element = source('./CargoTemperatures.tsx');
    expect(element).not.toContain('const fwdCargoSmoke = false');
    expect(element).not.toContain('const bulkCargoSmoke = false');
    for (const zone of ['FWD_CARGO', 'AFT_CARGO', 'BULK_CARGO']) {
      expect(element).toContain(`L:A32NX_SMOKE_${zone}_DETECTED`);
    }
    expect(element).toContain('cargoSmokeIndications(');
  });
});

describe('COND page avionics SMOKE', () => {
  it('names the circuit with smoke', () => {
    expect(avionicsBaySmokeLegend(true, false)).toBe('L SMOKE');
    expect(avionicsBaySmokeLegend(false, true)).toBe('R SMOKE');
    expect(avionicsBaySmokeLegend(true, true)).toBe('L R SMOKE');
    expect(avionicsBaySmokeLegend(false, false)).toBeNull();
  });

  it('is drawn for the main and the upper avionics bays', () => {
    const element = source('./AvionicsVentilation.tsx');
    for (const zone of ['L_MAIN_AVNCS', 'R_MAIN_AVNCS', 'L_UPPER_AVNCS', 'R_UPPER_AVNCS']) {
      expect(element).toContain(`L:A32NX_SMOKE_${zone}_DETECTED`);
    }
    expect(element).toContain('avionicsBaySmokeLegend(');
  });
});
