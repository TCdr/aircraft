// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

// The COND SD page OVHT and trim air valve marks read L:vars written per zone by the temperature controller (Rust).
// The names are built from strings on both sides, so this checks they stay the same.
const tadd = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../wasm/systems/a380_systems/src/air_conditioning/local_controllers/trim_air_drive_device.rs',
  ),
  'utf-8',
);
const cabinTemperatures = readFileSync(resolve(__dirname, 'CabinTemperatures.tsx'), 'utf-8');
const cargoTemperatures = readFileSync(resolve(__dirname, 'CargoTemperatures.tsx'), 'utf-8');

describe('COND SD page OVHT and trim air valve marks (A380 FCOM DSC-21-10-20)', () => {
  it('are written per zone by the temperature controller', () => {
    expect(tadd).toContain('format!("COND_{}_DUCT_OVHT", zone)');
    expect(tadd).toContain('format!("COND_{}_TRIM_AIR_VALVE_FAULT", zone)');
  });

  it('are read for the cockpit and every cabin zone, not hard-coded', () => {
    expect(cabinTemperatures).toContain('`L:A32NX_COND_${zone}_DUCT_OVHT`');
    expect(cabinTemperatures).toContain('`L:A32NX_COND_${zone}_TRIM_AIR_VALVE_FAULT`');
    expect(cabinTemperatures).toContain('zone="CKPT"');
    expect(cabinTemperatures).not.toMatch(/const (ductOverheat|trimAirFailure) = false/);
  });

  it('are read for the forward cargo, not hard-coded', () => {
    expect(cargoTemperatures).toContain("'L:A32NX_COND_CARGO_FWD_DUCT_OVHT'");
    expect(cargoTemperatures).toContain("'L:A32NX_COND_CARGO_FWD_TRIM_AIR_VALVE_FAULT'");
    expect(cargoTemperatures).not.toMatch(/const fwdCargoOverheat = false/);
  });
});
