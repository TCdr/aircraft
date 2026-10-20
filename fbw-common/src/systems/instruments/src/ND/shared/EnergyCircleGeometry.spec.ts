// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EfisNdMode } from '@flybywiresim/fbw-sdk';
import { energyCircleArcPath, energyCircleGeometry } from './EnergyCircleGeometry';

describe('ND energy circle geometry', () => {
  it('is scaled on the map range around the aircraft in ARC and ROSE NAV', () => {
    // ARC: 498 px for the range, aircraft 242 px below the centre
    expect(energyCircleGeometry(EfisNdMode.ARC, 40, 498, 80, 242)).toEqual({ centreY: 626, radiusPx: 249 });
    // ROSE NAV: 250 px for half the range, aircraft at the centre
    expect(energyCircleGeometry(EfisNdMode.ROSE_NAV, 10, 250, 20, 0)).toEqual({ centreY: 384, radiusPx: 125 });
  });

  it('is hidden in the other modes, without a distance and beyond the range', () => {
    expect(energyCircleGeometry(EfisNdMode.PLAN, 40, 498, 80, 242)).toBeNull();
    expect(energyCircleGeometry(EfisNdMode.ROSE_ILS, 10, 250, 20, 0)).toBeNull();
    expect(energyCircleGeometry(EfisNdMode.ROSE_VOR, 10, 250, 20, 0)).toBeNull();
    expect(energyCircleGeometry(EfisNdMode.ARC, 0, 498, 80, 242)).toBeNull();
    expect(energyCircleGeometry(EfisNdMode.ARC, 81, 498, 80, 242)).toBeNull();
  });

  it('draws an arc over the aircraft, symmetric about the track line', () => {
    const path = energyCircleArcPath({ centreY: 626, radiusPx: 100 });
    const [, x1, y1, , , x2, y2] = path.match(/^M([\d.]+),([\d.]+) A([\d.]+),([\d.]+) 0 0 1 ([\d.]+),([\d.]+)$/);

    expect(Number(x1) + Number(x2)).toBeCloseTo(768);
    expect(Number(y1)).toBeCloseTo(Number(y2));
    expect(Number(y1)).toBeLessThan(626);
    expect(Math.hypot(Number(x1) - 384, Number(y1) - 626)).toBeCloseTo(100);
  });
});
