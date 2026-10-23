// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { AtaChapterNumber } from '@flybywiresim/fbw-sdk-react';

/** What the right pane of the Failures page shows: the active failures, the search results, or one ATA chapter */
export type FailuresSelection = 'active' | 'results' | AtaChapterNumber;

interface FailureLike {
  ata: AtaChapterNumber;
  identifier: number;
  name: string;
}

/**
 * Whether a failure matches the search: its name, its identifier or its chapter title contains the query.
 * @param query the search text, already upper case (the search field stores it so)
 */
export const failureMatchesSearch = (failure: FailureLike, query: string, chapterTitle: string): boolean =>
  query === '' ||
  failure.name.toUpperCase().includes(query) ||
  failure.identifier.toString().includes(query) ||
  chapterTitle.toUpperCase().includes(query);

/** The chapters of a failure list, in ATA order, with their failures in list order */
export const groupByChapter = <T extends FailureLike>(
  failures: readonly T[],
): { ata: AtaChapterNumber; failures: T[] }[] => {
  const groups: { ata: AtaChapterNumber; failures: T[] }[] = [];
  failures.forEach((failure) => {
    const group = groups.find((candidate) => candidate.ata === failure.ata);
    if (group) {
      group.failures.push(failure);
    } else {
      groups.push({ ata: failure.ata, failures: [failure] });
    }
  });
  return groups.sort((a, b) => a.ata - b.ata);
};

/**
 * The pane to show for the stored selection. While searching, a chapter without matches falls back to all the results;
 * without a search, the results fall back to the active failures when there are any, else to the first chapter.
 */
export const resolveSelection = (
  stored: FailuresSelection | null,
  searching: boolean,
  shownChapters: readonly AtaChapterNumber[],
  activeCount: number,
): FailuresSelection => {
  if (searching) {
    return typeof stored === 'number' && shownChapters.includes(stored) ? stored : 'results';
  }
  if (stored === 'active' || (typeof stored === 'number' && shownChapters.includes(stored))) {
    return stored;
  }
  return activeCount > 0 || shownChapters.length === 0 ? 'active' : shownChapters[0];
};

/** The name split around the first occurrence of the search query, to underline it; null when it does not occur */
export const splitAtQuery = (name: string, query: string): [string, string, string] | null => {
  const start = query === '' ? -1 : name.toUpperCase().indexOf(query);
  if (start === -1) {
    return null;
  }
  return [name.substring(0, start), name.substring(start, start + query.length), name.substring(start + query.length)];
};
