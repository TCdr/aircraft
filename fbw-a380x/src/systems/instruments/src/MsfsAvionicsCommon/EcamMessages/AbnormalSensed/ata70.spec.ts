// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures } from '..';

const LDG_DIST_LINE = 'LDG DIST IMPACT ON WET/CONTAM RWY ONLY';

function itemNames(code: number): string[] {
  return EcamAbnormalProcedures[code].items.map((item) => item.name);
}

describe('ENG SHUT DOWN landing distance line', () => {
  it('is on the inner engines (2 and 3) with the procedure text', () => {
    expect(itemNames(701800110)).toContain(LDG_DIST_LINE);
    expect(itemNames(701800111)).toContain(LDG_DIST_LINE);
  });

  it('is not on the outer engines (1 and 4)', () => {
    expect(EcamAbnormalProcedures[701800109].title).toContain('ENG 1');
    expect(itemNames(701800109)).not.toContain(LDG_DIST_LINE);
    expect(itemNames(701800112)).not.toContain(LDG_DIST_LINE);
  });
});
