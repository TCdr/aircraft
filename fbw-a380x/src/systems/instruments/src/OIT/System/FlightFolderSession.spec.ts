// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightFolderNetworkEvents, FlightFolderSession } from './FlightFolderSession';
import { FltOpsLaptopIndex } from './FltOpsStatusSync';
import { OisExportBox } from './OisExportBox';
import { OisLoadBox } from './OisLoadBox';
import { testOfp } from './FlightFolderTestOfp';

interface Sent {
  current: FlightFolderNetworkEvents['oisEffCurrent'][];
  master: FlightFolderNetworkEvents['oisEffMaster'][];
  sync: FlightFolderNetworkEvents['oisEffSynchronize'][];
}

/**
 * A laptop with its session, the messages it sent and its boxes.
 * @param index the laptop
 * @param exportBox the EXPORT BOX of the laptop
 * @returns the laptop
 */
function laptop(index: FltOpsLaptopIndex, exportBox = new OisExportBox()) {
  const sent: Sent = { current: [], master: [], sync: [] };
  const session = new FlightFolderSession(
    index,
    {
      sendCurrent: (m) => sent.current.push(m),
      sendMaster: (m) => sent.master.push(m),
      sendSynchronize: (m) => sent.sync.push(m),
    },
    () => true,
    (identifier, source, nowMs) => exportBox.add(identifier, source, nowMs),
  );
  const loadBox = new OisLoadBox(() => Promise.resolve(testOfp()));
  loadBox.loaded.sub((items) => session.onLoaded(items));
  return { session, sent, exportBox, loadBox };
}

/**
 * A laptop whose LOAD BOX loaded the OFP.
 * @param index the laptop
 * @returns the laptop
 */
async function loadedLaptop(index: FltOpsLaptopIndex = 1) {
  const l = laptop(index);
  await l.loadBox.refresh(true);
  l.loadBox.toggle(0);
  l.loadBox.load(index === 1 ? 'CAPT' : 'FO', true, true);
  return l;
}

describe('import of the loaded EFFs', () => {
  it('waits for the crew to import what the LOAD BOX loaded', async () => {
    const { session } = await loadedLaptop();
    expect(session.folders.get()).toHaveLength(0);
    expect(session.pending.get()).toHaveLength(1);
    expect(session.pending.get()[0]).toMatchObject({
      id: 'AIB406 23-SEP-08 NRT-TLS',
      label: 'AIB406 23-Sep-08 NRT-TLS',
      typeText: 'FULL',
      generatedMs: 1222150000 * 1000,
    });
  });

  it('displays the imported EFF as current with DISPLAY AS CURRENT, and not current with DISPLAY', async () => {
    const asCurrent = await loadedLaptop();
    asCurrent.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    expect(asCurrent.session.currentId.get()).toBe('AIB406 23-SEP-08 NRT-TLS');
    expect(asCurrent.session.pending.get()).toHaveLength(0);

    const plain = await loadedLaptop();
    expect(plain.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], false)).toHaveLength(1);
    expect(plain.session.folders.get()).toHaveLength(1);
    expect(plain.session.currentId.get()).toBeNull();
  });

  it('lists nothing again once imported, but asks again for a newer OFP of the same flight', async () => {
    const l = await loadedLaptop();
    l.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    l.session.onLoaded(l.loadBox.loaded.get());
    expect(l.session.pending.get()).toHaveLength(0);
    const newer = laptop(1);
    newer.session.onLoaded(l.loadBox.loaded.get());
    expect(newer.session.pending.get()).toHaveLength(1);
    const items = l.loadBox.loaded.get().map((item) => ({ ...item, generatedMs: (item.generatedMs ?? 0) + 60000 }));
    l.session.onLoaded(items);
    expect(l.session.pending.get()).toHaveLength(1);
  });
});

describe('current folder and master', () => {
  it('tells the other laptop which EFF became current, which imports it too', async () => {
    const a = await loadedLaptop(1);
    const b = await loadedLaptop(2);
    a.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    expect(a.sent.current).toEqual([{ sender: 1, identifier: 'AIB406 23-SEP-08 NRT-TLS' }]);
    a.sent.current.forEach((m) => b.session.receiveCurrent(m));
    expect(b.session.currentId.get()).toBe('AIB406 23-SEP-08 NRT-TLS');
    expect(b.session.folders.get()).toHaveLength(1);
    // its own message is not taken again
    a.session.receiveCurrent({ sender: 1, identifier: 'other' });
    expect(a.session.currentId.get()).toBe('AIB406 23-SEP-08 NRT-TLS');
  });

  it('makes the folder current when it was promoted on the other laptop before this one could import it', async () => {
    const b = laptop(2);
    b.session.receiveCurrent({ sender: 1, identifier: 'AIB406 23-SEP-08 NRT-TLS' });
    expect(b.session.currentId.get()).toBeNull();
    await b.loadBox.refresh(true);
    b.loadBox.toggle(0);
    b.loadBox.load('FO', true, true);
    b.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], false);
    expect(b.session.currentId.get()).toBe('AIB406 23-SEP-08 NRT-TLS');
  });

  it('has one master: the laptop that asked last', () => {
    const a = laptop(1);
    const b = laptop(2);
    a.session.takeMaster();
    a.sent.master.forEach((m) => b.session.receiveMaster(m));
    expect(a.session.isMaster.get()).toBe(true);
    expect(b.session.isMaster.get()).toBe(false);
    b.session.takeMaster();
    b.sent.master.forEach((m) => a.session.receiveMaster(m));
    expect(a.session.isMaster.get()).toBe(false);
    expect(b.session.isMaster.get()).toBe(true);
  });
});

describe('export', () => {
  it('puts the folder into the EXPORT BOX only when the crew exports it, and keeps it open before push back', async () => {
    const l = await loadedLaptop();
    expect(l.exportBox.items.get()).toHaveLength(0);
    l.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    expect(l.exportBox.items.get()).toHaveLength(0);
    const names = l.session.exportCurrent('cfp', 5000);
    expect(names).toContain('OPS FLT PLANS / Flight Plan');
    expect(names).not.toContain('OFP (BACK-UP) / OFP');
    expect(l.exportBox.items.get()).toEqual([
      expect.objectContaining({ identifier: 'FLT FOLDER AIB406 NRT-TLS 23-SEP-08', source: 'FLT FOLDER' }),
    ]);
    const current = l.session.current.get();
    expect(current?.closed).toBe(false);
    expect(current?.exported).toBe('cfp');
    expect(l.session.currentId.get()).toBe('AIB406 23-SEP-08 NRT-TLS');
  });

  it('closes the folder with the full export, which holds every document', async () => {
    const l = await loadedLaptop();
    l.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    expect(l.session.exportCurrent('full', 1)).toContain('OFP (BACK-UP) / OFP');
    expect(l.session.current.get()?.closed).toBe(true);
    expect(l.session.exportCurrent('full', 2)).toEqual([]);
    expect(l.session.canStore()).toBe(false);
  });

  it('exports nothing without a current folder', () => {
    const l = laptop(1);
    expect(l.session.exportCurrent('cfp', 1)).toEqual([]);
    expect(l.exportBox.items.get()).toHaveLength(0);
  });

  it('closes the flight without exporting', async () => {
    const l = await loadedLaptop();
    l.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    l.session.closeFlight();
    expect(l.session.current.get()?.closed).toBe(true);
    expect(l.exportBox.items.get()).toHaveLength(0);
  });
});

describe('store and synchronise', () => {
  it('stores into the current folder only', async () => {
    const l = await loadedLaptop();
    expect(l.session.canStore()).toBe(false);
    expect(l.session.store('TOPA', 'x')).toBeNull();
    l.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    expect(l.session.canStore()).toBe(true);
    expect(l.session.store('TOPA', 'x')).toBe('TOPA_1');
  });

  it('sends the state of the current folder to the offside laptop, which takes it', async () => {
    const a = await loadedLaptop(1);
    const b = await loadedLaptop(2);
    a.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    b.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    a.session.current.get()?.setNote('ofp/ofp', 'hello');
    a.session.synchronize();
    a.sent.sync.forEach((m) => b.session.receiveSynchronize(m));
    expect(b.session.current.get()?.state('ofp/ofp')?.note).toBe('hello');
  });
});

describe('administrator functions', () => {
  it('removes the closed folders and leaves the open ones', async () => {
    const l = await loadedLaptop();
    l.session.importPending(['AIB406 23-SEP-08 NRT-TLS'], true);
    expect(l.session.removeClosedFolders()).toBe(0);
    l.session.closeFlight();
    expect(l.session.removeClosedFolders()).toBe(1);
    expect(l.session.folders.get()).toHaveLength(0);
    expect(l.session.currentId.get()).toBeNull();
  });

  it('runs the start-up from the first display and starts it again after the laptop was powered down', () => {
    const l = laptop(1);
    expect(l.session.launchElapsedMs(1000)).toBe(0);
    expect(l.session.launchElapsedMs(61000)).toBe(60000);
    l.session.resetLaunch();
    expect(l.session.launchElapsedMs(70000)).toBe(0);
  });
});
