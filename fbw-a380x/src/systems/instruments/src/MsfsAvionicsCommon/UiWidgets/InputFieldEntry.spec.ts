// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isInputFieldEntryApplied, isInputFieldEntryHandled } from './InputFieldEntry';

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

describe('InputField entry applied after dataHandlerDuringValidation', () => {
  it('applies an entry without a handler, or accepted by it', () => {
    expect(isInputFieldEntryApplied(undefined, false)).toBe(true);
    expect(isInputFieldEntryApplied(true, false)).toBe(true);
  });
  it('neither stores nor passes on an entry the handler rejected with false', () => {
    expect(isInputFieldEntryApplied(false, false)).toBe(false);
  });
  it('neither stores nor passes on an entry the handler threw on', () => {
    expect(isInputFieldEntryApplied(undefined, true)).toBe(false);
  });
});
