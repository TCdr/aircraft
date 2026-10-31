// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  CG_DIAGRAM_SIZE,
  MORE_ADVICE_COLUMN_WIDTH,
  MORE_ADVICE_PADDING,
  MORE_LINE_WIDTHS,
  MORE_RESULTS_COLUMN_WIDTH,
  NARROWEST_PANEL_INNER_WIDTH,
  PANEL_FILL_LIMIT,
  RESULTS_COLUMN_PADDING,
  RESULTS_COLUMN_WIDTH,
  RESULTS_LINE_WIDTHS,
  RESULTS_PANEL_INNER_WIDTH,
  SMALL_CG_DIAGRAM_SIZE,
  moreRowWidth,
  resultLineWidth,
  resultsRowWidth,
} from './LoadsheetLayout';

describe('LOADSHEET result block sizes', () => {
  it('fits the three blocks of the MORE panel in the narrowest panel with room for a wider sim font', () => {
    expect(moreRowWidth()).toBeLessThanOrEqual(NARROWEST_PANEL_INNER_WIDTH * PANEL_FILL_LIMIT);
  });

  it('keeps a result line inside its column, so no value shrinks or spills into the advice text', () => {
    expect(resultLineWidth(MORE_LINE_WIDTHS)).toBeLessThanOrEqual(MORE_RESULTS_COLUMN_WIDTH - RESULTS_COLUMN_PADDING);
    expect(resultLineWidth(RESULTS_LINE_WIDTHS)).toBeLessThanOrEqual(RESULTS_COLUMN_WIDTH);
  });

  it('keeps the advice column wide enough for its longest word, and the big diagram bigger than the small one', () => {
    // "operational" at 20 px, in a sim font 15 % wider
    const longestAdviceWordWidth = 130;
    expect(MORE_ADVICE_COLUMN_WIDTH - MORE_ADVICE_PADDING).toBeGreaterThanOrEqual(longestAdviceWordWidth);
    expect(CG_DIAGRAM_SIZE.width).toBeGreaterThan(SMALL_CG_DIAGRAM_SIZE.width);
    expect(CG_DIAGRAM_SIZE.height).toBeGreaterThan(SMALL_CG_DIAGRAM_SIZE.height);
  });

  it('fits the result lines and the small diagram of the RESULTS panel in its panel', () => {
    expect(resultsRowWidth()).toBeLessThanOrEqual(RESULTS_PANEL_INNER_WIDTH);
  });
});
