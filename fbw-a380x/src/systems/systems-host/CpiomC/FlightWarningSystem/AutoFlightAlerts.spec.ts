// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isApproachCapabilityDowngradedByRa } from './AutoFlightAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

describe('AUTO FLT APPROACH CAPABILITY DOWNGRADED', () => {
  it('"The RA B is failed", not with a second RA failed (NAV RA SYS dual faults)', () => {
    expect(isApproachCapabilityDowngradedByRa(false, true, false)).toBe(true);
    expect(isApproachCapabilityDowngradedByRa(false, false, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(true, false, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(true, true, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(false, true, true)).toBe(false);
  });

  it('is wired: phases 2, 8, 9, master caution, CAT 3 DUAL inop and CAT 3 SINGLE ONLY', () => {
    const start = abnormalSensed.indexOf('    220800006: {');
    expect(start).toBeGreaterThan(0);
    const block = abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
    expect(block).toContain('flightPhaseInhib: [1, 3, 4, 5, 6, 7, 10, 11, 12],');
    expect(block).toContain('isApproachCapabilityDowngradedByRa(raAFailed, raBFailed, raCFailed)');
    expect(block).toContain('failure: 2,');
    expect(block).toContain("inopSysApprLdg: () => ['220300028'],");
    expect(block).toContain("info: () => ['220200016'],");
  });
});
