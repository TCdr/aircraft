// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('SD ENG page N2', () => {
  // The oil pressure and bleed pressure indications use the N2 the FADEC shows on the E/WD. The MSFS N2 of a seized
  // engine (engine failures, a320_systems engine_failure.rs) still windmills while the FADEC shows the core stopped.
  it('reads the FADEC N2, not the MSFS N2', () => {
    const page = readFileSync(resolve(__dirname, 'Eng.tsx'), 'utf-8');
    expect(page).not.toContain('ENG N2 RPM');
    expect(page.match(/useSimVar\(`L:A32NX_ENGINE_N2:\$\{engineNumber\}`, 'number', 50\)/g)).toHaveLength(2);
  });
});

describe('SD ENG page vibrations', () => {
  // MSFS has one vibration value per engine; the systems WASM (a320_systems engine_malfunction.rs) gives N1 and N2 their own.
  it('reads separate N1 and N2 vibrations from the systems WASM', () => {
    const page = readFileSync(resolve(__dirname, 'Eng.tsx'), 'utf-8');
    expect(page).not.toContain('TURB ENG VIBRATION');
    expect(page).toContain('_N1_VIBRATION`');
    expect(page).toContain('_N2_VIBRATION`');
  });
});
