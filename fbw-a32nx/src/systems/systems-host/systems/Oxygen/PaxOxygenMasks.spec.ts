// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { PAX_MASK_RELEASE_CABIN_ALTITUDE_FT, PaxOxygenMasks, isPaxMaskAutoRelease } from './PaxOxygenMasks';

/* The mask containers open when the cabin pressure altitude exceeds 14 000 ft (+250, -750 ft) */
describe('passenger oxygen masks automatic release', () => {
  it('drops the masks when the cabin altitude goes above 14 000 ft', () => {
    expect(PAX_MASK_RELEASE_CABIN_ALTITUDE_FT).toBe(14_000);
    expect(isPaxMaskAutoRelease(13_900, 14_100)).toBe(true);
  });

  it('not below 14 000 ft', () => {
    expect(isPaxMaskAutoRelease(13_000, 13_999)).toBe(false);
  });

  it('once only: the crew can reset the masks in a cabin that stays above 14 000 ft', () => {
    expect(isPaxMaskAutoRelease(14_100, 14_200)).toBe(false);
  });

  it('not at the first update (a flight loaded on an airfield above 14 000 ft)', () => {
    expect(isPaxMaskAutoRelease(null, 14_500)).toBe(false);
  });

  it('runs in the systems host', () => {
    const host = readFileSync(resolve(__dirname, '../../index.ts'), 'utf-8');
    expect(host).toContain("this.backplane.addInstrument('PaxOxygenMasks', new PaxOxygenMasks());");
  });
});

/* The instrument reads the cabin altitude of CPC 1 and sets the L:vars of the MASK MAN ON pb */
describe('PaxOxygenMasks instrument', () => {
  const { GetSimVarValue, SetSimVarValue } = SimVar;
  const vars = new Map<string, any>();

  afterEach(() => {
    SimVar.GetSimVarValue = GetSimVarValue;
    SimVar.SetSimVarValue = SetSimVarValue;
    vars.clear();
  });

  function updateAt(masks: PaxOxygenMasks, cabinAltitudeFt: number): void {
    SimVar.GetSimVarValue = (name: string) => (name === 'L:A32NX_PRESS_MAN_CABIN_ALTITUDE' ? cabinAltitudeFt : 0);
    SimVar.SetSimVarValue = (name: string, _unit: string, value: any) => {
      vars.set(name, value);
      return Promise.resolve();
    };
    masks.onUpdate();
  }

  it('deploys the masks and lights the PASSENGER SYS ON light when the cabin climbs through 14 000 ft', () => {
    const masks = new PaxOxygenMasks();
    updateAt(masks, 13_000);
    expect(vars.size).toBe(0);
    updateAt(masks, 14_100);
    expect(vars.get('L:A32NX_OXYGEN_MASKS_DEPLOYED')).toBe(true);
    expect(vars.get('L:A32NX_OXYGEN_PASSENGER_LIGHT_ON')).toBe(true);
  });

  it('does not deploy them for a flight loaded with the cabin above 14 000 ft', () => {
    const masks = new PaxOxygenMasks();
    updateAt(masks, 15_000);
    updateAt(masks, 15_200);
    expect(vars.size).toBe(0);
  });
});
