// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isInputFieldEntryHandled } from './InputFieldEntry';

describe('InputField entry handling', () => {
  it('handles a changed value', () => {
    expect(isInputFieldEntryHandled('EGLL', 'LFPG', false)).toBe(true);
    expect(isInputFieldEntryHandled(null, 'LFPG', false)).toBe(true);
  });
  it('skips an entry equal to the value', () => {
    expect(isInputFieldEntryHandled('LFPG', 'LFPG', false)).toBe(false);
  });
  it('handles the same value again for a field that reloads on each entry, but not an empty one', () => {
    expect(isInputFieldEntryHandled('RTE1', 'RTE1', true)).toBe(true);
    expect(isInputFieldEntryHandled(null, null, true)).toBe(false);
  });
});
