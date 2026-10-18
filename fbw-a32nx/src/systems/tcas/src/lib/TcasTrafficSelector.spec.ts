// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isIntruderShownForTrafficSelector } from './TcasTrafficSelector';

/* THRT shows the proximate and other intruders only if a TA or RA is present, within +-2 700 ft. */
describe('TCAS TRAFFIC selector', () => {
  const thrtBand = [-2700, 2700] as const;

  it('THRT without a TA or RA hides the other intruders', () => {
    expect(isIntruderShownForTrafficSelector(true, 1000, thrtBand, false, false)).toBe(false);
  });

  it('THRT always shows the TA or RA intruder itself', () => {
    expect(isIntruderShownForTrafficSelector(true, 1000, thrtBand, true, true)).toBe(true);
  });

  it('THRT shows the proximate and other intruders while a TA or RA is present', () => {
    expect(isIntruderShownForTrafficSelector(true, -2000, thrtBand, false, true)).toBe(true);
  });

  it('THRT keeps the +-2 700 ft band during a TA or RA', () => {
    expect(isIntruderShownForTrafficSelector(true, 3000, thrtBand, false, true)).toBe(false);
  });

  it('ALL, ABV and BLW show every intruder of their band', () => {
    expect(isIntruderShownForTrafficSelector(false, 9000, [-2700, 9900], false, false)).toBe(true);
    expect(isIntruderShownForTrafficSelector(false, -9000, [-2700, 9900], false, false)).toBe(false);
  });

  it('the TCAS computer uses it with the TCAS advisory state', () => {
    const computer = readFileSync(resolve(__dirname, '../components/TcasComputer.ts'), 'utf-8');
    expect(computer).toContain('isIntruderShownForTrafficSelector(');
    expect(computer).toContain('this.advisoryState !== TcasState.NONE');
  });
});
