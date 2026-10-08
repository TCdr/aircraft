// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isToConfigSystemStatusNormal, ToConfigSystemStatusInputs } from './ToConfigNormal';

const normal: ToConfigSystemStatusInputs = {
  gen12NotOperating: false,
  greenLowPressure: false,
  yellowLowPressure: false,
  blueLowPressure: false,
  eng1PumpPbAuto: true,
  eng2PumpPbAuto: true,
  leftTankPumps1And2LoPr: false,
  rightTankPumps1And2LoPr: false,
};

/* A320 FCOM DSC-31-15: the TO CONFIG test triggers FUEL R(L) TK PUMP 1+2 LO PR; T.O CONFIG NORMAL only without it. */
describe('T.O CONFIG NORMAL system conditions', () => {
  it('is normal with every system normal', () => {
    expect(isToConfigSystemStatusNormal(normal)).toBe(true);
  });

  it.each(['leftTankPumps1And2LoPr', 'rightTankPumps1And2LoPr'] as const)(
    'is not normal with %s (FUEL L(R) TK PUMP 1+2 LO PR)',
    (alert) => {
      expect(isToConfigSystemStatusNormal({ ...normal, [alert]: true })).toBe(false);
    },
  );

  it('keeps the hydraulic and generator conditions', () => {
    expect(isToConfigSystemStatusNormal({ ...normal, gen12NotOperating: true })).toBe(false);
    expect(isToConfigSystemStatusNormal({ ...normal, blueLowPressure: true })).toBe(false);
    expect(isToConfigSystemStatusNormal({ ...normal, eng2PumpPbAuto: false })).toBe(false);
  });

  it('PseudoFWC feeds both wing tank pump alerts to the T.O CONFIG check', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('leftTankPumps1And2LoPr: this.leftTankPumps1And2LoPr.get()');
    expect(fwc).toContain('rightTankPumps1And2LoPr: this.rightTankPumps1And2LoPr.get()');
  });
});
