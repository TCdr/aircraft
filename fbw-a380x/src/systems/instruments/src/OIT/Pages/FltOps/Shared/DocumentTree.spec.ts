// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DocumentNode, DocumentTreeIndex, noteRowId, unitIdOfNoteRow } from './DocumentTree';

const unit = (id: string): DocumentNode => ({ id, title: id.toUpperCase(), kind: 'unit' });
const folder = (id: string, children: DocumentNode[]): DocumentNode => ({
  id,
  title: id.toUpperCase(),
  kind: 'folder',
  children,
});

const ROOT = folder('m', [folder('a', [unit('a1'), unit('a2')]), folder('b', [unit('b1')]), folder('empty', [])]);

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('DocumentTreeIndex', () => {
  const index = new DocumentTreeIndex(ROOT);

  it('finds parents and the path from the root', () => {
    expect(index.parentId('a1')).toBe('a');
    expect(index.parentId('m')).toBeNull();
    expect(index.pathTo('b1').map((n) => n.id)).toEqual(['m', 'b', 'b1']);
    expect(index.pathTo('nope')).toEqual([]);
  });

  it('steps to the next and previous unit across folders', () => {
    expect(index.nextUnit('a2')?.id).toBe('b1');
    expect(index.previousUnit('b1')?.id).toBe('a2');
    expect(index.previousUnit('a1')).toBeNull();
    expect(index.nextUnit('b1')).toBeNull();
    expect(index.nextUnit('nope')).toBeNull();
  });

  it('lists the units under a folder and finds the first one', () => {
    expect(index.unitsUnder('a').map((u) => u.id)).toEqual(['a1', 'a2']);
    expect(index.firstUnitOf('m')?.id).toBe('a1');
    expect(index.firstUnitOf('empty')).toBeNull();
  });

  it('marks the hits and their parents', () => {
    expect([...index.hitSet(['b1'])].sort()).toEqual(['b', 'b1', 'm']);
  });

  it('path mode shows the parents of a unit down to it', () => {
    const rows = index.rows({ mode: 'path', expanded: new Set(), selectedId: 'a2' });
    expect(ids(rows)).toEqual(['m', 'a', 'a2']);
    expect(rows[2].selected).toBe(true);
  });

  it('path mode lists the contents of a selected folder, and of the root without a selection', () => {
    expect(ids(index.rows({ mode: 'path', expanded: new Set(), selectedId: 'a' }))).toEqual(['m', 'a', 'a1', 'a2']);
    expect(ids(index.rows({ mode: 'path', expanded: new Set(), selectedId: null }))).toEqual(['m', 'a', 'b', 'empty']);
  });

  it('tree mode opens only the folders asked for and the parents of the selection', () => {
    expect(ids(index.rows({ mode: 'tree', expanded: new Set(), selectedId: null }))).toEqual(['m', 'a', 'b', 'empty']);
    expect(ids(index.rows({ mode: 'tree', expanded: new Set(['b']), selectedId: 'a1' }))).toEqual([
      'm',
      'a',
      'a1',
      'a2',
      'b',
      'b1',
      'empty',
    ]);
  });

  it('only folders with children can be opened', () => {
    const rows = index.rows({ mode: 'tree', expanded: new Set(), selectedId: null });
    expect(rows.find((r) => r.id === 'a')?.expandable).toBe(true);
    expect(rows.find((r) => r.id === 'empty')?.expandable).toBe(false);
  });

  it('a unit with a note has a child line of the same title', () => {
    const rows = index.rows({ mode: 'path', expanded: new Set(), selectedId: 'a1', notes: new Set(['a1']) });
    const last = rows[rows.length - 1];
    expect(last).toMatchObject({ id: 'a1#note', title: 'A1', kind: 'note', depth: 3 });
    expect(unitIdOfNoteRow(noteRowId('a1'))).toBe('a1');
    expect(unitIdOfNoteRow('a1')).toBeNull();
  });

  it('flags the search hits in the lines', () => {
    const rows = index.rows({
      mode: 'tree',
      expanded: new Set(['a']),
      selectedId: null,
      hits: index.hitSet(['a2']),
    });
    expect(rows.filter((r) => r.hit).map((r) => r.id)).toEqual(['m', 'a', 'a2']);
  });
});
