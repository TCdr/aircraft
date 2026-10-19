// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * The derated climb (DeratedClimb_A380X, native test) only lowers the CLB rating of the FADEC: MCT and TOGA, which blend into the
 * climb rating at altitude, keep the maximum climb thrust, so that an engine failure in a derated climb still gets full MCT.
 * (The thrust limit computation needs the MSFS SDK.)
 */
describe('A380X FADEC derated climb wiring', () => {
  const engineControl = readFileSync(resolve(__dirname, 'src/Fadec/EngineControl_A380X.cpp'), 'utf8');

  it('reduces the CLB limit by the derated climb level the FADEC applies', () => {
    expect(engineControl).toMatch(/thrustReductionPercent\(deratedClimbLevel, pressAltitude\)/);
    expect(engineControl).toMatch(/double\s+clb = ThrustLimits_A380X::limitN1\(2,[^;]*climbDerate\);/);
  });

  it('computes MCT without derate and blends it into the maximum climb thrust, not the derated one', () => {
    expect(engineControl).toMatch(/double mct = ThrustLimits_A380X::limitN1\(3, [^;]*wai\);/);
    expect(engineControl).toMatch(/mct\s*= std::max\(maxClimb, mct \+ \(maxClimb - mct\) \* altitudeFactorHigh\);/);
  });

  it('uses the selected idle for the low power band of the heavy rain ignition', () => {
    const igniterCall = engineControl.slice(engineControl.indexOf('igniterSelection[engineIdx].update('));
    expect(igniterCall.slice(0, igniterCall.indexOf('});'))).toContain('selectedIdleN1');
  });
});
