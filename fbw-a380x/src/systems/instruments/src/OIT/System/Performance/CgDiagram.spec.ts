// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LoadsheetResults } from './Loadsheet';
import { cgDiagramPoints, placeLabels, cgToX, envelopePolygon, weightToY } from './CgDiagram';

const SIZE = { width: 400, height: 300, marginLeft: 40, marginBottom: 30, marginTop: 10, marginRight: 10 };

// A simple envelope: 30 to 40 % MAC at any weight
const withinLimits = (cg: number) => cg >= 30 && cg <= 40;

describe('CG diagram', () => {
  it('puts a larger CG to the right and a heavier weight higher', () => {
    expect(cgToX(SIZE, 40)).toBeGreaterThan(cgToX(SIZE, 30));
    expect(weightToY(SIZE, 500_000)).toBeLessThan(weightToY(SIZE, 300_000));
  });

  it('draws the envelope between its forward and aft limits', () => {
    const points = envelopePolygon(SIZE, withinLimits)
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
    const xs = points.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(cgToX(SIZE, 30), 0);
    expect(Math.max(...xs)).toBeCloseTo(cgToX(SIZE, 40), 0);
  });

  it('places the four points and marks the ones out of their limits', () => {
    const results = {
      dow: 280_000,
      docg: 33,
      zfw: 380_000,
      zfcg: 31,
      tow: 520_000,
      towCg: 41,
      lw: 400_000,
      lwCg: 34,
      zfwOutOfLimits: false,
      towOutOfLimits: true,
      lwOutOfLimits: false,
    } as LoadsheetResults;
    const points = cgDiagramPoints(SIZE, results);
    expect(points.map((p) => p.name)).toEqual(['DOW', 'ZFW', 'TOW', 'LW']);
    expect(points.map((p) => p.outOfLimits)).toEqual([false, false, true, false]);
    expect(points[2].x).toBeCloseTo(cgToX(SIZE, 41), 5);
    expect(points[2].y).toBeCloseTo(weightToY(SIZE, 520_000), 5);
  });

  it('moves the label of a point that coincides with another one down, so both stay readable', () => {
    const point = (name: 'DOW' | 'ZFW', x: number, y: number) => ({ name, x, y, outOfLimits: false });
    const labels = placeLabels([point('DOW', 100, 100), point('ZFW', 100, 100)]);
    expect(labels[0]).toEqual({ x: 108, y: 104 });
    expect(labels[1].x).toBe(108);
    expect(labels[1].y).toBeGreaterThanOrEqual(104 + 15);
  });

  it('keeps the label of a point that is far from the others beside its point', () => {
    const point = (name: 'DOW' | 'ZFW', x: number, y: number) => ({ name, x, y, outOfLimits: false });
    expect(placeLabels([point('DOW', 100, 100), point('ZFW', 100, 200)])[1]).toEqual({ x: 108, y: 204 });
  });
});
