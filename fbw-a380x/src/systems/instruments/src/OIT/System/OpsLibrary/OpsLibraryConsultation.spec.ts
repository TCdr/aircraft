// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OpsLibraryCatalog, OpsLibraryContentFile, OpsManual } from './OpsLibraryContent';
import { OpsLibraryConsultation } from './OpsLibraryConsultation';
import { OpsLibraryUserData } from './OpsLibraryUserData';

const unit = (id: string) => ({
  id,
  title: id.toUpperCase(),
  kind: 'unit' as const,
  blocks: [{ t: 'p' as const, layer: 1 as const, text: id }],
});

const manual: OpsManual = {
  id: 'm',
  title: 'M',
  revision: 'r',
  units: 3,
  hash: '',
  root: {
    id: 'm',
    title: 'M',
    kind: 'folder',
    children: [
      { id: 'm/a', title: 'A', kind: 'folder', children: [unit('m/a/1'), unit('m/a/2')] },
      { id: 'm/b', title: 'B', kind: 'folder', children: [unit('m/b/1')] },
    ],
  },
};

const file: OpsLibraryContentFile = { version: 1, generated: 'g', manuals: [manual] };

/**
 * @returns a consultation of the sample manual with its user data
 */
function make() {
  const userData = new OpsLibraryUserData({ read: () => '', write: () => {} });
  const catalog = new OpsLibraryCatalog(file, {});
  return { consultation: new OpsLibraryConsultation(catalog, userData), userData };
}

describe('OpsLibraryConsultation', () => {
  it('opens a manual at its root and lists the first level in path mode', () => {
    const { consultation } = make();
    consultation.open('m');
    expect(consultation.nodeId.get()).toBe('m');
    expect(consultation.rows.get().map((r) => r.id)).toEqual(['m', 'm/a', 'm/b']);
  });

  it('opens a unit of any manual and reports an unknown one', () => {
    const { consultation } = make();
    expect(consultation.openUnit('m/b/1')).toBe(true);
    expect(consultation.manualId.get()).toBe('m');
    expect(consultation.rows.get().map((r) => r.id)).toEqual(['m', 'm/b', 'm/b/1']);
    expect(consultation.openUnit('nope')).toBe(false);
  });

  it('steps through the units in tree order across folders', () => {
    const { consultation } = make();
    consultation.openUnit('m/a/2');
    expect(consultation.hasNextUnit()).toBe(true);
    consultation.nextUnit();
    expect(consultation.nodeId.get()).toBe('m/b/1');
    expect(consultation.hasNextUnit()).toBe(false);
    consultation.previousUnit();
    consultation.previousUnit();
    expect(consultation.nodeId.get()).toBe('m/a/1');
    expect(consultation.hasPreviousUnit()).toBe(false);
  });

  it('from a folder the next unit is its first one', () => {
    const { consultation } = make();
    consultation.open('m', 'm/b');
    consultation.nextUnit();
    expect(consultation.nodeId.get()).toBe('m/b/1');
  });

  it('goes back and forward through what was opened', () => {
    const { consultation } = make();
    consultation.openUnit('m/a/1');
    consultation.select('m/b/1');
    expect(consultation.canGoBack.get()).toBe(true);
    expect(consultation.canGoForward.get()).toBe(false);
    consultation.back();
    expect(consultation.nodeId.get()).toBe('m/a/1');
    expect(consultation.canGoForward.get()).toBe(true);
    consultation.forward();
    expect(consultation.nodeId.get()).toBe('m/b/1');
  });

  it('a new page after going back drops the forward history', () => {
    const { consultation } = make();
    consultation.openUnit('m/a/1');
    consultation.select('m/a/2');
    consultation.back();
    consultation.select('m/b/1');
    expect(consultation.canGoForward.get()).toBe(false);
  });

  it('records the units visited in the Trace, not the folders', () => {
    const { consultation, userData } = make();
    consultation.open('m');
    consultation.select('m/a');
    consultation.select('m/a/1');
    expect(userData.folders()[0].unitIds).toEqual(['m/a/1']);
  });

  it('CLOSE keeps the open unit for the Interruption folder and returns to the home page', () => {
    const { consultation, userData } = make();
    consultation.openUnit('m/a/2');
    consultation.close();
    expect(consultation.manualId.get()).toBeNull();
    expect(userData.folders()[1].unitIds).toEqual(['m/a/2']);
  });

  it('tree mode lists the open folders and the parents of the selection', () => {
    const { consultation } = make();
    consultation.treeMode.set('tree');
    consultation.open('m');
    consultation.toggleFolder('m/b');
    expect(consultation.rows.get().map((r) => r.id)).toEqual(['m', 'm/a', 'm/b', 'm/b/1']);
  });

  it('shows the hits of a search in the tree until the search is closed', () => {
    const { consultation } = make();
    consultation.open('m');
    consultation.showSearch({ query: null, hits: new Set(['m', 'm/a', 'm/a/1']) });
    expect(
      consultation.rows
        .get()
        .filter((r) => r.hit)
        .map((r) => r.id),
    ).toEqual(['m', 'm/a']);
    consultation.closeSearch();
    expect(consultation.rows.get().some((r) => r.hit)).toBe(false);
  });

  it('a unit with a note has a note line, and losing the note removes it', () => {
    const { consultation, userData } = make();
    consultation.openUnit('m/a/1');
    userData.notes.save('m/a/1', 'remember');
    expect(consultation.rows.get().map((r) => r.id)).toContain('m/a/1#note');
    userData.notes.delete('m/a/1');
    expect(consultation.rows.get().map((r) => r.id)).not.toContain('m/a/1#note');
  });

  it('the layer stays chosen across units', () => {
    const { consultation } = make();
    consultation.setLayer(3);
    consultation.openUnit('m/a/1');
    consultation.nextUnit();
    expect(consultation.layer.get()).toBe(3);
  });

  it('reset leaves nothing open and clears the history', () => {
    const { consultation } = make();
    consultation.openUnit('m/a/1');
    consultation.select('m/a/2');
    consultation.reset();
    expect(consultation.manualId.get()).toBeNull();
    expect(consultation.canGoBack.get()).toBe(false);
  });
});
