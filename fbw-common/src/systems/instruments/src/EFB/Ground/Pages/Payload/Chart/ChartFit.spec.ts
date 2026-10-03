// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { chartWeightToY, PAYLOAD_CHART_MIN_HEIGHT, PAYLOAD_CHART_PLOT_PAD, payloadChartFit } from './ChartFit';

describe('payload balance chart fit', () => {
  it('fills the area: chart, CG labels over it and the bottom room', () => {
    const { height, marginTop } = payloadChartFit(400);
    expect(height).toBeGreaterThan(PAYLOAD_CHART_MIN_HEIGHT);
    expect(marginTop + height).toBeLessThanOrEqual(400 - 34);
    expect(marginTop + height).toBeGreaterThan(400 - 34 - 2);
  });

  it('keeps the CG axis labels inside the margin', () => {
    const { height, marginTop } = payloadChartFit(500);
    expect(marginTop).toBeGreaterThanOrEqual(0.08 * height);
  });

  it('never shrinks the chart under its former fixed height', () => {
    expect(payloadChartFit(100).height).toBe(PAYLOAD_CHART_MIN_HEIGHT);
  });

  it('puts the lowest grid weight on the bottom of the chart and the highest on its top (A320 grid 40-80 t)', () => {
    const grid = { max: 80_000, lines: 8, scale: 5_000 };
    expect(chartWeightToY(80_000, grid, 330)).toBe(0);
    expect(chartWeightToY(40_000, grid, 330)).toBe(330 - PAYLOAD_CHART_PLOT_PAD);
    expect(chartWeightToY(60_000, grid, 330)).toBe((330 - PAYLOAD_CHART_PLOT_PAD) / 2);
  });
});
