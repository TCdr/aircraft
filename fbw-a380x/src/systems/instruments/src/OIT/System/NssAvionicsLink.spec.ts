// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ClockEvents, EventBus } from '@microsoft/msfs-sdk';
import { FailuresConsumer, FmsData } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OisLaptop } from '../OisLaptop';
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

describe('FMS data on the FLT OPS STS page', () => {
  afterEach(() => vi.restoreAllMocks());

  /** @returns a running CAPT laptop on the FLT OPS network, an NSS AVNCS ANSU healthy, both SCIs working */
  function setUp() {
    const bus = new EventBus();
    const failures = new Set<number>();
    const sci = new SecureCommunicationInterface(bus, fakeFailures(failures));
    sci.init();
    sci.onUpdate();
    const simVarValues: Record<string, number> = {
      'L:A32NX_ELEC_DC_1_BUS_IS_POWERED': 1,
      'L:A32NX_FLTOPS_ANSU_1_IS_HEALTHY': 1,
    };
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVarValues[name] ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
      simVarValues[name] = value;
      return Promise.resolve();
    });
    // The laptop knows the SCI state from the NSS AVNCS side only
    const laptop = new OisLaptop(bus, 1, fakeFailures(new Set()));
    laptop.init();
    laptop.connectAvionicsData(sci.canReceiveFromAvionics);
    const simvars = bus.getPublisher<OitSimvars>();
    simvars.pub('laptopCaptPowered', true);
    simvars.pub('nssAnsu1Healthy', true);
    const fms = bus.getPublisher<FmsData>();
    fms.pub('fmsFlightNumber', 'AIB123');
    // A flight loaded with the aircraft powered: the ARU operates and the laptop is connected at once; the FLT OPS STS
    // page starts once the first seconds of the flight are over
    const clock = bus.getPublisher<ClockEvents>();
    clock.pub('simTime', 0);
    laptop.onUpdate();
    for (let simTimeMs = 10_000; simTimeMs <= 22_000; simTimeMs += 500) {
      clock.pub('simTime', simTimeMs);
      laptop.onUpdate();
    }
    const loseBothScis = (lost: boolean) => {
      for (const sciFailure of [A380Failure.Sci1, A380Failure.Sci2]) {
        if (lost) {
          failures.add(sciFailure);
        } else {
          failures.delete(sciFailure);
        }
      }
      sci.onUpdate();
    };
    return { laptop, fms, simvars, loseBothScis };
  }

  it('SYNCHRO AVIONICS keeps the entries while both SCIs are lost, and takes the FMS data once one is back', () => {
    const { laptop, fms, loseBothScis } = setUp();
    laptop.fltOpsStatus.enter('fltNumber', 'XX999');
    fms.pub('fmsFlightNumber', 'AIB456');

    loseBothScis(true);
    laptop.synchroAvionics();
    expect(laptop.data.fltNumber.get()).toBe('XX999');

    loseBothScis(false);
    laptop.synchroAvionics();
    expect(laptop.data.fltNumber.get()).toBe('AIB456');
  });

  it('stops following the FMS while both SCIs are lost, not with only the NSS DATA TO AVNCS pb-sw OFF', () => {
    const { laptop, fms, simvars, loseBothScis } = setUp();
    expect(laptop.data.fltNumber.get()).toBe('AIB123');

    loseBothScis(true);
    fms.pub('fmsFlightNumber', 'AIB456');
    laptop.onUpdate();
    expect(laptop.data.fltNumber.get()).toBe('AIB123');

    loseBothScis(false);
    simvars.pub('nssDataToAvncsOff', true);
    laptop.onUpdate();
    expect(laptop.data.fltNumber.get()).toBe('AIB456');
  });

  it('does not reload the flight plan of the EFB overlay without the avionics data', () => {
    const { laptop, loseBothScis } = setUp();
    loseBothScis(true);
    laptop.synchroAvionics();
    expect(SimVar.SetSimVarValue).not.toHaveBeenCalledWith(
      'L:A32NX_OIS_SYNCHRO_AVIONICS',
      expect.anything(),
      expect.anything(),
    );

    loseBothScis(false);
    laptop.synchroAvionics();
    expect(SimVar.SetSimVarValue).toHaveBeenCalledWith(
      'L:A32NX_OIS_SYNCHRO_AVIONICS',
      expect.anything(),
      expect.anything(),
    );
  });

  it('takes no FMS data at SYNCHRO AVIONICS without an NSS AVNCS server, though both SCIs work', () => {
    const { laptop, fms, simvars } = setUp();
    laptop.fltOpsStatus.enter('fltNumber', 'XX999');
    fms.pub('fmsFlightNumber', 'AIB456');
    simvars.pub('nssAnsu1Healthy', false);
    laptop.synchroAvionics();
    expect(laptop.data.fltNumber.get()).toBe('XX999');
    expect(SimVar.SetSimVarValue).not.toHaveBeenCalledWith(
      'L:A32NX_OIS_SYNCHRO_AVIONICS',
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('REFUEL entries to the FQMS', () => {
  it('the PFQ, the ZF data and FQMS DEFAULT are not sent without the NSS to avionics link', () => {
    const page = readFileSync(resolve(__dirname, '../Pages/NssAvncs/Refuel/OitAvncsRefuel.tsx'), 'utf-8');
    expect(page).toContain('notSentToAvionicsMessage(this.sci.link.get())');
    expect(page.split('if (!this.checkFqmsReachable(').length - 1).toBe(3);
  });
});
