// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { apuEgtRedArc } from './ApuEgtRedArc';

const upperScale = { minValue: 400, maxValue: 950, startAngle: 310, endAngle: 122 };

describe('APU EGT red arc', () => {
  it('starts where the needle points at a 900 degC running limit', () => {
    const arc = apuEgtRedArc(900, upperScale);

    expect(arc.visible).toBe(true);
    // The needle maps 400..950 clockwise from 310 to 122 (172 degrees): 310 + 500 / 550 * 172 - 360.
    expect(arc.startAngle).toBeCloseTo(106.36, 2);
  });

  it('stays a short arc before the gauge end, not a full circle', () => {
    const arc = apuEgtRedArc(900, upperScale);
    const clockwiseLengthToEnd = (upperScale.endAngle - arc.startAngle + 360) % 360;

    expect(clockwiseLengthToEnd).toBeLessThan(20);
  });

  it('is hidden when the in-flight start limit (982 degC) is above the scale', () => {
    expect(apuEgtRedArc(982, upperScale).visible).toBe(false);
  });

  it('is hidden at a 1280 degC start limit and never starts past the gauge end', () => {
    const arc = apuEgtRedArc(1280, upperScale);

    expect(arc.visible).toBe(false);
    expect(arc.startAngle).toBeCloseTo(upperScale.endAngle, 6);
  });

  it('starts at 400 degC for a limit below the upper scale', () => {
    expect(apuEgtRedArc(300, upperScale).startAngle).toBeCloseTo(310, 6);
  });
});
