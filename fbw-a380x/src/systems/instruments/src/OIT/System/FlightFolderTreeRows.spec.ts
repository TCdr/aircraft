// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { flightFolderFromOfp } from './FlightFolderSession';
import { testOfp } from './FlightFolderTestOfp';
import { FLIGHT_FOLDER_ROOT_ID, flightFolderTreeRows, folderListing, selectedDocumentId } from './FlightFolderTreeRows';
import { noteRowId } from '../Pages/FltOps/Shared/DocumentTree';
import { FLIGHT_PLAN_DOC_ID } from './FlightFolderDocuments';

const folder = () => flightFolderFromOfp(testOfp(), true);

describe('navigation tree rows', () => {
  it('shows the folder as the root with its folders and the Recycle Bin last', () => {
    const rows = flightFolderTreeRows(folder(), null, new Set());
    expect(rows[0]).toMatchObject({ id: FLIGHT_FOLDER_ROOT_ID, title: 'AIB406 23-Sep-08 NRT-TLS', depth: 0 });
    expect(rows.map((r) => r.title).slice(1)).toEqual([
      'Flight Information',
      'WEATHER DATA',
      'NOTAMS',
      'LOAD SHEET',
      'OPS FLT PLANS',
      'OFP (BACK-UP)',
      'Recycle Bin',
    ]);
  });

  it('carries the colour and the (NEW) mark of each line', () => {
    const f = folder();
    f.toggleDone('flight-information', 'PILOT1', 1);
    f.markRead('flight-information');
    const rows = flightFolderTreeRows(f, null, new Set());
    const info = rows.find((r) => r.id === 'flight-information');
    expect(info).toMatchObject({ colour: 'green', isNew: false });
    expect(rows.find((r) => r.id === 'weather')).toMatchObject({ colour: 'blue', isNew: true });
    expect(rows.find((r) => r.id === 'ofp')).toMatchObject({ colour: 'white', isNew: true });
  });

  it('opens a folder to show its documents, and a selected document opens its folders', () => {
    const f = folder();
    expect(flightFolderTreeRows(f, null, new Set()).some((r) => r.id === 'weather/departure')).toBe(false);
    expect(flightFolderTreeRows(f, null, new Set(['weather'])).some((r) => r.id === 'weather/departure')).toBe(true);
    expect(flightFolderTreeRows(f, 'weather/departure', new Set()).some((r) => r.id === 'weather/alternate')).toBe(
      true,
    );
  });

  it('marks the active flight plan and gives a document with a note a note line under it', () => {
    const f = folder();
    f.selectPlan(FLIGHT_PLAN_DOC_ID);
    f.setNote('ofp/ofp', 'check');
    const rows = flightFolderTreeRows(f, 'ofp/ofp', new Set(['ops-plans']));
    expect(rows.find((r) => r.id === FLIGHT_PLAN_DOC_ID)?.activePlan).toBe(true);
    const ofp = rows.findIndex((r) => r.id === 'ofp/ofp');
    expect(rows[ofp + 1]).toMatchObject({ id: noteRowId('ofp/ofp'), kind: 'note' });
  });
});

describe('what the document window shows', () => {
  it('shows the document of a selected document or note line, nothing for a folder', () => {
    const f = folder();
    expect(selectedDocumentId(f, 'ofp/ofp')).toBe('ofp/ofp');
    expect(selectedDocumentId(f, noteRowId('ofp/ofp'))).toBe('ofp/ofp');
    expect(selectedDocumentId(f, 'weather')).toBeNull();
    expect(selectedDocumentId(f, null)).toBeNull();
  });

  it('lists what a selected folder holds, the root holding every folder', () => {
    const f = folder();
    expect(folderListing(f, 'weather').map((e) => e.name)).toEqual(['Departure', 'Destination', 'Alternate']);
    expect(folderListing(f, null).map((e) => e.name)[0]).toBe('Flight Information');
    expect(folderListing(f, 'ofp/ofp')).toEqual([]);
  });
});
