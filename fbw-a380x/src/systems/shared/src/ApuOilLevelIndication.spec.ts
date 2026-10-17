// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { apuOilLevelLowIndicationShown } from './ApuOilLevelIndication';

const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');

describe('APU page OIL LVL LO', () => {
  it('shows when the ECB word reports a low oil level', () => {
    expect(apuOilLevelLowIndicationShown(true, true)).toBe(true);
  });

  it('does not show with a normal oil quantity or without valid ECB data', () => {
    expect(apuOilLevelLowIndicationShown(true, false)).toBe(false);
    expect(apuOilLevelLowIndicationShown(false, true)).toBe(false);
  });

  it('pulses on the APU page from the ECB word', () => {
    const apuPage = source('../../instruments/src/SD/Pages/Apu/ApuPage.tsx');
    expect(apuPage).toContain("useArinc429Var('L:A32NX_APU_LOW_OIL_LEVEL'");
    expect(apuPage).toContain('apuOilLevelLowIndicationShown(');
    expect(apuPage).toMatch(/FillPulse[^>]*>\s*OIL LVL LO/);
  });

  it('is fed by the flyPad failure 49005 of the A380X', () => {
    const wasm = source('../../../wasm/systems/a380_systems_wasm/src/lib.rs');
    expect(wasm).toContain('(49_005, FailureType::ApuOilLevelLow),');
  });
});
