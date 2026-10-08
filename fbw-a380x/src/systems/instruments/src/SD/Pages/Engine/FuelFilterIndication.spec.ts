// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { fuelFilterCloggedShown } from './FuelFilterIndication';

/* A380 FCOM DSC-70-90 FUEL FLOW, a380_fcom.txt l.113330-113332 */
describe('A380X SD ENGINE fuel filter CLOGGED', () => {
  it('shows CLOGGED with a clogged filter on a running engine', () => {
    expect(fuelFilterCloggedShown(true, 1)).toBe(true);
  });

  it('does not show CLOGGED on an engine that is not running, nor without the failure', () => {
    expect(fuelFilterCloggedShown(true, 0)).toBe(false);
    expect(fuelFilterCloggedShown(true, 2)).toBe(false);
    expect(fuelFilterCloggedShown(false, 1)).toBe(false);
  });

  it('draws CLOGGED in amber below the fuel flow, from the fuel filter failure', () => {
    const column = readFileSync(resolve(__dirname, 'elements/EngineColumn.tsx'), 'utf-8');
    expect(column).toContain('useSimVar(`L:A32NX_ENGINE_${engine}_FUEL_FILTER_CLOGGED`');
    expect(column).toMatch(
      /fadecPowered && fuelFilterCloggedShown\(!!fuelFilterClogged, engineState\) && \(\s*<text[^>]*className="Amber MiddleAlign F22">\s*CLOGGED/,
    );
  });
});
