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

/** The characters of a printed line (the FMS printouts) */
const PRINT_LINE_LENGTH = 64;

/**
 * The printed ATIS message (PRINT, AUTO PRINT, PRINT ALL of the ATIS/LIST page, FCOM DSC-46-10-20-30 P 32-34): the
 * airport, the ATIS type, the version and the time, then the whole text. The FCOM gives no printout example: the lines
 * follow the FMS printouts.
 */
export function atisPrintLines(icao: string, type: string, version: string, time: string, text: string): string[] {
  const lines = [`  ${icao} ${type} ATIS ${version || '-'}   ${time || '----'}`, ''];
  let rest = text.toUpperCase();
  while (rest !== '') {
    const wrapped = wrapAtisText(rest, [PRINT_LINE_LENGTH - 2]);
    lines.push(`  ${wrapped.lines[0]}`);
    rest = wrapped.rest;
  }
  return lines;
}
