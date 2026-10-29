// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { CabinMaskAutoRelease, readCabinAltitudeFt } from './CabinOxygenMasks';

describe('cabin oxygen masks automatic release', () => {
  it('releases the masks once when the cabin altitude goes above 13 800 ft', () => {
    const release = new CabinMaskAutoRelease();
    expect(release.update(8000, true)).toBe(false);
    expect(release.update(13800, true)).toBe(false);
    expect(release.update(13900, true)).toBe(true);
    // stays above: no new release, so a crew reset (TMR RESET) is not undone
    expect(release.update(15000, true)).toBe(false);
    expect(release.update(12000, true)).toBe(false);
    expect(release.update(14000, true)).toBe(true);
  });

  it('needs DC ESS: released when the power comes back above 13 800 ft', () => {
    const release = new CabinMaskAutoRelease();
    expect(release.update(15000, false)).toBe(false);
    expect(release.update(15000, true)).toBe(true);
  });

  it('keeps its state without a valid cabin altitude', () => {
    const release = new CabinMaskAutoRelease();
    expect(release.update(15000, true)).toBe(true);
    expect(release.update(null, true)).toBe(false);
    expect(release.update(15000, true)).toBe(false);
  });

  it('reads the first valid CPCS cabin altitude (B1 to B4)', () => {
    const words: Record<string, Arinc429Register> = {
      'L:A32NX_PRESS_CABIN_ALTITUDE_B1': Arinc429Register.empty(),
      'L:A32NX_PRESS_CABIN_ALTITUDE_B2': Arinc429Register.empty(),
      'L:A32NX_PRESS_CABIN_ALTITUDE_B3': Arinc429Register.empty(),
      'L:A32NX_PRESS_CABIN_ALTITUDE_B4': Arinc429Register.empty(),
    };
    words['L:A32NX_PRESS_CABIN_ALTITUDE_B3'].setSsm(Arinc429SignStatusMatrix.NormalOperation);
    words['L:A32NX_PRESS_CABIN_ALTITUDE_B3'].setValue(14500);
    expect(readCabinAltitudeFt((name) => words[name])).toBe(14500);
    expect(readCabinAltitudeFt(() => Arinc429Register.empty())).toBeNull();
  });

  it('is an instrument of the systems host', () => {
    const host = readFileSync(resolve(__dirname, '../SystemsHost.ts'), 'utf-8');
    expect(host).toContain("this.backplane.addInstrument('CabinOxygenMasks', this.cabinOxygenMasks);");
  });
});
