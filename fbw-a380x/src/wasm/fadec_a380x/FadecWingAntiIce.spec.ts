// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * A380 FCOM DSC-70 CONTROLS AND INDICATORS: "The TOGA thrust takes the bleed demand into account", and the BLEED
 * SUPPLY indication lists the wing anti-ice. The A380X WING ANTI ICE pb toggles A:STRUCTURAL DEICE SWITCH; nothing on
 * the A380X writes the A32NX Rust variable L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON. (The FADEC has no C++ test harness.)
 */
describe('A380X FADEC wing anti-ice input', () => {
  const simData = readFileSync(resolve(__dirname, 'src/Fadec/FadecSimData_A380X.hpp'), 'utf8');

  it('reads the WING ANTI ICE pb (STRUCTURAL DEICE SWITCH)', () => {
    expect(simData).toMatch(/wingAntiIce\s*=\s*dm->make_aircraft_var\("STRUCTURAL DEICE SWITCH"/);
    expect(simData).toMatch(/AircraftVariablePtr wingAntiIce;/);
  });

  it('does not read the unwritten A32NX wing anti-ice variable', () => {
    expect(simData).not.toContain('A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON');
  });
});
