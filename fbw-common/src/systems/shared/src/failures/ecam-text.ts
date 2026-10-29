// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { EcamColour, EcamTextSegment } from './failure-details';

const COLOUR_CONTROLS: Readonly<Record<string, EcamColour>> = {
  '<1m': 'yellow',
  '<2m': 'red',
  '<3m': 'green',
  '<4m': 'amber',
  '<5m': 'cyan',
  '<6m': 'magenta',
  '<7m': 'white',
};

/** Escape sequences that start with ESC and end at the first 'm'. */
// eslint-disable-next-line no-control-regex -- ESC is the ECAM colour escape being parsed
const CONTROL_PATTERN = /\x1b([^m]*m)/g;

/**
 * Splits text with ECAM escape controls into coloured segments. Flash and frame controls are ignored because the
 * flyPad shows static text.
 */
export function parseEcamText(text: string, defaultColour: EcamColour = 'white'): EcamTextSegment[] {
  const segments: EcamTextSegment[] = [];
  let colour = defaultColour;
  let underline = false;
  let textStart = 0;

  const flush = (end: number) => {
    if (end <= textStart) {
      return;
    }

    // ignored controls leave neighbours with equal attributes, which read as one run
    const previous = segments[segments.length - 1];
    const part = text.slice(textStart, end);
    if (previous && previous.colour === colour && previous.underline === underline) {
      previous.text += part;
    } else {
      segments.push({ text: part, colour, underline });
    }
  };

  CONTROL_PATTERN.lastIndex = 0;
  let match = CONTROL_PATTERN.exec(text);
  while (match !== null) {
    flush(match.index);
    textStart = match.index + match[0].length;

    const control = match[1];
    if (control === 'm') {
      // the reset also ends flash and frame, which are not kept
      underline = false;
    } else if (control === '4m') {
      underline = true;
    } else if (COLOUR_CONTROLS[control] !== undefined) {
      colour = COLOUR_CONTROLS[control];
    }

    match = CONTROL_PATTERN.exec(text);
  }
  flush(text.length);

  return segments;
}

/** The text without its colour controls, to compare ECAM text with plain strings. */
export function plainEcamText(text: string): string {
  return text.replace(CONTROL_PATTERN, '');
}
