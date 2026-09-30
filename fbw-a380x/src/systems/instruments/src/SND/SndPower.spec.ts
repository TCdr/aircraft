// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { IsisPowerUnit, IsisUnitState } from './SndPower';

describe('ISIS unit power-up', () => {
  it('runs its 90 s tests at the first power-up of a cold and dark spawn', () => {
    const unit = new IsisPowerUnit(true);
    unit.update(false, 1);
    expect(unit.state).toBe(IsisUnitState.Off);

    unit.update(true, 0);
    expect(unit.state).toBe(IsisUnitState.SelfTest);
    expect(unit.selfTestRemaining).toBe(90);

    unit.update(true, 30.5);
    expect(unit.selfTestRemaining).toBe(60);

    for (let i = 0; i < 61; i++) {
      unit.update(true, 1);
    }
    unit.update(true, 1);
    expect(unit.state).toBe(IsisUnitState.On);
    expect(unit.selfTestRemaining).toBeNull();
  });

  it('is on at once in a powered spawn, and stays on 10 s after a power loss', () => {
    const unit = new IsisPowerUnit(false);
    unit.update(true, 0);
    expect(unit.state).toBe(IsisUnitState.On);

    unit.update(false, 0);
    expect(unit.state).toBe(IsisUnitState.Standby);
    unit.update(true, 5);
    expect(unit.state).toBe(IsisUnitState.On);

    unit.update(false, 0);
    for (let i = 0; i < 12; i++) {
      unit.update(false, 1);
    }
    expect(unit.state).toBe(IsisUnitState.Off);

    // Powered again: the tests run again
    unit.update(true, 0);
    expect(unit.state).toBe(IsisUnitState.SelfTest);
  });
});
