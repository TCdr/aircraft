// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { oxygenIndication } from './OxygenIndication';

/* A380 FCOM DSC-35-20-20 (cockpit) and DSC-35-30-20 (cabin) oxygen indications of the DOOR/OXY page. */
describe('SD DOOR/OXY oxygen indications', () => {
  it('are normal with CREW SUPPLY on', () => {
    expect(oxygenIndication(true, true, false)).toEqual({
      ckptAmber: false,
      ckptRegulPrLo: false,
      cabinAmber: false,
      cabinRegulPrLo: false,
    });
  });

  it('CREW SUPPLY OFF on ground: CKPT amber with REGUL PR LO, the cabin line stays normal', () => {
    expect(oxygenIndication(true, true, true)).toEqual({
      ckptAmber: true,
      ckptRegulPrLo: true,
      cabinAmber: false,
      cabinRegulPrLo: false,
    });
  });

  it('CREW SUPPLY OFF in flight: CKPT amber, REGUL PR LO only on ground', () => {
    const indication = oxygenIndication(true, false, true);
    expect(indication.ckptAmber).toBe(true);
    expect(indication.ckptRegulPrLo).toBe(false);
  });

  it('the page reads the CREW SUPPLY pb value (not the useSimVar tuple) and only for the CKPT line', () => {
    const element = readFileSync(resolve(__dirname, 'Oxygen.tsx'), 'utf-8');
    expect(element).toMatch(/const \[crewSupplyOffVar\] = useSimVar\('L:PUSH_OVHD_OXYGEN_CREW'/);
    expect(element.match(/L:PUSH_OVHD_OXYGEN_CREW/g)).toHaveLength(1);
  });
});
