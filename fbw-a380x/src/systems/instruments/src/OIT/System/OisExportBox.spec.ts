// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { applicationExportIdentifier, exportStatusText, OisExportBox } from './OisExportBox';

const EXPORTED = Date.UTC(2008, 11, 19, 7, 57);
const LATER = Date.UTC(2008, 11, 19, 8, 55);

/**
 * @returns an EXPORT BOX with an exported flight folder
 */
function boxWithFolder(): OisExportBox {
  const box = new OisExportBox();
  box.add('FLT FOLDER AIB110 ICN-LAX 19-DEC-08', 'FLT FOLDER', EXPORTED);
  return box;
}

describe('EXPORT BOX', () => {
  it('lists the exported data NOT SENT, an export of the same data again replacing the older one', () => {
    const box = boxWithFolder();
    box.add('FLT FOLDER AIB110 ICN-LAX 19-DEC-08', 'FLT FOLDER', LATER);
    expect(box.items.get()).toHaveLength(1);
    expect(box.items.get()[0].dateMs).toBe(LATER);
    expect(exportStatusText(box.items.get()[0].status)).toBe('NOT SENT');
  });

  it('sends the GND rows with the gatelink: SENT (GND) and the time, ticks cleared', () => {
    const box = boxWithFolder();
    box.update(true, EXPORTED);
    expect(box.send(LATER)).toBe('nothing');
    box.toggleDestination(0, 'GND');
    expect(box.send(LATER)).toBe('sent');
    const item = box.items.get()[0];
    expect(exportStatusText(item.status)).toBe('SENT (GND) 19-DEC 08:55');
    expect(item.gnd).toBe(false);
  });

  it('without the gatelink: the pop-up, then the outbox, sent when the gatelink comes back', () => {
    const box = boxWithFolder();
    box.update(false, EXPORTED);
    box.toggleDestination(0, 'GND');
    expect(box.send(LATER)).toBe('no-com');
    expect(box.items.get()[0].status.state).toBe('NOT SENT');
    box.moveToOutbox();
    expect(box.canSend()).toBe(false);
    box.update(false, LATER);
    expect(box.items.get()[0].status.state).toBe('NOT SENT');
    box.update(true, LATER);
    expect(exportStatusText(box.items.get()[0].status)).toBe('SENT (GND) 19-DEC 08:55');
  });

  it('cannot tick USB without a USB key', () => {
    const box = boxWithFolder();
    box.toggleDestination(0, 'USB');
    expect(box.items.get()[0].usb).toBe(false);
    expect(box.canSend()).toBe(false);
  });

  it('removes rows with the recycle bins', () => {
    const box = boxWithFolder();
    box.add('LOADSHEET AIB110', 'LOADSHEET', LATER);
    box.remove(0);
    expect(box.items.get().map((item) => item.source)).toEqual(['LOADSHEET']);
    box.removeAll();
    expect(box.items.get()).toHaveLength(0);
  });
});

describe('export of an application', () => {
  it('names the data after the application and the flight, as the FLT FOLDER export', () => {
    const dateMs = Date.UTC(2008, 11, 19, 7, 57);
    expect(applicationExportIdentifier('LOADSHEET', 'AIB110', 'ICN', 'LAX', dateMs)).toBe(
      'LOADSHEET AIB110 ICN-LAX 19-DEC-08',
    );
  });

  it('enters the EXPORT BOX not sent, an export of the same data again replacing the older one', () => {
    const box = new OisExportBox();
    box.add('LOADSHEET AIB110 ICN-LAX 19-DEC-08', 'LOADSHEET', 1000);
    box.add('LOADSHEET AIB110 ICN-LAX 19-DEC-08', 'LOADSHEET', 2000);
    expect(box.items.get().map((item) => [item.source, item.dateMs, item.status.state])).toEqual([
      ['LOADSHEET', 2000, 'NOT SENT'],
    ]);
  });
});
