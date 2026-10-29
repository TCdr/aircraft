// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DocumentTextEntry } from './DocumentTextEntry';

describe('DocumentTextEntry', () => {
  it('is empty at the start', () => {
    expect(new DocumentTextEntry().current()).toBe('');
  });

  it('gives the characters typed before the entry is validated', () => {
    const entry = new DocumentTextEntry();
    entry.onInput('APU');
    expect(entry.current()).toBe('APU');
    expect(entry.value.get()).toBeNull();
  });

  it('gives the validated text once the entry is validated, and empty when the field was emptied', () => {
    const entry = new DocumentTextEntry();
    entry.onInput('APU ST');
    entry.onModified('APU START');
    expect(entry.current()).toBe('APU START');
    entry.onModified(null);
    expect(entry.current()).toBe('');
  });

  it('tells a listener the text after every key press and every validated entry', () => {
    const edited: string[] = [];
    const entry = new DocumentTextEntry((text) => edited.push(text));
    entry.onInput('AP');
    entry.onModified('APU');
    entry.onModified(null);
    entry.set('from outside');
    expect(edited).toEqual(['AP', 'APU', '']);
  });

  it('a text set from outside replaces what was typed', () => {
    const entry = new DocumentTextEntry();
    entry.onInput('typed');
    entry.set('stored note');
    expect(entry.current()).toBe('stored note');
    entry.set(null);
    expect(entry.current()).toBe('');
  });
});
