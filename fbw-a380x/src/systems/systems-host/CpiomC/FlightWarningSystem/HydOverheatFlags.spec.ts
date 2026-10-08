// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isEnginePumpsTurnOffUnsuccessful } from './HydOverheatFlags';

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
