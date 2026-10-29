// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Design choice: more hits than this ask the crew to confirm before the results are listed */
export const SEARCH_HIT_WARNING_LIMIT = 50;

/** A word or a "quoted phrase" of a word search */
export interface SearchTerm {
  /** Lower case */
  readonly text: string;
  readonly phrase: boolean;
}

/** A word search: a unit matches when all the terms of one group are in it (groups = alternatives, "or") */
export interface SearchQuery {
  readonly groups: readonly (readonly SearchTerm[])[];
}

/** A unit of the searched documents */
export interface SearchableEntry {
  /** The unit id */
  readonly id: string;
  /** The document the unit belongs to, the results are listed under it */
  readonly group: string;
  readonly title: string;
  /** Where the unit is, shown with its title in the results (not searched) */
  readonly context?: string;
  readonly text: string;
}

export interface SearchHit {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly context?: string;
}

export interface SearchResult {
  readonly hits: readonly SearchHit[];
  /** More hits than SEARCH_HIT_WARNING_LIMIT */
  readonly tooMany: boolean;
}

/**
 * The words of a search. Without an operator the words are alternatives ("at least one of the words"); "and" binds
 * the words around it and goes before "or"; a phrase in quotes is one term.
 * @param input the text of the search field
 * @returns the query, null when the field holds no word
 */
export function parseSearchQuery(input: string): SearchQuery | null {
  const groups: SearchTerm[][] = [];
  let current: SearchTerm[] = [];
  let joinWithPrevious = false;
  const tokens = /"([^"]*)"|(\S+)/g;
  let match = tokens.exec(input);
  while (match !== null) {
    const quoted = match[1] !== undefined;
    const text = (quoted ? match[1] : match[2]).trim().toLowerCase();
    const operator = !quoted && (text === 'and' || text === 'or') ? text : null;
    if (operator === 'and') {
      joinWithPrevious = current.length > 0;
    } else if (operator === 'or') {
      joinWithPrevious = false;
    } else if (text !== '') {
      if (!joinWithPrevious && current.length > 0) {
        groups.push(current);
        current = [];
      }
      current.push({ text, phrase: quoted });
      joinWithPrevious = false;
    }
    match = tokens.exec(input);
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups.length > 0 ? { groups } : null;
}

/** The searched units, lower-cased once for the searches */
export class DocumentSearchIndex {
  private readonly haystacks: string[];

  constructor(private readonly entries: readonly SearchableEntry[]) {
    this.haystacks = entries.map((entry) => `${entry.title}\n${entry.text}`.toLowerCase());
  }

  /**
   * @param query the parsed word search
   * @returns the units that match, in the order of the entries
   */
  public search(query: SearchQuery): SearchResult {
    const hits: SearchHit[] = [];
    this.entries.forEach((entry, index) => {
      const haystack = this.haystacks[index];
      if (query.groups.some((group) => group.every((term) => haystack.indexOf(term.text) >= 0))) {
        hits.push({ id: entry.id, group: entry.group, title: entry.title, context: entry.context });
      }
    });
    return { hits, tooMany: hits.length > SEARCH_HIT_WARNING_LIMIT };
  }
}

/**
 * @param hits the hits of a search
 * @returns the hits by document, in the order the documents first appear
 */
export function groupHitsByDocument(hits: readonly SearchHit[]): { group: string; hits: SearchHit[] }[] {
  const groups: { group: string; hits: SearchHit[] }[] = [];
  for (const hit of hits) {
    let entry = groups.find((g) => g.group === hit.group);
    if (entry === undefined) {
      entry = { group: hit.group, hits: [] };
      groups.push(entry);
    }
    entry.hits.push(hit);
  }
  return groups;
}

/**
 * The parts of a text to highlight in the displayed unit.
 * @param text the displayed text
 * @param query the search that found the unit
 * @returns [start, end) ranges, sorted, not overlapping
 */
export function highlightRanges(text: string, query: SearchQuery): [number, number][] {
  const lower = text.toLowerCase();
  const found: [number, number][] = [];
  for (const group of query.groups) {
    for (const term of group) {
      let from = lower.indexOf(term.text);
      while (from >= 0) {
        found.push([from, from + term.text.length]);
        from = lower.indexOf(term.text, from + term.text.length);
      }
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}
