// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { formatDirection, formatPressure, formatVisibility } from './weatherFormat';

describe('formatVisibility', () => {
  it('metric: metres below 5 km, kilometres above, 9999 as 10 km', () => {
    expect(formatVisibility({ metres: 2000, orMore: false }, true)).toEqual({ value: '2,000', unit: 'm' });
    expect(formatVisibility({ metres: 500, orMore: false }, true)).toEqual({ value: '500', unit: 'm' });
    expect(formatVisibility({ metres: 6000, orMore: false }, true)).toEqual({ value: '6', unit: 'km' });
    expect(formatVisibility({ metres: 10000, orMore: true }, true)).toEqual({ value: '10', unit: 'km' });
  });

  it('imperial: statute miles in quarters below 3 SM, a lower bound in whole miles', () => {
    expect(formatVisibility({ metres: 2000, orMore: false }, false)).toEqual({ value: '1 1/4', unit: 'SM' });
    expect(formatVisibility({ metres: 805, orMore: false }, false)).toEqual({ value: '1/2', unit: 'SM' });
    expect(formatVisibility({ metres: 6000, orMore: false }, false)).toEqual({ value: '4', unit: 'SM' });
    expect(formatVisibility({ metres: 10000, orMore: true }, false)).toEqual({ value: '6', unit: 'SM' });
  });
});

describe('formatPressure and formatDirection', () => {
  it('hPa in metric, inHg in imperial', () => {
    expect(formatPressure({ hpa: 1017, inHg: 1017 / 33.8639 }, true)).toEqual({ value: '1017', unit: 'hPa' });
    expect(formatPressure({ hpa: 1017, inHg: 1017 / 33.8639 }, false)).toEqual({ value: '30.03', unit: 'inHg' });
  });

  it('pads wind directions to three digits', () => {
    expect(formatDirection(40)).toBe('040');
    expect(formatDirection(7)).toBe('007');
    expect(formatDirection(320)).toBe('320');
  });
});
