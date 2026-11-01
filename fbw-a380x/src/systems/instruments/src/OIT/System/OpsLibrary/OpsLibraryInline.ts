// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SearchQuery, highlightRanges } from '../../Pages/FltOps/Shared/DocumentSearch';

/** A run of the text of a block: plain, a `code` span, and whether a searched word is in it */
export interface InlineRun {
  readonly text: string;
  readonly code: boolean;
  readonly hit: boolean;
}

/**
 * The runs of a block text: `code` spans between backticks, and the searched words marked.
 * @param text the text of a block
 * @param query the search whose words are marked, null for none
 * @returns the runs, in order
 */
export function inlineRuns(text: string, query: SearchQuery | null): InlineRun[] {
  const runs: InlineRun[] = [];
  text.split('`').forEach((part, index) => {
    if (part === '') {
      return;
    }
    // An odd part is between two backticks: a text without closing backtick is plain
    const code = index % 2 === 1 && index < text.split('`').length - 1;
    const ranges = query !== null ? highlightRanges(part, query) : [];
    let from = 0;
    for (const [start, end] of ranges) {
      if (start > from) {
        runs.push({ text: part.substring(from, start), code, hit: false });
      }
      runs.push({ text: part.substring(start, end), code, hit: true });
      from = end;
    }
    if (from < part.length) {
      runs.push({ text: part.substring(from), code, hit: false });
    }
  });
  return runs;
}
