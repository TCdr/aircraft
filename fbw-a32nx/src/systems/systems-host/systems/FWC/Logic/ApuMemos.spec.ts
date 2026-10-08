// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isApuAvailMemoShown, isApuBleedMemoShown } from './ApuMemos';

/* A320 FCOM DSC-36-20 MEMO DISPLAY: "APU BLEED ... if the APU is available and the APU BLEED pb-sw is ON". */
describe('APU BLEED and APU AVAIL memos', () => {
  it('APU BLEED follows the APU BLEED pb-sw', () => {
    expect(isApuBleedMemoShown(true, true)).toBe(true);
    expect(isApuBleedMemoShown(true, false)).toBe(false);
    expect(isApuBleedMemoShown(false, true)).toBe(false);
  });

  it('APU AVAIL shows when the APU is available and APU BLEED is not selected', () => {
    expect(isApuAvailMemoShown(true, false)).toBe(true);
    expect(isApuAvailMemoShown(true, true)).toBe(false);
    expect(isApuAvailMemoShown(false, false)).toBe(false);
  });

  it('PseudoFWC reads the APU BLEED pb-sw, not the bleed valve, for both memos', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    const memo = (id: string) => {
      const start = fwc.indexOf(`    '${id}': {`);
      expect(start).toBeGreaterThan(0);
      return fwc.slice(start, fwc.indexOf('\n    },', start));
    };
    for (const id of ['0000170', '0000180']) {
      expect(memo(id)).toContain('this.apuBleedPbOn');
      expect(memo(id)).not.toContain('apuBleedValveOpen');
    }
    expect(fwc).toContain("SimVar.GetSimVarValue('L:A32NX_OVHD_APU_BLEED_PB_IS_ON', 'bool')");
  });
});
