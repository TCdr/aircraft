// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { flightFolderFromOfp } from './FlightFolderSession';
import { testOfp } from './FlightFolderTestOfp';
import { FlightFolder } from './FlightFolder';
import { EffNode, FLIGHT_PLAN_DOC_ID, RECYCLE_BIN_ID } from './FlightFolderDocuments';

const folderOf = (): FlightFolder => flightFolderFromOfp(testOfp(), true);

/**
 * @param folder the flight folder
 * @param id the id of a node of its tree
 * @returns the node
 */
function node(folder: FlightFolder, id: string): EffNode {
  const find = (nodes: readonly EffNode[]): EffNode | null => {
    for (const n of nodes) {
      if (n.id === id) {
        return n;
      }
      const inside = find(n.children ?? []);
      if (inside) {
        return inside;
      }
    }
    return null;
  };
  const found = find(folder.visibleTree());
  expect(found, id).not.toBeNull();
  return found as EffNode;
}

describe('flight folder built from the OFP', () => {
  it('is labelled with the date in mixed case and keeps the capital identifier', () => {
    const folder = folderOf();
    expect(folder.label).toBe('AIB406 23-Sep-08 NRT-TLS');
    expect(folder.id).toBe('AIB406 23-SEP-08 NRT-TLS');
    expect(folder.exportIdentifier).toBe('FLT FOLDER AIB406 NRT-TLS 23-SEP-08');
  });

  it('holds the documents of the OFP and the Recycle Bin last, and no NOTAMS folder without NOTAMs', () => {
    const names = folderOf()
      .visibleTree()
      .map((n) => n.name);
    expect(names).toEqual([
      'Flight Information',
      'WEATHER DATA',
      'NOTAMS',
      'LOAD SHEET',
      'OPS FLT PLANS',
      'OFP (BACK-UP)',
      'Recycle Bin',
    ]);
    const noNotams = flightFolderFromOfp(testOfp({ notams: undefined }), true)
      .visibleTree()
      .map((n) => n.name);
    expect(noNotams).not.toContain('NOTAMS');
  });

  it('shows the OFP as plain text, so a search finds its words', () => {
    const folder = folderOf();
    expect(folder.document('ofp/ofp')?.text).toBe('OFP  AIB406\nROUTE <DCT>\nEND');
  });
});

describe('colours and (NEW)', () => {
  it('is blue until signed or checked, green after; documents with nothing to do are white', () => {
    const folder = folderOf();
    expect(folder.colourOf(node(folder, 'flight-information'))).toBe('blue');
    expect(folder.colourOf(node(folder, 'ofp/ofp'))).toBe('white');
    folder.toggleDone('flight-information', 'PILOT1', 1000);
    expect(folder.colourOf(node(folder, 'flight-information'))).toBe('green');
  });

  it('gives a folder the worst colour of its documents', () => {
    const folder = folderOf();
    expect(folder.colourOf(node(folder, 'weather'))).toBe('blue');
    folder.toggleDone('weather/departure', 'PILOT1', 1);
    folder.toggleDone('weather/destination', 'PILOT1', 1);
    expect(folder.colourOf(node(folder, 'weather'))).toBe('blue');
    folder.toggleDone('weather/alternate', 'PILOT1', 1);
    expect(folder.colourOf(node(folder, 'weather'))).toBe('green');
    expect(folder.colourOf(node(folder, RECYCLE_BIN_ID))).toBe('white');
  });

  it('marks unread documents and their folders (NEW) until each document is read', () => {
    const folder = folderOf();
    expect(folder.isNew(node(folder, 'weather'))).toBe(true);
    ['weather/departure', 'weather/destination'].forEach((id) => folder.markRead(id));
    expect(folder.isNew(node(folder, 'weather'))).toBe(true);
    folder.markRead('weather/alternate');
    expect(folder.isNew(node(folder, 'weather'))).toBe(false);
    expect(folder.isNew(node(folder, 'weather/departure'))).toBe(false);
    expect(folder.isNew(node(folder, 'notams'))).toBe(true);
  });
});

describe('document actions', () => {
  it('goes through the documents with << and >>, folders and deleted documents left out', () => {
    const folder = folderOf();
    const order = folder.documentOrder();
    expect(order[0]).toBe('flight-information');
    expect(order).not.toContain('weather');
    expect(folder.neighbour(null, 1)).toBe('flight-information');
    expect(folder.neighbour('flight-information', 1)).toBe('weather/departure');
    expect(folder.neighbour('flight-information', -1)).toBeNull();
    folder.deleteDocument('weather/departure');
    expect(folder.neighbour('flight-information', 1)).toBe('weather/destination');
    expect(folder.neighbour(order[order.length - 1], 1)).toBeNull();
  });

  it('moves a deleted document to the Recycle Bin', () => {
    const folder = folderOf();
    expect(folder.deleteDocument('ofp/ofp')).toBe(true);
    expect(folder.deleteDocument('ofp/ofp')).toBe(false);
    const bin = node(folder, RECYCLE_BIN_ID);
    expect(bin.children?.map((n) => n.name)).toEqual(['OFP']);
    expect(node(folder, 'ofp').children).toEqual([]);
    expect(folder.documentOrder()).not.toContain('ofp/ofp');
    expect(folder.document('ofp/ofp')).not.toBeNull();
  });

  it('keeps a note, and an empty note deletes it', () => {
    const folder = folderOf();
    folder.setNote('ofp/ofp', 'check fuel');
    expect(folder.state('ofp/ofp')?.note).toBe('check fuel');
    folder.setNote('ofp/ofp', '   ');
    expect(folder.state('ofp/ofp')?.note).toBeNull();
  });

  it('has one active flight plan, and only flight plans can be selected', () => {
    const folder = folderOf();
    expect(folder.selectPlan('ofp/ofp')).toBe(false);
    expect(folder.selectPlan(FLIGHT_PLAN_DOC_ID)).toBe(true);
    expect(folder.selectedPlan()).toBe(FLIGHT_PLAN_DOC_ID);
  });

  it('signs and unsigns, and gives nothing to sign to a document that needs none', () => {
    const folder = folderOf();
    expect(folder.toggleDone('ofp/ofp', 'PILOT1', 5)).toBe(false);
    expect(folder.toggleDone('loadsheet/loadsheet', 'PILOT1', 5)).toBe(true);
    expect(folder.state('loadsheet/loadsheet')?.done).toEqual({ by: 'PILOT1', timeMs: 5 });
    expect(folder.toggleDone('loadsheet/loadsheet', 'PILOT2', 9)).toBe(true);
    expect(folder.state('loadsheet/loadsheet')?.done).toBeNull();
  });

  it('rejects every change of a closed folder', () => {
    const folder = folderOf();
    folder.close();
    expect(folder.setNote('ofp/ofp', 'x')).toBe(false);
    expect(folder.toggleDone('flight-information', 'PILOT1', 1)).toBe(false);
    expect(folder.deleteDocument('ofp/ofp')).toBe(false);
    expect(folder.selectPlan(FLIGHT_PLAN_DOC_ID)).toBe(false);
    expect(folder.setFuelUpdate('trip', 1)).toBe(false);
    expect(folder.store('TOPA', 'x')).toBeNull();
  });
});

describe('export and store', () => {
  it('exports before push back the documents the operator sends, all of them for the full export', () => {
    const folder = folderOf();
    expect(folder.exportContent('cfp')).not.toContain('OFP (BACK-UP) / OFP');
    expect(folder.exportContent('cfp')).toContain('OPS FLT PLANS / Flight Plan');
    expect(folder.exportContent('cfp')).toContain('WEATHER DATA / Departure');
    expect(folder.exportContent('full')).toContain('OFP (BACK-UP) / OFP');
  });

  it('is closed by the full export only', () => {
    const folder = folderOf();
    folder.markExported('cfp');
    expect(folder.closed).toBe(false);
    folder.markExported('full');
    expect(folder.closed).toBe(true);
  });

  it('stores a page as a numbered, unread document of the Performance folder', () => {
    const folder = folderOf();
    expect(folder.store('LDPA', 'LANDING')).toBe('LDPA_1');
    expect(folder.store('LDPA', 'LANDING 2')).toBe('LDPA_2');
    expect(folder.store('TOPA', 'T.O')).toBe('TOPA_1');
    const performance = node(folder, 'performance');
    expect(performance.children?.map((n) => n.name)).toEqual(['LDPA_1', 'LDPA_2', 'TOPA_1']);
    expect(folder.isNew(performance)).toBe(true);
    expect(folder.document('performance/LDPA_1')?.text).toBe('LANDING');
  });
});

describe('synchronisation with the offside laptop', () => {
  it('copies the state of the documents and the crew entries', () => {
    const a = folderOf();
    const b = folderOf();
    a.toggleDone('flight-information', 'PILOT1', 3);
    a.setNote('ofp/ofp', 'n');
    a.setFuelUpdate('trip', 14400);
    expect(b.applySyncState(a.syncState())).toBe(true);
    expect(b.state('flight-information')?.done?.by).toBe('PILOT1');
    expect(b.state('ofp/ofp')?.note).toBe('n');
    expect(b.flightPlan.updates.fuel.trip).toBe(14400);
  });

  it('brings the stored pages along, and keeps a document read when either laptop read it', () => {
    const a = folderOf();
    const b = folderOf();
    a.store('TOPA', 'T.O');
    b.markRead('weather/departure');
    expect(b.applySyncState(a.syncState())).toBe(true);
    expect(b.document('performance/TOPA_1')?.text).toBe('T.O');
    expect(b.state('weather/departure')?.read).toBe(true);
    // the next stored page of the same application does not reuse the number
    expect(b.store('TOPA', 'T.O 2')).toBe('TOPA_2');
  });

  it('is not taken from another flight', () => {
    const a = folderOf();
    const other = flightFolderFromOfp(testOfp({ flightNumber: '407' }), true);
    expect(a.applySyncState(other.syncState())).toBe(false);
  });
});
