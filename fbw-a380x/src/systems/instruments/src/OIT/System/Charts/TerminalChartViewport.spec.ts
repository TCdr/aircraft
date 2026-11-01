// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  centreView,
  clampView,
  ChartViewState,
  fitSize,
  FIT_VIEW,
  panView,
  viewLayout,
  zoomView,
  ZOOM_STEPS,
} from './TerminalChartViewport';

const VIEWER = { width: 900, height: 700 };
const PORTRAIT = { width: 600, height: 800 };
const LANDSCAPE = { width: 1200, height: 600 };

describe('fit', () => {
  it('fits a portrait page by its height', () => {
    const size = fitSize(PORTRAIT, VIEWER);
    expect(size.height).toBeCloseTo(700);
    expect(size.width).toBeCloseTo(525);
  });

  it('fits a landscape page by its width', () => {
    const size = fitSize(LANDSCAPE, VIEWER);
    expect(size.width).toBeCloseTo(900);
    expect(size.height).toBeCloseTo(450);
  });

  it('gives nothing for a page or viewer without size', () => {
    expect(fitSize({ width: 0, height: 10 }, VIEWER)).toEqual({ width: 0, height: 0 });
    expect(fitSize(PORTRAIT, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });

  it('centres the whole page in the viewer', () => {
    const layout = viewLayout(FIT_VIEW, LANDSCAPE, VIEWER);
    expect(layout.left).toBeCloseTo(0);
    expect(layout.top).toBeCloseTo(125);
    expect(layout.width).toBeCloseTo(900);
  });
});

describe('zoom', () => {
  it('enlarges the page by the zoom step', () => {
    const state = zoomView(FIT_VIEW, 1, PORTRAIT, VIEWER);
    expect(state.zoomIndex).toBe(1);
    expect(viewLayout(state, PORTRAIT, VIEWER).height).toBeCloseTo(700 * ZOOM_STEPS[1]);
  });

  it('stops at the largest and the smallest step', () => {
    let state: ChartViewState = FIT_VIEW;
    for (let i = 0; i < 10; i++) {
      state = zoomView(state, 1, PORTRAIT, VIEWER);
    }
    expect(state.zoomIndex).toBe(ZOOM_STEPS.length - 1);
    for (let i = 0; i < 10; i++) {
      state = zoomView(state, -1, PORTRAIT, VIEWER);
    }
    expect(state.zoomIndex).toBe(0);
  });

  it('keeps the centre of a zoomed page inside the page when zooming out', () => {
    const corner: ChartViewState = { zoomIndex: 4, centreX: 1, centreY: 1 };
    const out = zoomView(corner, -1, PORTRAIT, VIEWER);
    const layout = viewLayout(out, PORTRAIT, VIEWER);
    // the right and bottom edges of the page do not leave a gap in the viewer
    expect(layout.left + layout.width).toBeGreaterThanOrEqual(VIEWER.width - 0.001);
    expect(layout.top + layout.height).toBeGreaterThanOrEqual(VIEWER.height - 0.001);
  });
});

describe('pan', () => {
  const zoomed: ChartViewState = { zoomIndex: 4, centreX: 0.5, centreY: 0.5 };

  it('moves by a quarter of the viewer', () => {
    const size = viewLayout(zoomed, LANDSCAPE, VIEWER);
    const right = panView(zoomed, 'right', LANDSCAPE, VIEWER);
    const moved = viewLayout(right, LANDSCAPE, VIEWER);
    expect(size.left - moved.left).toBeCloseTo(VIEWER.width / 4);
    const down = viewLayout(panView(zoomed, 'down', LANDSCAPE, VIEWER), LANDSCAPE, VIEWER);
    expect(size.top - down.top).toBeCloseTo(VIEWER.height / 4);
  });

  it('moves the other way for left and up', () => {
    const left = panView(zoomed, 'left', LANDSCAPE, VIEWER);
    const up = panView(zoomed, 'up', LANDSCAPE, VIEWER);
    expect(left.centreX).toBeLessThan(zoomed.centreX);
    expect(up.centreY).toBeLessThan(zoomed.centreY);
  });

  it('stops at every edge of the page', () => {
    let state = zoomed;
    for (let i = 0; i < 30; i++) {
      state = panView(state, 'left', LANDSCAPE, VIEWER);
      state = panView(state, 'up', LANDSCAPE, VIEWER);
    }
    let layout = viewLayout(state, LANDSCAPE, VIEWER);
    expect(layout.left).toBeCloseTo(0);
    expect(layout.top).toBeCloseTo(0);
    for (let i = 0; i < 30; i++) {
      state = panView(state, 'right', LANDSCAPE, VIEWER);
      state = panView(state, 'down', LANDSCAPE, VIEWER);
    }
    layout = viewLayout(state, LANDSCAPE, VIEWER);
    expect(layout.left + layout.width).toBeCloseTo(VIEWER.width);
    expect(layout.top + layout.height).toBeCloseTo(VIEWER.height);
  });

  it('does not move a page that fits the viewer along that axis', () => {
    const state = panView(FIT_VIEW, 'right', PORTRAIT, VIEWER);
    expect(state.centreX).toBe(0.5);
  });
});

describe('click to centre', () => {
  it('puts the clicked point of the page at the middle of the viewer', () => {
    const zoomed: ChartViewState = { zoomIndex: 3, centreX: 0.5, centreY: 0.5 };
    const before = viewLayout(zoomed, LANDSCAPE, VIEWER);
    // a point left of the middle of the viewer
    const x = 300;
    const y = 250;
    const pagePoint = { x: (x - before.left) / before.width, y: (y - before.top) / before.height };
    const after = centreView(zoomed, x, y, LANDSCAPE, VIEWER);
    const layout = viewLayout(after, LANDSCAPE, VIEWER);
    expect(layout.left + pagePoint.x * layout.width).toBeCloseTo(VIEWER.width / 2);
    expect(layout.top + pagePoint.y * layout.height).toBeCloseTo(VIEWER.height / 2);
  });

  it('stops at the edge of the page when the clicked point is near it', () => {
    // the view is at the top left corner of the page: a click near the corner cannot be centred
    const zoomed: ChartViewState = { zoomIndex: 3, centreX: 0, centreY: 0 };
    const after = centreView(zoomed, 5, 5, LANDSCAPE, VIEWER);
    const layout = viewLayout(after, LANDSCAPE, VIEWER);
    expect(layout.left).toBeCloseTo(0);
    expect(layout.top).toBeCloseTo(0);
  });

  it('leaves a page that fits where it is', () => {
    const after = centreView(FIT_VIEW, 100, 100, PORTRAIT, VIEWER);
    expect(after.centreX).toBe(0.5);
    expect(after.centreY).toBe(0.5);
  });
});

describe('view limits', () => {
  it('keeps the zoom step in range', () => {
    expect(clampView({ zoomIndex: 99, centreX: 0.5, centreY: 0.5 }, PORTRAIT, VIEWER).zoomIndex).toBe(
      ZOOM_STEPS.length - 1,
    );
    expect(clampView({ zoomIndex: -3, centreX: 0.5, centreY: 0.5 }, PORTRAIT, VIEWER).zoomIndex).toBe(0);
  });
});
