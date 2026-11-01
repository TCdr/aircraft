// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { parseSearchQuery } from '../../Pages/FltOps/Shared/DocumentSearch';
import { inlineRuns } from './OpsLibraryInline';

describe('inlineRuns', () => {
  it('splits a text at its code spans', () => {
    expect(inlineRuns('Set `L:VAR` to 1', null)).toEqual([
      { text: 'Set ', code: false, hit: false },
      { text: 'L:VAR', code: true, hit: false },
      { text: ' to 1', code: false, hit: false },
    ]);
  });

  it('treats an unclosed backtick as plain text', () => {
    expect(inlineRuns('a `b', null).every((run) => !run.code)).toBe(true);
  });

  it('marks the searched words, also inside a code span', () => {
    const runs = inlineRuns('The APU uses `APU_SWITCH`', parseSearchQuery('apu'));
    expect(runs.filter((r) => r.hit).map((r) => [r.text, r.code])).toEqual([
      ['APU', false],
      ['APU', true],
    ]);
  });

  it('gives no runs for an empty text', () => {
    expect(inlineRuns('', null)).toEqual([]);
  });
});
