// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { ChartRef, ChartsClipboard, ChartsClipboardMessage } from './ChartsClipboard';

const SID: ChartRef = { icao: 'LFBO', guid: 'g1', name: 'ALB 1A' };
const STAR: ChartRef = { icao: 'LFBD', guid: 'g2', name: 'MARMA 2B' };
const ILS: ChartRef = { icao: 'LFBD', guid: 'g3', name: 'ILS 05' };

/** Two laptops: a message of one reaches the other, and the sender too, as a synced bus event does */
class Network {
  public readonly captOnNetwork = Subject.create(true);

  public readonly foOnNetwork = Subject.create(true);

  public readonly sent: ChartsClipboardMessage[] = [];

  public readonly capt: ChartsClipboard = new ChartsClipboard(1, this.sender(), this.captOnNetwork);

  public readonly fo: ChartsClipboard = new ChartsClipboard(2, this.sender(), this.foOnNetwork);

  private sender() {
    return {
      sendClipboard: (message: ChartsClipboardMessage) => {
        this.sent.push(message);
        this.capt.receive(message);
        this.fo.receive(message);
      },
    };
  }
}

describe('prepare', () => {
  it('keeps the charts in the order they were prepared', () => {
    const { fo } = new Network();
    fo.prepare(STAR);
    fo.prepare(SID);
    expect(fo.charts.get()).toEqual([STAR, SID]);
  });

  it('prepares a chart once', () => {
    const { fo } = new Network();
    fo.prepare(SID);
    fo.prepare({ ...SID });
    expect(fo.charts.get()).toEqual([SID]);
    expect(fo.contains(SID.guid)).toBe(true);
  });

  it('takes a chart off, and empties the clipboard', () => {
    const { fo } = new Network();
    fo.prepare(SID);
    fo.prepare(STAR);
    fo.remove(SID.guid);
    expect(fo.charts.get()).toEqual([STAR]);
    fo.clear();
    expect(fo.charts.get()).toEqual([]);
  });
});

describe('send and import', () => {
  it('brings the clipboard of the F/O to the Captain', () => {
    const { fo, capt } = new Network();
    fo.prepare(SID);
    fo.prepare(STAR);
    fo.send();

    // the charts wait for IMPORT: the Captain's clipboard does not change by itself
    expect(capt.charts.get()).toEqual([]);
    expect(capt.offered.get()).toEqual([SID, STAR]);
    expect(capt.canImport()).toBe(true);

    capt.importOffered();
    expect(capt.charts.get()).toEqual([SID, STAR]);
    expect(capt.offered.get()).toEqual([]);
  });

  it('does not offer a laptop its own charts', () => {
    const { fo } = new Network();
    fo.prepare(SID);
    fo.send();
    expect(fo.offered.get()).toEqual([]);
  });

  it('adds the imported charts after those already prepared, each once', () => {
    const { fo, capt } = new Network();
    capt.prepare(ILS);
    capt.prepare(SID);
    fo.prepare(SID);
    fo.prepare(STAR);
    fo.send();
    capt.importOffered();
    expect(capt.charts.get()).toEqual([ILS, SID, STAR]);
  });

  it('sends nothing when there is nothing prepared', () => {
    const { fo, sent } = new Network();
    expect(fo.canSend()).toBe(false);
    fo.send();
    expect(sent).toHaveLength(0);
  });

  it('has nothing to import before the other laptop sent', () => {
    const { capt } = new Network();
    expect(capt.canImport()).toBe(false);
    capt.importOffered();
    expect(capt.charts.get()).toEqual([]);
  });

  it('keeps the latest offer', () => {
    const { fo, capt } = new Network();
    fo.prepare(SID);
    fo.send();
    fo.prepare(STAR);
    fo.send();
    expect(capt.offered.get()).toEqual([SID, STAR]);
  });
});

describe('a laptop that is not on the network', () => {
  it('cannot send', () => {
    const { fo, capt, foOnNetwork, sent } = new Network();
    fo.prepare(SID);
    foOnNetwork.set(false);
    expect(fo.canSend()).toBe(false);
    fo.send();
    expect(sent).toHaveLength(0);
    expect(capt.offered.get()).toEqual([]);
  });

  it('receives nothing', () => {
    const { fo, capt, captOnNetwork } = new Network();
    captOnNetwork.set(false);
    fo.prepare(SID);
    fo.send();
    expect(capt.offered.get()).toEqual([]);
  });

  it('cannot import what it was offered before it left the network', () => {
    const { fo, capt, captOnNetwork } = new Network();
    fo.prepare(SID);
    fo.send();
    captOnNetwork.set(false);
    expect(capt.canImport()).toBe(false);
    capt.importOffered();
    expect(capt.charts.get()).toEqual([]);
  });

  it('still prepares its own charts', () => {
    const { capt, captOnNetwork } = new Network();
    captOnNetwork.set(false);
    capt.prepare(SID);
    expect(capt.charts.get()).toEqual([SID]);
  });
});

describe('laptop restart', () => {
  it('empties the clipboard and what was offered', () => {
    const { fo, capt } = new Network();
    capt.prepare(ILS);
    fo.prepare(SID);
    fo.send();
    capt.reset();
    expect(capt.charts.get()).toEqual([]);
    expect(capt.offered.get()).toEqual([]);
  });
});
