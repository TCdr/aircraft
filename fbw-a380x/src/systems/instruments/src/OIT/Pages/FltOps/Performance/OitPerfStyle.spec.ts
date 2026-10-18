// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const performanceStyle = readFileSync(resolve(__dirname, 'performance.scss'), 'utf-8').replace(/\r\n/g, '\n');

/**
 * @param selector a selector of the stylesheet, as written there
 * @returns the declarations of its rule
 */
function declarationsOf(selector: string): string {
  const start = performanceStyle.indexOf(`\n${selector} {`);
  expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return performanceStyle.substring(start, performanceStyle.indexOf('}', start));
}

describe('performance application style', () => {
  it('hides what is hidden although the page classes set their own display', () => {
    expect(declarationsOf('.oit-perf-page .hidden')).toContain('display: none;');
  });

  it('keeps the click area of a text box inside its frame', () => {
    expect(declarationsOf('.oit-perf-page .mfd-input-field-text-input-container')).toContain(
      'min-width: 0 !important;',
    );
  });
});
