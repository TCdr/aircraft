// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { a320EngineOut, A320EngineOutInputs } from './A320EngineOut';

const inputs = (overrides: Partial<A320EngineOutInputs> = {}): A320EngineOutInputs => ({
  grossWeight: 65,
  isaDeviation: 0,
  tropopause: 36_090,
  engineOutRecMaxFlightLevel: 192,
  costIndexOverwrite: null,
  ...overrides,
});

describe('a320EngineOut', () => {
  it('takes the EO REC MAX of the PROG page as EO MAX', () => {
    const { profile } = a320EngineOut(inputs(), 350);
    expect(profile.maximumAltitude).toBe(19_200);
    expect(profile.driftDownAltitude).toBeGreaterThanOrEqual(19_200);
  });

  it('cruises at the CRZ FL when that is below EO MAX', () => {
    const lower = a320EngineOut(inputs(), 120).speeds;
    const atMax = a320EngineOut(inputs(), 350).speeds;
    expect(lower.cruiseMach).not.toBe(atMax.cruiseMach);
  });

  it('flies a faster cruise with a cost index entered over EO LRC', () => {
    const lrc = a320EngineOut(inputs(), 120).speeds;
    const economic = a320EngineOut(inputs({ costIndexOverwrite: 150 }), 120).speeds;
    expect(economic.cruiseMach).toBeGreaterThan(lrc.cruiseMach);
  });
});
