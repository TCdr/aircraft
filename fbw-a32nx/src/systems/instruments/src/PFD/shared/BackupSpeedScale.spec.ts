// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { backupScaleSimVars, backupSpeedScaleLayout } from './BackupSpeedScale';

describe('A32NX PFD backup speed scale', () => {
  it('orders the areas red FAST, amber FAST, green, amber SLOW, red SLOW from the top for every configuration', () => {
    for (let config = 0; config <= 5; config++) {
      const { areaEnds } = backupSpeedScaleLayout(config);
      const edges = [0, ...areaEnds, 1];
      for (let i = 1; i < edges.length; i++) {
        expect(edges[i], `configuration ${config} area ${i}`).toBeGreaterThan(edges[i - 1]);
      }
    }
  });

  it('puts the target in the green area, near its slow end', () => {
    for (let config = 0; config <= 5; config++) {
      const { areaEnds, target } = backupSpeedScaleLayout(config);
      expect(target).toBeGreaterThan(areaEnds[1]);
      expect(target).toBeLessThan(areaEnds[2]);
    }
  });

  it('moves down as the angle of attack grows, and stays on the bar', () => {
    const { positionOf } = backupSpeedScaleLayout(0);
    expect(positionOf(2)).toBeLessThan(positionOf(5));
    expect(positionOf(5)).toBeLessThan(positionOf(8));
    expect(positionOf(-30)).toBe(0);
    expect(positionOf(40)).toBe(1);
  });

  it('shows the alpha max of the configuration as the start of red SLOW', () => {
    expect(backupSpeedScaleLayout(0).positionOf(8.7)).toBeCloseTo(backupSpeedScaleLayout(0).areaEnds[3], 6);
    expect(backupSpeedScaleLayout(3).positionOf(14.2)).toBeCloseTo(backupSpeedScaleLayout(3).areaEnds[3], 6);
  });

  it('shows a lower angle of attack as on the target in clean configuration than with flaps', () => {
    const clean = backupSpeedScaleLayout(0);
    const flaps = backupSpeedScaleLayout(4);
    expect(clean.positionOf(6)).toBeGreaterThan(clean.target);
    expect(flaps.positionOf(6)).toBeLessThan(flaps.target);
  });

  it('sets the target of the approach configurations higher in speed (nearer the top) than VLS', () => {
    const conf2 = backupSpeedScaleLayout(3);
    const conf3 = backupSpeedScaleLayout(4);
    const alphaOfTarget = (layout: ReturnType<typeof backupSpeedScaleLayout>) => {
      // the angle of attack that gives the target position
      let low = -10;
      let high = 30;
      for (let i = 0; i < 60; i++) {
        const mid = (low + high) / 2;
        if (layout.positionOf(mid) < layout.target) low = mid;
        else high = mid;
      }
      return (low + high) / 2;
    };
    const vlsRatio = 1.23;
    const alphaVls3 = -4.27 + (13.1 + 4.27) / (vlsRatio * vlsRatio);
    expect(alphaOfTarget(conf3)).toBeLessThan(alphaVls3);
    expect(alphaOfTarget(conf2)).toBeCloseTo(-4.72 + (14.2 + 4.72) / (vlsRatio * vlsRatio), 3);
  });

  it('reads the pb and the GPS of the side of the PFD', () => {
    expect(backupScaleSimVars(1).map(([, d]) => d.name)).toEqual([
      'L:A32NX_EFIS_L_BKUP_SPD_ALT_PB_IS_ON',
      'L:A32NX_GPS_1_ALTITUDE',
    ]);
    expect(backupScaleSimVars(2).map(([, d]) => d.name)).toEqual([
      'L:A32NX_EFIS_R_BKUP_SPD_ALT_PB_IS_ON',
      'L:A32NX_GPS_2_ALTITUDE',
    ]);
  });
});
