// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const logbookStyle = readFileSync(resolve(__dirname, 'logbook.scss'), 'utf-8').replace(/\r\n/g, '\n');

/**
 * @param selector a selector of the stylesheet, as written there
 * @returns the declarations of its rule
 */
function declarationsOf(selector: string): string {
  const start = logbookStyle.indexOf(`\n${selector} {`);
  expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return logbookStyle.substring(start, logbookStyle.indexOf('}', start));
}

describe('logbook style', () => {
  it('hides what is hidden although the logbook classes set their own display', () => {
    expect(declarationsOf('.oit-logbook-app .hidden')).toContain('display: none;');
  });

  it('scrolls a long ITEM SELECTION list instead of squeezing its lines onto each other', () => {
    expect(declarationsOf('.oit-logbook-list')).toContain('overflow-y: auto;');
    expect(declarationsOf('.oit-logbook-list-line')).toContain('flex-shrink: 0;');
  });

  it('keeps the click area of a field inside its frame, so the page keeps its width', () => {
    expect(declarationsOf('.oit-logbook-app .mfd-input-field-text-input-container')).toContain(
      'min-width: 0 !important;',
    );
  });
});
