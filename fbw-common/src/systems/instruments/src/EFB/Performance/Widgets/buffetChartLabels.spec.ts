// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { clearLabelIndex } from './buffetChartLabels';

// a line climbing up the chart: y 500 at the bottom to 100 at the top, one point every 50
const YS = [500, 450, 400, 350, 300, 250, 200, 150, 100];

describe('clearLabelIndex', () => {
  it('keeps the preferred point when it is clear of the band', () => {
    expect(clearLabelIndex(YS, 4, 100, 18)).toBe(4);
  });

  it('moves the label down the line, off the band', () => {
    // the preferred point (y 300) is on the band at y 305: the next one down (y 350) is clear
    expect(clearLabelIndex(YS, 4, 305, 18)).toBe(3);
  });

  it('moves it up when nothing below is clear', () => {
    expect(clearLabelIndex([500, 490, 480, 300], 1, 495, 18)).toBe(3);
  });

  it('keeps the preferred point when no point is clear', () => {
    expect(clearLabelIndex([300, 302, 305], 1, 303, 18)).toBe(1);
  });
});
