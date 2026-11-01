// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The fixed pixel sizes of the LOADSHEET result blocks. The sim lays the blocks out with its own font and no flex
 * shrinking to rely on, so every block has a width of its own and the sum has to fit the panel with room to spare.
 */

import { CgDiagramSize } from '../../../System/Performance/CgDiagram';

export interface ResultLineWidths {
  readonly label: number;
  readonly weight: number;
  readonly cg: number;
}

/**
 * The inner width of a full-width panel the MORE blocks are sized for: the harness panel on the 1333 px screen is 1297 px
 * inside its border, and the sim panel was once measured as narrow as 1200 px
 */
export const NARROWEST_PANEL_INNER_WIDTH = 1200;

/** The share of the panel the blocks may take: the rest absorbs a sim font wider than the harness one */
export const PANEL_FILL_LIMIT = 0.87;

/** The two units of a result line (the T after the weight, the % after the CG) with their padding, measured, pixels */
export const RESULT_UNITS_WIDTH = 41;

/** The side padding of a result line row (4 px each side) */
export const RESULT_ROW_PADDING = 8;

/** The big diagram of the MORE panel */
export const CG_DIAGRAM_SIZE: CgDiagramSize = {
  width: 340,
  height: 340,
  marginLeft: 44,
  marginBottom: 40,
  marginTop: 14,
  marginRight: 14,
};

/** The small CG diagram of the RESULTS panel: it sits beside the result lines */
export const SMALL_CG_DIAGRAM_SIZE: CgDiagramSize = { ...CG_DIAGRAM_SIZE, width: 280, height: 280 };

/** The RESULTS panel lines are narrower than the MORE ones to leave room for the diagram beside them */
export const RESULTS_LINE_WIDTHS: ResultLineWidths = { label: 150, weight: 110, cg: 80 };
export const MORE_LINE_WIDTHS: ResultLineWidths = { label: 155, weight: 110, cg: 90 };

/**
 * The inner width of the RESULTS panel measured in the harness on the 1333 px screen. The RESULTS panel was not changed:
 * it fitted in the sim, so its check uses this width and not the narrowest one.
 */
export const RESULTS_PANEL_INNER_WIDTH = 699;

/** The result lines column of the RESULTS panel, without its 10 px side padding */
export const RESULTS_COLUMN_WIDTH = 390;

/** The side padding of the columns that hold the result lines, both sides together */
export const RESULTS_COLUMN_PADDING = 20;

/** The result lines column of the MORE panel, with its padding */
export const MORE_RESULTS_COLUMN_WIDTH = 430;

/** The advice text column of the MORE panel, with its 10 px side padding; the text wraps inside it */
export const MORE_ADVICE_COLUMN_WIDTH = 270;
export const MORE_ADVICE_PADDING = 20;

/**
 * @param widths the widths of the three value fields of a result line
 * @returns the width one result line takes: its fields, its two units and the padding of its row
 */
export function resultLineWidth(widths: ResultLineWidths): number {
  return widths.label + widths.weight + widths.cg + RESULT_UNITS_WIDTH + RESULT_ROW_PADDING;
}

/** @returns the width the result lines column and the diagram of the RESULTS panel take together */
export function resultsRowWidth(): number {
  return RESULTS_COLUMN_PADDING + RESULTS_COLUMN_WIDTH + SMALL_CG_DIAGRAM_SIZE.width;
}

/** @returns the width the three blocks of the MORE panel take together */
export function moreRowWidth(): number {
  return MORE_RESULTS_COLUMN_WIDTH + MORE_ADVICE_COLUMN_WIDTH + CG_DIAGRAM_SIZE.width;
}
