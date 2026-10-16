// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isEnginePumpsTurnOffUnsuccessful, isHydSystemOverheat } from './HydOverheatFlags';

/*
 * A380 FCOM PRO-ABN HYD G (Y) SYS OVHT (a380_fcom.txt l.155436-155437): "The temperature of the green (yellow) hydraulic
 * reservoir is above 95 C, or an engine pump case drain temperature is above 120 C".
 */
describe('HYD SYS OVHT trigger', () => {
  it('is raised by the reservoir overheat', () => {
    expect(isHydSystemOverheat(true, [false, false, false, false])).toBe(true);
  });

  it('is raised by the overheat of any engine pump of the system (case drain term)', () => {
    expect(isHydSystemOverheat(false, [false, false, true, false])).toBe(true);
  });

  it('is not raised without an overheat', () => {
    expect(isHydSystemOverheat(false, [false, false, false, false])).toBe(false);
  });

  it('is fed by the reservoir and the 4 engine pump overheats of each system in FwsCore', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toContain('SimVar.GetSimVarValue(`L:A32NX_HYD_${pump}_EDPUMP_OVHT`');
    for (const [color, pumps] of [
      ['GREEN', ['1A', '1B', '2A', '2B']],
      ['YELLOW', ['3A', '3B', '4A', '4B']],
    ] as const) {
      expect(core).toContain(`L:A32NX_HYD_${color}_RESERVOIR_OVHT`);
      expect(core).toContain(`[${pumps.map((pump) => `'${color}_${pump}'`).join(', ')}].map(enginePumpOverheat)`);
    }
    expect(core).toMatch(/this\.greenRsvOverheat\.set\(\s*isHydSystemOverheat\(/);
    expect(core).toMatch(/this\.yellowRsvOverheat\.set\(\s*isHydSystemOverheat\(/);
  });

  it('reads the engine pump pressure switches as below 2 500 PSI (ENG PMP PRESS LO, l.155038)', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).not.toContain('PumpBelow2900');
    expect(core.match(/const eng[1-4][AB]PumpBelow2500 = /g)).toHaveLength(8);
  });
});

/* A380 FCOM PRO-ABN HYD G (Y) SYS OVHT: "If turning off G (Y) ENG 1 (3) PMP A or B is not successful: ... DISC". */
describe('HYD SYS OVHT: ENG PMP A+B DISC line', () => {
  it('is hidden before the pumps are turned off', () => {
    expect(isEnginePumpsTurnOffUnsuccessful(true, true, true, true)).toBe(false);
  });

  it('is hidden when both pumps depressurised once OFF', () => {
    expect(isEnginePumpsTurnOffUnsuccessful(false, false, false, false)).toBe(false);
  });

  it('is shown when a pump OFF keeps its pressure', () => {
    expect(isEnginePumpsTurnOffUnsuccessful(false, true, false, false)).toBe(true);
    expect(isEnginePumpsTurnOffUnsuccessful(false, false, false, true)).toBe(true);
  });
});
