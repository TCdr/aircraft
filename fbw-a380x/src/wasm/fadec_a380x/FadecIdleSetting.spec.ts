// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * The FADEC idle setting (IdleSetting_A380X: approach idle, bleed demand, oil temperature) raises the idle the engines run at,
 * the idle thrust limit of the FADEC thrust loops. The start sequence still ends at the minimum idle, where MSFS idles at its
 * throttle idle stop: L:A32NX_ENGINE_IDLE_N1/N3 stay the minimum idle, and the in-flight start hold of the fbw module waits for
 * that minimum idle N1. A raised idle there would hold every start until its timeout. (The wiring needs the MSFS SDK; the
 * idle setting itself has a native test.)
 */
describe('A380X FADEC idle setting wiring', () => {
  const engineControl = readFileSync(resolve(__dirname, 'src/Fadec/EngineControl_A380X.cpp'), 'utf8');
  const flyByWireInterface = readFileSync(resolve(__dirname, '../fbw_a380/src/FlyByWireInterface.cpp'), 'utf8');

  it('gives the selected idle to the thrust loops as the idle thrust limit', () => {
    expect(engineControl).toMatch(/IdleSetting_A380X::correctedN3Increase\(idleSettingInputs\(\)\)/);
    expect(engineControl).toMatch(/thrustLimitIdle->set\(selectedIdleN1\)/);
  });

  it('keeps the minimum idle as the idle N1 of the start sequence', () => {
    expect(engineControl).toMatch(/engineIdleN1->set\(idleN1\)/);
  });

  it('ends the in-flight start hold at the minimum idle N1, not the idle thrust limit', () => {
    const holdCall = flyByWireInterface.slice(
      flyByWireInterface.indexOf('engineStartThrottleHolds[fadecIndex].update('),
    );
    const holdInputs = holdCall.slice(0, holdCall.indexOf('});'));
    expect(holdInputs).toContain('idEngineIdleN1->get()');
    expect(holdInputs).not.toContain('thrust_limit_IDLE_percent');
  });
});
