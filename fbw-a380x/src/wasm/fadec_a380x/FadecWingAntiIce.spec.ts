// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * The TOGA thrust takes the bleed demand into account, and the bleed supply indication lists the wing anti-ice.
 * A:STRUCTURAL DEICE SWITCH follows the wing anti-ice valves of the systems
 * model (a380_systems ice_rain_protection.rs writes L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON, the systems_wasm wing anti-ice
 * aspect sets STRUCTURAL DEICE from it). (The FADEC has no C++ test harness.)
 */
describe('A380X FADEC wing anti-ice input', () => {
  const simData = readFileSync(resolve(__dirname, 'src/Fadec/FadecSimData_A380X.hpp'), 'utf8');

  it('reads the wing anti-ice valves (STRUCTURAL DEICE SWITCH)', () => {
    expect(simData).toMatch(/wingAntiIce\s*=\s*dm->make_aircraft_var\("STRUCTURAL DEICE SWITCH"/);
    expect(simData).toMatch(/AircraftVariablePtr wingAntiIce;/);
  });

  it('reads the wing anti-ice through STRUCTURAL DEICE SWITCH only', () => {
    expect(simData).not.toContain('A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON');
  });
});
