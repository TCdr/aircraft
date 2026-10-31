// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LoadsheetResults } from './Loadsheet';
import { CG_ENVELOPES, LANDING_ENVELOPE, TAKEOFF_ENVELOPE, ZERO_FUEL_ENVELOPE } from './CgEnvelopes';
import { CG_DIAGRAM_SIZE, SMALL_CG_DIAGRAM_SIZE } from '../../Pages/FltOps/Performance/LoadsheetLayout';
import {
  LABEL_HEIGHT,
  LABEL_WIDTH,
  POINT_RADIUS,
  boxesOverlap,
  cgDiagramPoints,
  cgToX,
  diagramFrame,
  envelopeNameBox,
  envelopeNamePosition,
  envelopePolygon,
  labelBox,
  loadingPathPoints,
  placeLabels,
  weightToY,
} from './CgDiagram';

const SIZE = { width: 400, height: 300, marginLeft: 40, marginBottom: 30, marginTop: 10, marginRight: 10 };

describe('CG diagram', () => {
  it('puts a larger CG to the right and a heavier weight higher', () => {
    expect(cgToX(SIZE, 40)).toBeGreaterThan(cgToX(SIZE, 30));
    expect(weightToY(SIZE, 500_000)).toBeLessThan(weightToY(SIZE, 300_000));
  });

  it('draws every vertex of an envelope, so the sloped edges and the weight limit stay in shape', () => {
    const points = envelopePolygon(SIZE, LANDING_ENVELOPE)
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
    expect(points).toHaveLength(LANDING_ENVELOPE.vertices.length);
    LANDING_ENVELOPE.vertices.forEach(([cg, weight], i) => {
      expect(points[i][0]).toBeCloseTo(cgToX(SIZE, cg), 0);
      expect(points[i][1]).toBeCloseTo(weightToY(SIZE, weight), 0);
    });
  });

  it('puts the name of each envelope in its upper aft corner, one line apart for the ZF and LDG limits', () => {
    const takeoff = envelopeNamePosition(SIZE, TAKEOFF_ENVELOPE);
    const landing = envelopeNamePosition(SIZE, LANDING_ENVELOPE);
    const zeroFuel = envelopeNamePosition(SIZE, ZERO_FUEL_ENVELOPE);
    expect(takeoff.y).toBeLessThan(landing.y);
    expect(landing.y).toBeLessThan(zeroFuel.y);
    expect(zeroFuel.y - landing.y).toBeGreaterThanOrEqual(12);
    expect(landing.x).toBeCloseTo(cgToX(SIZE, 43) - 4, 5);
  });

  it('draws the loading line from the DOW through the ZFW to the TOW, leaving out the LW', () => {
    const point = (name: 'DOW' | 'ZFW' | 'TOW' | 'LW', x: number, y: number) => ({ name, x, y, outOfLimits: false });
    expect(
      loadingPathPoints([point('DOW', 10, 20), point('ZFW', 30, 40), point('TOW', 50, 60), point('LW', 70, 80)]),
    ).toBe('10.0,20.0 30.0,40.0 50.0,60.0');
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

  describe('point labels', () => {
    /**
     * Every way two labels, a label and a point, an envelope name or the frame can fail to be readable
     * @param size the drawing area
     * @param results the loadsheet results the diagram shows
     * @returns what is wrong with the labels, empty when all are readable
     */
    function problems(size: typeof SIZE, results: Partial<LoadsheetResults>): string[] {
      const points = cgDiagramPoints(size, results as LoadsheetResults);
      const labels = placeLabels(size, points).map(labelBox);
      const frame = diagramFrame(size);
      const found: string[] = [];
      labels.forEach((label, i) => {
        if (
          label.left < frame.left ||
          label.right > frame.right ||
          label.top < frame.top ||
          label.bottom > frame.bottom
        ) {
          found.push(`${points[i].name} label leaves the frame`);
        }
        labels.forEach((other, j) => {
          if (j > i && boxesOverlap(label, other)) {
            found.push(`${points[i].name} label overlaps the ${points[j].name} label`);
          }
        });
        CG_ENVELOPES.forEach((envelope) => {
          if (boxesOverlap(label, envelopeNameBox(size, envelope))) {
            found.push(`${points[i].name} label covers the ${envelope.name} name`);
          }
        });
        points.forEach((point, j) => {
          const pointBox = {
            left: point.x - POINT_RADIUS,
            top: point.y - POINT_RADIUS,
            right: point.x + POINT_RADIUS,
            bottom: point.y + POINT_RADIUS,
          };
          if (j !== i && boxesOverlap(label, pointBox)) {
            found.push(`${points[i].name} label covers the ${point.name} point`);
          }
        });
      });
      return found;
    }

    // The sim screenshot of the MORE panel: TOW 395.5 t at 29.6 %, LW 390.5 t at 29.4 %, ZFW 360 t at 28.0 %
    const screenshot = {
      dow: 285_000,
      docg: 28,
      zfw: 360_000,
      zfcg: 28,
      tow: 395_500,
      towCg: 29.6,
      lw: 390_500,
      lwCg: 29.4,
    };

    it('keeps the TOW, LW and ZFW labels of the sim screenshot apart in the MORE and the RESULTS diagram', () => {
      expect(problems(CG_DIAGRAM_SIZE, screenshot)).toEqual([]);
      expect(problems(SMALL_CG_DIAGRAM_SIZE, screenshot)).toEqual([]);
    });

    it('keeps the labels of points that coincide apart (empty aircraft: DOW = ZFW, TOW = LW)', () => {
      const empty = { dow: 300_000, docg: 36, zfw: 300_000, zfcg: 36, tow: 300_000, towCg: 36, lw: 300_000, lwCg: 36 };
      expect(problems(CG_DIAGRAM_SIZE, empty)).toEqual([]);
      expect(problems(SMALL_CG_DIAGRAM_SIZE, empty)).toEqual([]);
    });

    it('keeps a label inside the frame for points at the aft edge, the bottom and the forward edge', () => {
      const aft = {
        dow: 260_000,
        docg: 25.5,
        zfw: 400_000,
        zfcg: 46.5,
        tow: 570_000,
        towCg: 46.5,
        lw: 420_000,
        lwCg: 46,
      };
      const bottom = { dow: 252_000, docg: 30, zfw: 252_000, zfcg: 30, tow: 252_000, towCg: 30, lw: 252_000, lwCg: 30 };
      const forward = {
        dow: 252_000,
        docg: 25,
        zfw: 252_000,
        zfcg: 25,
        tow: 253_000,
        towCg: 25,
        lw: 300_000,
        lwCg: 25,
      };
      for (const results of [aft, bottom, forward]) {
        expect(problems(CG_DIAGRAM_SIZE, results)).toEqual([]);
        expect(problems(SMALL_CG_DIAGRAM_SIZE, results)).toEqual([]);
      }
    });

    it('does not put a label over the name of an envelope', () => {
      const corner = {
        dow: 280_000,
        docg: 30,
        zfw: 500_000,
        zfcg: 42,
        tow: 510_000,
        towCg: 42.5,
        lw: 400_000,
        lwCg: 40,
      };
      expect(problems(CG_DIAGRAM_SIZE, corner)).toEqual([]);
    });

    it('gives a label a line and a width that hold a 14 px name in a sim font 15 % wider', () => {
      const labelFontSize = 14;
      const simFontFactor = 1.15;
      const lineHeightFactor = 1.1;
      const averageCapitalWidthFactor = 0.8;
      const nameLength = 3;
      expect(LABEL_HEIGHT).toBeGreaterThanOrEqual(Math.ceil(labelFontSize * simFontFactor * lineHeightFactor));
      expect(LABEL_WIDTH).toBeGreaterThanOrEqual(
        nameLength * labelFontSize * averageCapitalWidthFactor * simFontFactor + 4,
      );
    });

    it('puts a label level with its point on the right when nothing is near', () => {
      const point = (name: 'DOW' | 'ZFW', x: number, y: number) => ({ name, x, y, outOfLimits: false });
      expect(placeLabels(SIZE, [point('DOW', 200, 150)])[0]).toEqual({ x: 208, y: 154, anchor: 'start' });
    });
  });
});
