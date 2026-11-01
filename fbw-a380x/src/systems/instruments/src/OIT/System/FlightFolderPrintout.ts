// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The documents of the FLT FOLDER that are printouts: the stored performance pages and the back-up OFP. They are laid
 * out in space aligned columns for a fixed width printer font, so the text pane shows them in a monospaced font that
 * has the degree sign the printouts use.
 */

/** The width of a character of the monospaced font of the pane, as a fraction of its font size (JetBrains Mono) */
const MONOSPACE_ADVANCE_EM = 0.6;

/** The largest font size of a printout, px */
const LARGEST_FONT_PX = 18;

/** The smallest font size at which a printout is still fitted to the width, px; below it the lines wrap */
const SMALLEST_FIT_FONT_PX = 12;

/** The line height of a printout, as a fraction of its font size */
export const PRINTOUT_LINE_HEIGHT_EM = 1.35;

/** The width the lines of a printout have in the text pane: the pane without its padding and its scroll bar, px */
const PRINTOUT_LINE_WIDTH_PX = 880;

/** How a printout is drawn in the text pane */
export interface PrintoutLayout {
  readonly fontSizePx: number;
  /** Whether a line wraps: only when even the smallest font does not fit the longest line */
  readonly wrap: boolean;
}

/**
 * @param documentId the id of a document of the folder
 * @returns whether it is a printout: a stored performance page or the back-up OFP
 */
export function isPrintoutDocument(documentId: string | null): boolean {
  return documentId !== null && (documentId.startsWith('performance/') || documentId.startsWith('ofp/'));
}

/**
 * @param text the text of a printout
 * @param lineWidthPx the width the lines have
 * @returns the font size at which its longest line fits the width, and whether the lines wrap when it does not
 */
export function printoutLayout(text: string, lineWidthPx: number = PRINTOUT_LINE_WIDTH_PX): PrintoutLayout {
  const longest = text.split('\n').reduce((most, line) => Math.max(most, line.length), 1);
  const fitting = Math.floor(lineWidthPx / (longest * MONOSPACE_ADVANCE_EM));
  if (fitting >= SMALLEST_FIT_FONT_PX) {
    return { fontSizePx: Math.min(LARGEST_FONT_PX, fitting), wrap: false };
  }
  return { fontSizePx: SMALLEST_FIT_FONT_PX, wrap: true };
}
