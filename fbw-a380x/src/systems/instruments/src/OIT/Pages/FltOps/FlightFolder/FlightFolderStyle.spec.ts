// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8').replace(/\r\n/g, '\n');
const folderStyle = read('flight-folder.scss');
const opsStyle = read('../OpsLibrary/ops-library.scss');

/** A height of its own, not the minimum height of a row that may still shrink */
const HEIGHT = /\n\s+height: \d+px;/;

/**
 * Finds the rules of a stylesheet by their selector.
 * The last rule of the selector counts: an earlier one may be shared with another selector.
 * @param style a stylesheet
 * @param selector a selector of the stylesheet, as written there
 * @returns the declarations of its rule
 */
function declarationsOf(style: string, selector: string): string {
  const start = style.lastIndexOf(`\n${selector} {`);
  expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return style.substring(start, style.indexOf('}', start));
}

describe('FLT FOLDER document pane style', () => {
  it('never shrinks a row above the text, which would draw it over the text', () => {
    expect(declarationsOf(folderStyle, '.oit-eff-document > *')).toContain('flex-shrink: 0;');
  });

  it('gives the note and search rows a height of their own', () => {
    for (const selector of ['.oit-eff-note', '.oit-eff-search', '.oit-eff-search-count', '.oit-eff-doc-head']) {
      expect(declarationsOf(folderStyle, selector), selector).toMatch(HEIGHT);
    }
  });
});

describe('NAV LOG style', () => {
  it('keeps the column titles above the scrolled rows, in a host with its own height', () => {
    const host = declarationsOf(folderStyle, '.oit-eff-header-host');
    expect(host).toContain('display: none;');
    expect(host).toMatch(HEIGHT);
  });

  it('keeps the boxes of the avionics values wide enough for 23:59 and 999.9 and the entry field inside them', () => {
    const width = Number(/width: (\d+)px;/.exec(declarationsOf(folderStyle, '.oit-eff-nl-box'))?.[1]);
    // 5 characters of 11 px, the box frame and padding
    expect(width).toBeGreaterThanOrEqual(5 * 11 + 2 * 2 + 2 * 6);
    expect(declarationsOf(folderStyle, '.oit-eff-nl-box .mfd-input-field-container')).toContain('padding: 0;');
    expect(declarationsOf(folderStyle, '.oit-eff-nl-box .mfd-input-field-text-input.editing')).toContain('18px');
  });

  it('gives the columns of the NAV LOG a total width that fits the document pane', () => {
    const widths = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      Number(/width: (\d+)px;/.exec(declarationsOf(folderStyle, `.oit-eff-nl-line .cell:nth-child(${n})`))?.[1]),
    );
    // The pane is 973 px wide inside its frame; the panel padding and the scroll bar take 24 and 26 px
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeLessThanOrEqual(973 - 24 - 26);
  });
});

describe('OPS LIBRARY consultation view style', () => {
  it('never shrinks the rows of the right pane, so the note keeps its own row', () => {
    expect(declarationsOf(opsStyle, '.oit-ops-right > *')).toContain('flex-shrink: 0;');
  });
});
