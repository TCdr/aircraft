// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The message area of an ATIS request area (FCOM DSC-46-10-20-30 P 34): 44 characters on each of the four first lines,
 * 39 characters on the fifth line (215 characters) */
export const ATIS_LIST_LINE_LENGTHS: readonly number[] = [44, 44, 44, 44, 39];

/** The ATIS text laid out in lines of the given lengths, words kept whole */
export function wrapAtisText(text: string, lineLengths: readonly number[]): { lines: string[]; rest: string } {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  const lines: string[] = [];
  let index = 0;
  for (const length of lineLengths) {
    let line = '';
    while (index < words.length) {
      // A word longer than a whole line is cut
      const word = words[index].length > length ? words[index].substring(0, length) : words[index];
      const candidate = line === '' ? word : `${line} ${word}`;
      if (candidate.length > length) {
        break;
      }
      line = candidate;
      index++;
    }
    lines.push(line);
  }
  return { lines, rest: words.slice(index).join(' ') };
}

/**
 * The ATIS text in the 5 lines of the ATIS/LIST message area. When it cannot be entirely displayed, dots appear instead
 * of the last 9 characters and the whole message is on the ATIS/RECEIVED page.
 * @returns the lines, and whether the message is truncated
 */
export function atisListLines(text: string): { lines: string[]; truncated: boolean } {
  const wrapped = wrapAtisText(text, ATIS_LIST_LINE_LENGTHS);
  if (wrapped.rest === '') {
    return { lines: wrapped.lines, truncated: false };
  }
  const lastLength = ATIS_LIST_LINE_LENGTHS[ATIS_LIST_LINE_LENGTHS.length - 1];
  const shortened = wrapAtisText(text, [...ATIS_LIST_LINE_LENGTHS.slice(0, -1), lastLength - 9]);
  const lines = shortened.lines;
  lines[lines.length - 1] = `${lines[lines.length - 1]} ......`;
  return { lines, truncated: true };
}

/**
 * The ATIS time indication (FCOM DSC-46-10-20-30 P 31): the time of the ATIS message conveyed by the uplink, as written
 * in the ATIS text (e.g. "JFK ATIS INFO O 1151Z"), or ---- when it is not available. It is not the time of reception.
 */
export function atisTime(text: string): string {
  const pattern = /\b(\d{2})(\d{2})Z\b/g;
  const upper = text.toUpperCase();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(upper)) !== null) {
    if (Number(match[1]) < 24 && Number(match[2]) < 60) {
      return `${match[1]}${match[2]}Z`;
    }
  }
  return '----';
}
