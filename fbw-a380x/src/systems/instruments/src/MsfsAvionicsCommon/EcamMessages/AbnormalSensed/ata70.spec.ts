// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/* The source text: importing the EcamMessages tables in a test fails on a circular import (FwsCdsDuFault.spec.ts) */
const source = readFileSync(resolve(__dirname, 'ata70.ts'), 'utf8');

const LDG_DIST_LINE = "name: 'LDG DIST IMPACT ON WET/CONTAM RWY ONLY'";

/** The source of one procedure, from its key to the next 7018001xx key */
function procedureSource(code: number): string {
  const start = source.indexOf(`  ${code}: {`);
  const next = source.indexOf('\n  7018001', start + 10);
  return source.slice(start, next < 0 ? undefined : next);
}

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) SHUT DOWN (a380_fcom.txt l.172738-172741): "If inner engine affected:
 * LDG DIST IMPACT ON WET/CONTAM RWY ONLY" */
describe('ENG SHUT DOWN landing distance line', () => {
  it('is on the inner engines (2 and 3) with the FCOM text', () => {
    expect(procedureSource(701800110)).toContain(LDG_DIST_LINE);
    expect(procedureSource(701800111)).toContain(LDG_DIST_LINE);
  });

  it('is not on the outer engines (1 and 4)', () => {
    expect(procedureSource(701800109)).toContain('ENG 1');
    expect(procedureSource(701800109)).not.toContain(LDG_DIST_LINE);
    expect(procedureSource(701800112)).not.toContain(LDG_DIST_LINE);
  });
});
