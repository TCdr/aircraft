// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isToConfigNormal, ToConfigState } from './ToConfigNormal';

describe('A380 T.O CONFIG NORMAL', () => {
  const four = (index?: number) => [0, 1, 2, 3].map((i) => i === index);
  const normal: ToConfigState = {
    surfacesNotInToConfig: false,
    doorsInTakeoffConfig: true,
    brakesHot: false,
    elecDriveDisconnected: four(),
    elecGenFault: four(),
    elecGenOff: four(),
    engineOilTempLo: four(),
    pitchTrimFmsCgDisagree: false,
    toFlapsFmsDisagree: false,
    toSpeedsAlert: false,
  };

  it('is shown with no alert of the list', () => {
    expect(isToConfigNormal(normal)).toBe(true);
  });

  it('is not shown with ELEC GEN 3 OFF or GEN 4 FAULT (the A320 condition checked GEN 1+2 only)', () => {
    expect(isToConfigNormal({ ...normal, elecGenOff: four(2) })).toBe(false);
    expect(isToConfigNormal({ ...normal, elecGenFault: four(3) })).toBe(false);
  });

  it('is not shown with ELEC DRIVE 3 DISCONNECTED', () => {
    expect(isToConfigNormal({ ...normal, elecDriveDisconnected: four(2) })).toBe(false);
  });

  it('is not shown with ENG 4 OIL TEMP LO', () => {
    expect(isToConfigNormal({ ...normal, engineOilTempLo: four(3) })).toBe(false);
  });

  it('is not shown with F/CTL PITCH TRIM/FMS/CG DISAGREE', () => {
    expect(isToConfigNormal({ ...normal, pitchTrimFmsCgDisagree: true })).toBe(false);
  });

  it('is not shown with a CONFIG, DOOR, BRAKES HOT, T.O FLAPS/FMS DISAGREE or T.O SPEEDS alert', () => {
    expect(isToConfigNormal({ ...normal, surfacesNotInToConfig: true })).toBe(false);
    expect(isToConfigNormal({ ...normal, doorsInTakeoffConfig: false })).toBe(false);
    expect(isToConfigNormal({ ...normal, brakesHot: true })).toBe(false);
    expect(isToConfigNormal({ ...normal, toFlapsFmsDisagree: true })).toBe(false);
    expect(isToConfigNormal({ ...normal, toSpeedsAlert: true })).toBe(false);
  });

  it('FwsCore uses the A380 list, not the A320 GEN 1+2 potential check', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    const block = core.slice(core.indexOf('/* T.O. CONFIG CHECK */'), core.indexOf('/* CLEAR AND RECALL */'));
    expect(block).toMatch(/isToConfigNormal\(\{/);
    expect(block).not.toContain('engine1Generator');
    expect(block).toContain('this.engineOilTempLo');
  });
});
