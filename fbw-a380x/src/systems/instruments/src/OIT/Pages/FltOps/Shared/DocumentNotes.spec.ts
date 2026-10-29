// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_NOTE_MAX_LENGTH, DocumentNotes } from './DocumentNotes';

describe('DocumentNotes', () => {
  it('saves, edits and deletes a note', () => {
    const changed = vi.fn();
    const notes = new DocumentNotes(changed);
    notes.save('u1', ' first ');
    expect(notes.get('u1')).toBe('first');
    notes.save('u1', 'second');
    expect(notes.get('u1')).toBe('second');
    expect(notes.unitIds()).toEqual(['u1']);
    notes.delete('u1');
    expect(notes.has('u1')).toBe(false);
    expect(changed.mock.calls).toEqual([
      ['u1', 'first'],
      ['u1', 'second'],
      ['u1', null],
    ]);
  });

  it('an empty text deletes the note', () => {
    const notes = new DocumentNotes();
    notes.save('u1', 'x');
    notes.save('u1', '   ');
    expect(notes.has('u1')).toBe(false);
  });

  it('deleting a unit without a note changes nothing', () => {
    const changed = vi.fn();
    new DocumentNotes(changed).delete('none');
    expect(changed).not.toHaveBeenCalled();
  });

  it('cuts a note at the longest length', () => {
    const notes = new DocumentNotes();
    notes.save('u1', 'x'.repeat(DOCUMENT_NOTE_MAX_LENGTH + 50));
    expect(notes.get('u1')?.length).toBe(DOCUMENT_NOTE_MAX_LENGTH);
  });

  it('round-trips through the store and drops damaged entries', () => {
    const notes = new DocumentNotes();
    notes.save('u1', 'a');
    const other = new DocumentNotes();
    other.load(JSON.parse(JSON.stringify(notes.toRecord())));
    expect(other.get('u1')).toBe('a');
    other.load({ u2: 5, u3: '', u4: 'ok' });
    expect(other.unitIds()).toEqual(['u4']);
    other.load(null);
    expect(other.unitIds()).toEqual([]);
  });
});
