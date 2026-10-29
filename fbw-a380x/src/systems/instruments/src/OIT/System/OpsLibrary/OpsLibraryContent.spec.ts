// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import generated from './ops-library-content.json';
import {
  ECAM_MANUAL_ID,
  MMEL_MANUAL_ID,
  OpsBlock,
  OpsLibraryCatalog,
  OpsLibraryContentFile,
  OpsManual,
  OpsNode,
  blocksOfLayer,
  buildEcamManual,
  buildMmelManual,
  countUnits,
  effectiveLayer,
  manualHash,
  revisionDateText,
  subTopics,
  unitPrintout,
} from './OpsLibraryContent';

const file = generated as unknown as OpsLibraryContentFile;

const block = (t: OpsBlock['t'], layer: 1 | 2 | 3, text = 'x'): OpsBlock => ({ t, layer, text });

const sampleManual: OpsManual = {
  id: 'sample',
  title: 'SAMPLE',
  revision: '2026-10-29',
  units: 2,
  hash: '',
  root: {
    id: 'sample',
    title: 'SAMPLE',
    kind: 'folder',
    children: [
      { id: 'sample/a', title: 'A', kind: 'unit', blocks: [block('p', 1, 'apu start')] },
      { id: 'sample/b', title: 'B', kind: 'unit', blocks: [block('p', 2)] },
    ],
  },
};

const sampleFile: OpsLibraryContentFile = { version: 1, generated: '2026-10-29', manuals: [sampleManual] };

const PROCEDURES = {
  '240001': { title: '\x1b<4m\x1b4mELEC\x1bm AC BUS 1 FAULT' },
  '240002': { title: '\x1b<2m\x1b4mELEC\x1bm EMER CONFIG' },
  '290001': { title: '\x1b<4mHYD G SYS PRESS LO' },
};

describe('the generated content file', () => {
  const allNodes: OpsNode[] = [];
  const walk = (node: OpsNode) => {
    allNodes.push(node);
    (node.children ?? []).forEach(walk);
  };
  file.manuals.forEach((m) => walk(m.root));

  it('has the schema version and the two generated manuals', () => {
    expect(file.version).toBe(1);
    expect(file.manuals.map((m) => m.id)).toEqual(['feature', 'simvars']);
  });

  it('has unique ids', () => {
    const ids = allNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no empty unit', () => {
    const units = allNodes.filter((n) => n.kind === 'unit');
    expect(units.length).toBeGreaterThan(100);
    expect(units.filter((n) => (n.blocks ?? []).length === 0).map((n) => n.id)).toEqual([]);
  });

  it('keeps the unit counts and checksums of the manuals', () => {
    for (const manual of file.manuals) {
      expect(countUnits(manual.root)).toBe(manual.units);
      expect(manualHash(manual.root)).toBe(manual.hash);
    }
  });

  it('leaves no markup in the text', () => {
    const texts = JSON.stringify(file.manuals);
    expect(texts).not.toMatch(/<\/?[a-z][^>]*>/i);
  });

  it('stays below the size budget of the instrument bundle', () => {
    expect(JSON.stringify(file).length).toBeLessThan(1_200_000);
  });

  it('uses no reserved manufacturer words in titles', () => {
    const titles = allNodes.map((n) => n.title).concat(file.manuals.map((m) => m.title));
    expect(titles.filter((t) => /\bFCOM\b|Airbus S\.A\.S|DSC-/i.test(t))).toEqual([]);
  });
});

describe('layers', () => {
  const blocks = [block('p', 1), block('p', 2), block('p', 3)];

  it('shows the blocks of the layer and the lower ones', () => {
    expect(blocksOfLayer(blocks, 1)).toHaveLength(1);
    expect(blocksOfLayer(blocks, 2)).toHaveLength(2);
    expect(blocksOfLayer(blocks, 3)).toHaveLength(3);
  });

  it('a layer the unit does not have shows the highest one it has', () => {
    const two = [block('p', 1), block('p', 2)];
    expect(effectiveLayer(two, 3)).toBe(2);
    expect(blocksOfLayer(two, 3)).toHaveLength(2);
  });

  it('a unit whose blocks are all above the layer chosen shows the lowest layer it has, not nothing', () => {
    const niceToKnow = [block('p', 2), block('p', 3)];
    expect(effectiveLayer(niceToKnow, 1)).toBe(2);
    expect(blocksOfLayer(niceToKnow, 1)).toHaveLength(1);
  });

  it('a unit without blocks keeps the layer chosen', () => {
    expect(effectiveLayer([], 2)).toBe(2);
  });
});

describe('sub-topics', () => {
  it('lists the h4 headings with their block index', () => {
    const blocks = [block('p', 1), block('h4', 1, 'LIMITS'), block('p', 1), block('h4', 1, 'USE')];
    expect(subTopics(blocks)).toEqual([
      { title: 'LIMITS', blockIndex: 1 },
      { title: 'USE', blockIndex: 3 },
    ]);
  });
});

describe('the ECAM PROCEDURES manual', () => {
  const manual = buildEcamManual(PROCEDURES, '2026-10-29');

  it('has one unit per procedure under its ATA chapter, titled without colour codes', () => {
    expect(manual.units).toBe(3);
    const index = new OpsLibraryCatalog(sampleFile, PROCEDURES).index(ECAM_MANUAL_ID)!;
    expect(index.node('ecam/240001')?.title).toBe('ELEC AC BUS 1 FAULT');
    expect(index.parentId('ecam/240001')).toBe('ecam/chapter-24');
    expect(index.node('ecam/chapter-29')?.title).toBe('ATA 29 HYDRAULIC POWER');
  });
});

describe('the MMEL manual', () => {
  it('is an empty structure with an entry per ECAM alert and per logbook reference', () => {
    const manual = buildMmelManual(
      [{ id: '240001', title: 'ELEC AC BUS 1 FAULT' }],
      [
        { reference: '21-51-01', title: 'PACK 1 INOP' },
        { reference: '240001', title: 'duplicate of an alert' },
        { reference: '', title: 'no reference' },
      ],
      '2026-10-29',
    );
    expect(manual.units).toBe(2);
    const units: OpsNode[] = [];
    const walk = (n: OpsNode) => (n.kind === 'unit' ? units.push(n) : (n.children ?? []).forEach(walk));
    walk(manual.root);
    expect(units.map((u) => u.id).sort()).toEqual(['mmel/21-51-01', 'mmel/240001']);
    expect(units.every((u) => u.blocks === undefined)).toBe(true);
  });
});

describe('OpsLibraryCatalog', () => {
  const catalog = new OpsLibraryCatalog(sampleFile, PROCEDURES);

  it('lists the generated manuals, then ECAM PROCEDURES and MMEL', () => {
    expect(catalog.manuals().map((m) => m.id)).toEqual(['sample', ECAM_MANUAL_ID, MMEL_MANUAL_ID]);
  });

  it('finds a unit in any manual', () => {
    expect(catalog.find('sample/a')?.manualId).toBe('sample');
    expect(catalog.find('ecam/290001')?.manualId).toBe('ecam');
    expect(catalog.find('nope')).toBeUndefined();
  });

  it('new logbook references appear as MMEL entries', () => {
    catalog.setMmelReferences([{ reference: '21-51-01', title: 'PACK 1 INOP' }]);
    expect(catalog.find('mmel/21-51-01')?.unit.title).toBe('21-51-01 PACK 1 INOP');
    catalog.setMmelReferences([]);
    expect(catalog.find('mmel/21-51-01')).toBeUndefined();
  });

  it('searches the generated text and the ECAM alerts but not the MMEL entries', () => {
    const entries = catalog.searchEntries();
    expect(entries.find((e) => e.id === 'sample/a')?.text).toBe('apu start');
    expect(entries.find((e) => e.id === 'sample/a')?.context).toBe('SAMPLE');
    expect(entries.some((e) => e.id.startsWith('mmel/'))).toBe(false);
    expect(entries.find((e) => e.id === 'ecam/240001')?.group).toBe('ECAM PROCEDURES');
  });
});

describe('unitPrintout', () => {
  it('prints the title, then the blocks of the layer chosen', () => {
    const unit: OpsNode = {
      id: 'u',
      title: 'APU START',
      kind: 'unit',
      blocks: [block('p', 1, 'first'), { t: 'ul', layer: 2, items: ['a', 'b'] }, block('p', 3, 'detail')],
    };
    expect(unitPrintout(unit, 2, []).text.split(String.fromCharCode(10))).toEqual(['APU START', '', 'first', 'a', 'b']);
    expect(unitPrintout(unit, 1, []).title).toBe('OPS LIBRARY');
  });

  it('prints the lines of a unit without blocks', () => {
    const unit: OpsNode = { id: 'e', title: 'FAULT', kind: 'unit', ecamId: '1' };
    expect(unitPrintout(unit, 1, ['LINE 1', 'LINE 2']).text.split(String.fromCharCode(10))).toEqual([
      'FAULT',
      '',
      'LINE 1',
      'LINE 2',
    ]);
  });
});

describe('revisionDateText', () => {
  it('writes an ISO date as day, month name and year', () => {
    expect(revisionDateText('2026-10-29')).toBe('29-Oct-2026');
  });

  it('keeps a text that is not a date', () => {
    expect(revisionDateText('rev B')).toBe('rev B');
    expect(revisionDateText('2026-13-01')).toBe('2026-13-01');
  });
});
