// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { highlightRanges, parseSearchQuery } from '../Pages/FltOps/Shared/DocumentSearch';

/** A found text: [start, end) in the searched text */
export type TextOccurrence = readonly [number, number];

/**
 * The SEARCH of a displayed document: every occurrence of the typed words (a word of the field counts on its own,
 * case does not matter).
 * @param text the displayed text
 * @param input the text of the search field
 * @returns the occurrences in the text, in order; none for an empty field
 */
export function findOccurrences(text: string, input: string): TextOccurrence[] {
  const query = parseSearchQuery(input);
  return query === null ? [] : highlightRanges(text, query);
}

/**
 * The < and > buttons of the search: they go round the occurrences
 * @param current the occurrence shown, null before the first step
 * @param count the number of occurrences
 * @param step -1 for <, 1 for >
 * @returns the occurrence to show next, null without any occurrence
 */
export function stepOccurrence(current: number | null, count: number, step: -1 | 1): number | null {
  if (count === 0) {
    return null;
  }
  if (current === null) {
    return step === 1 ? 0 : count - 1;
  }
  return (current + step + count) % count;
}

/**
 * @param count the number of occurrences
 * @returns the line under the search field
 */
export function occurrencesText(count: number): string {
  return count === 1 ? '1 occurrence found' : `${count} occurrences found`;
}
