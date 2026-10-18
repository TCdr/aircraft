// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const widgetStyle = readFileSync(resolve(__dirname, 'widget-style.scss'), 'utf-8').replace(/\r\n/g, '\n');

/**
 * @param selector a selector of the stylesheet, as written there
 * @returns the declarations of its rule
 */
function declarationsOf(selector: string): string {
  const start = widgetStyle.indexOf(`\n${selector} {`);
  expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return widgetStyle.substring(start, widgetStyle.indexOf('}', start));
}

describe('OIT widget style', () => {
  it('lets an empty input field be selected: its text area fills the frame', () => {
    // The click handler of the field is on the text area; centred, it had no height while the field showed nothing
    const textArea = declarationsOf('.mfd-input-field-text-input-container');
    expect(textArea).toContain('align-self: stretch;');
    expect(textArea).not.toContain('align-self: center;');
  });

  it('keeps the arrow of a list inside its frame whatever the digit count of the list field', () => {
    expect(declarationsOf('.mfd-dropdown-inner .mfd-input-field-text-input-container')).toContain(
      'min-width: 0 !important;',
    );
  });
});
