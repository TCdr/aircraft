// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EventBus } from '@microsoft/msfs-sdk';
import { FailuresConsumer, FmsData } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { describe, expect, it, vi } from 'vitest';
import { OitSimvars } from '../OitSimvarPublisher';
import { AnsuOps } from './AnsuOps';
import {
  canReceiveFromAvionics,
  canSendToAvionics,
  linkDegradedToolbarText,
  NssAvionicsLink,
  nssAvionicsLink,
  notSentToAvionicsMessage,
} from './NssAvionicsLink';
import { SecureCommunicationInterface } from './SecureCommunicationInterface';
import { TechLogbookStore } from './TechLogbookStore';

// The ECAM alert tables fail on their circular import in a test; the logbook only names the alerts with them
vi.mock('../../MsfsAvionicsCommon/EcamMessages', () => ({ EcamAbnormalProcedures: {} }));

/**
 * @param active the flyPad failures the test sets
 * @returns a failures consumer with those failures active
 */
function fakeFailures(active: Set<number>): FailuresConsumer {
  return {
    isActive: (id: number) => active.has(id),
    register: () => {},
    update: () => {},
  } as unknown as FailuresConsumer;
}

describe('NSS / avionics link through the SCIs', () => {
  it('works both ways normally, and with one SCI lost', () => {
    expect(nssAvionicsLink(false, [false, false])).toBe(NssAvionicsLink.BothWays);
    expect(nssAvionicsLink(false, [true, false])).toBe(NssAvionicsLink.BothWays);
    expect(nssAvionicsLink(false, [false, true])).toBe(NssAvionicsLink.BothWays);
  });

  it('passes data from the avionics to the NSS only with the NSS DATA TO AVNCS pb-sw OFF', () => {
    const link = nssAvionicsLink(true, [false, false]);
    expect(link).toBe(NssAvionicsLink.AvionicsToNssOnly);
    expect(canSendToAvionics(link)).toBe(false);
    expect(canReceiveFromAvionics(link)).toBe(true);
  });

  it('is lost both ways with both SCIs lost, whatever the pb-sw', () => {
    for (const pbOff of [false, true]) {
      const link = nssAvionicsLink(pbOff, [true, true]);
      expect(link).toBe(NssAvionicsLink.Lost);
      expect(canSendToAvionics(link)).toBe(false);
      expect(canReceiveFromAvionics(link)).toBe(false);
    }
  });

  it('tells why an entry did not reach the avionics, and on the message toolbar when the link degrades', () => {
    expect(notSentToAvionicsMessage(NssAvionicsLink.BothWays)).toBe('');
    expect(notSentToAvionicsMessage(NssAvionicsLink.AvionicsToNssOnly)).toBe('NOT SENT: NSS DATA TO AVNCS INOP');
    expect(notSentToAvionicsMessage(NssAvionicsLink.Lost)).toBe('NOT SENT: NSS/AVNCS DATA XFR INOP');
    expect(linkDegradedToolbarText(NssAvionicsLink.BothWays)).toBeNull();
    expect(linkDegradedToolbarText(NssAvionicsLink.AvionicsToNssOnly)).toBe('NSS DATA TO AVNCS INOP');
    expect(linkDegradedToolbarText(NssAvionicsLink.Lost)).toBe('NSS/AVNCS DATA XFR INOP');
  });
});

describe('OIT secure communication interface', () => {
  /** @returns an SCI with no failure, the pb-sw normal */
  function setUp() {
    const bus = new EventBus();
    const failures = new Set<number>();
    const sci = new SecureCommunicationInterface(bus, fakeFailures(failures));
    sci.init();
    sci.onUpdate();
    return { bus, failures, sci };
  }

  it('reads the pb-sw and the SCI 1 / SCI 2 flyPad failures', () => {
    const { bus, failures, sci } = setUp();
    expect(sci.link.get()).toBe(NssAvionicsLink.BothWays);

    bus.getPublisher<OitSimvars>().pub('nssDataToAvncsOff', true);
    expect(sci.link.get()).toBe(NssAvionicsLink.AvionicsToNssOnly);
    expect(sci.canSendToAvionics.get()).toBe(false);

    failures.add(A380Failure.Sci1);
    failures.add(A380Failure.Sci2);
    sci.onUpdate();
    expect(sci.link.get()).toBe(NssAvionicsLink.Lost);
    expect(sci.canReceiveFromAvionics.get()).toBe(false);
  });

  it('keeps the last avionics data while both SCIs are lost, and takes the new data again once one is back', () => {
    const { bus, failures, sci } = setUp();
    const fms = bus.getPublisher<FmsData>();
    fms.pub('fmsFlightNumber', 'AIB123');
    expect(sci.fltNumber.get()).toBe('AIB123');

    failures.add(A380Failure.Sci1);
    failures.add(A380Failure.Sci2);
    sci.onUpdate();
    fms.pub('fmsFlightNumber', 'AIB456');
    expect(sci.fltNumber.get()).toBe('AIB123');

    failures.delete(A380Failure.Sci2);
    sci.onUpdate();
    expect(sci.fltNumber.get()).toBe('AIB456');
  });
});

describe('Technical logbook ground link', () => {
  it('synchronises with the ground only while the NSS can send to the avionics', () => {
    for (const [pbOff, sciFailed, result] of [
      [false, false, 'update-done'],
      [true, false, 'update-failed'],
      [false, true, 'update-failed'],
    ] as const) {
      const bus = new EventBus();
      const failures = new Set<number>(sciFailed ? [A380Failure.Sci1, A380Failure.Sci2] : []);
      const sci = new SecureCommunicationInterface(bus, fakeFailures(failures));
      sci.init();
      sci.onUpdate();
      bus.getPublisher<OitSimvars>().pub('nssDataToAvncsOff', pbOff);
      const logbook = new TechLogbookStore(bus, sci, {
        outBlockTime: sci.zuluTime.map(() => null),
        offBlockTime: sci.zuluTime.map(() => null),
        onBlockTime: sci.zuluTime.map(() => null),
        inBlockTime: sci.zuluTime.map(() => null),
        outBlockFob: sci.zuluTime.map(() => null),
        inBlockFob: sci.zuluTime.map(() => null),
        flightTime: sci.zuluTime.map(() => null),
      });
      logbook.init();
      vi.spyOn(logbook, 'registration').mockReturnValue('F-WWSA');
      const now = sci.zuluTime.get();
      logbook.startUpdate();
      logbook.update(now + 60_000);
      expect(logbook.syncResult.get()).toBe(result);
      logbook.destroy();
    }
  });
});

describe('NSS AVNCS message toolbar', () => {
  it('tells the crew when the link to the avionics degrades', () => {
    const bus = new EventBus();
    const ansu = new AnsuOps(bus, 1, 'nss-avncs', fakeFailures(new Set()));
    ansu.init();
    expect(ansu.messageToolbar.count.get()).toBe(0);
    bus.getPublisher<OitSimvars>().pub('nssDataToAvncsOff', true);
    expect(ansu.messageToolbar.shownText.get()).toContain('NSS DATA TO AVNCS INOP');
    bus.getPublisher<OitSimvars>().pub('nssDataToAvncsOff', false);
    expect(ansu.messageToolbar.count.get()).toBe(1);
  });
});

describe('REFUEL entries to the FQMS', () => {
  it('the PFQ, the ZF data and FQMS DEFAULT are not sent without the NSS to avionics link', () => {
    const page = readFileSync(resolve(__dirname, '../Pages/NssAvncs/Refuel/OitAvncsRefuel.tsx'), 'utf-8');
    expect(page).toContain('notSentToAvionicsMessage(this.sci.link.get())');
    expect(page.split('if (!this.checkFqmsReachable(').length - 1).toBe(3);
  });
});
