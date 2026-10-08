// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { fuelFilterClogShown } from './EngFuelFilterIndication';

/* A320 FCOM DSC-70-90-40 FUEL FILTER CLOG INDICATION, a320_fcom.txt l.64497-64499 */
describe('SD ENGINE fuel filter CLOG', () => {
  it('shows CLOG with a clogged filter on a running engine', () => {
    expect(fuelFilterClogShown(true, 1)).toBe(true);
  });

  it('does not show CLOG on an engine that is not running, nor without the failure', () => {
    expect(fuelFilterClogShown(true, 0)).toBe(false);
    expect(fuelFilterClogShown(true, 2)).toBe(false);
    expect(fuelFilterClogShown(false, 1)).toBe(false);
  });

  it('draws CLOG below the fuel used from the fuel filter failure', () => {
    const page = readFileSync(resolve(__dirname, 'Eng.tsx'), 'utf-8');
    expect(page).toContain('useSimVar(`L:A32NX_ENGINE_${engineNumber}_FUEL_FILTER_CLOGGED`');
    expect(page).toMatch(
      /\{displayedFuelUsed\}\s*<\/text>\s*\{\/\*[^*]*\*\/\}\s*<text[^>]*fuelFilterClogShown\(!!fuelFilterClogged, engineState\)[^>]*>\s*CLOG/,
    );
  });
});
