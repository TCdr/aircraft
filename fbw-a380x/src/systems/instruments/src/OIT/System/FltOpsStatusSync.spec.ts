// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import {
  FltOpsLaptopIndex,
  FltOpsStatusFlight,
  FltOpsStatusPageMessage,
  FltOpsStatusSync,
  fmsDataReachLaptop,
  oisVersionLabel,
  registrationList,
} from './FltOpsStatusSync';

const FMS_FLIGHT: FltOpsStatusFlight = { fltNumber: 'AIB123', from: 'LFBO', to: 'LFBD' };

/** One laptop and the page fields of its OIT */
class Laptop {
  public readonly fields = {
    fltNumber: Subject.create<string | null>(null),
    fromAirport: Subject.create<string | null>(null),
    toAirport: Subject.create<string | null>(null),
  };

  public readonly sts: FltOpsStatusSync;

  constructor(index: FltOpsLaptopIndex, network: FltOpsNetwork) {
    this.sts = new FltOpsStatusSync(index, this.fields, network);
  }

  public page(): FltOpsStatusFlight {
    return {
      fltNumber: this.fields.fltNumber.get(),
      from: this.fields.fromAirport.get(),
      to: this.fields.toAirport.get(),
    };
  }
}

/** The FLT OPS network: a synced bus event reaches every laptop, the sender too */
class FltOpsNetwork {
  public readonly laptops: Laptop[] = [];

  public sendPage(message: FltOpsStatusPageMessage): void {
    this.laptops.forEach((laptop) => laptop.sts.receivePage(message));
  }

  public requestPage(sender: FltOpsLaptopIndex): void {
    this.laptops.forEach((laptop) => laptop.sts.receiveRequest(sender));
  }
}

const twoLaptops = () => {
  const network = new FltOpsNetwork();
  const capt = new Laptop(1, network);
  const fo = new Laptop(2, network);
  network.laptops.push(capt, fo);
  return { capt, fo };
};

describe('FLT OPS STS page and the FMS', () => {
  it('takes the FMS flight number and city pair automatically', () => {
    const { capt } = twoLaptops();
    capt.sts.update(true, true, FMS_FLIGHT);
    expect(capt.page()).toEqual(FMS_FLIGHT);

    capt.sts.update(true, true, { ...FMS_FLIGHT, to: 'EGLL' });
    expect(capt.page().to).toBe('EGLL');
  });

  it('no longer takes the FMS changes after a manual entry, until SYNCHRO AVIONICS', () => {
    const { capt } = twoLaptops();
    capt.sts.update(true, true, FMS_FLIGHT);
    capt.sts.enter('fltNumber', 'XX999');
    capt.sts.update(true, true, { ...FMS_FLIGHT, to: 'EGLL' });
    expect(capt.page()).toEqual({ ...FMS_FLIGHT, fltNumber: 'XX999' });

    capt.sts.synchroAvionics({ ...FMS_FLIGHT, to: 'EGLL' });
    expect(capt.page()).toEqual({ ...FMS_FLIGHT, to: 'EGLL' });
    capt.sts.update(true, true, { ...FMS_FLIGHT, to: 'LFPG' });
    expect(capt.page().to).toBe('LFPG');
  });

  it('gets no FMS data without the avionics route: SYNCHRO AVIONICS changes nothing', () => {
    const { capt } = twoLaptops();
    capt.sts.update(true, false, null);
    capt.sts.synchroAvionics(null);
    expect(capt.page()).toEqual({ fltNumber: null, from: null, to: null });
  });

  it('clears the page at a laptop restart and follows the FMS again', () => {
    const { capt } = twoLaptops();
    capt.sts.update(true, true, null);
    capt.sts.enter('fltNumber', 'XX999');
    capt.sts.update(false, false, null);
    capt.sts.update(true, false, null);
    expect(capt.page().fltNumber).toBeNull();
    capt.sts.update(true, true, FMS_FLIGHT);
    expect(capt.page()).toEqual(FMS_FLIGHT);
  });
});

describe('FLT OPS STS synchronisation between the CAPT and F/O laptops', () => {
  it('shows a manual entry of one laptop on the other one, which then stops following the FMS too', () => {
    const { capt, fo } = twoLaptops();
    capt.sts.update(true, true, FMS_FLIGHT);
    fo.sts.update(true, true, FMS_FLIGHT);

    capt.sts.enter('toAirport', 'LFPO');
    expect(fo.page().to).toBe('LFPO');

    fo.sts.update(true, true, { ...FMS_FLIGHT, to: 'EGLL' });
    expect(fo.page().to).toBe('LFPO');
  });

  it('shares SYNCHRO AVIONICS: both laptops follow the FMS again', () => {
    const { capt, fo } = twoLaptops();
    capt.sts.update(true, true, FMS_FLIGHT);
    fo.sts.update(true, true, FMS_FLIGHT);
    capt.sts.enter('fltNumber', 'XX999');

    fo.sts.synchroAvionics(FMS_FLIGHT);
    expect(capt.page()).toEqual(FMS_FLIGHT);
    capt.sts.update(true, true, { ...FMS_FLIGHT, to: 'EGLL' });
    expect(capt.page().to).toBe('EGLL');
  });

  it('gives its page to a laptop that joins the network later', () => {
    const { capt, fo } = twoLaptops();
    capt.sts.update(true, true, FMS_FLIGHT);
    capt.sts.enter('fltNumber', 'XX999');

    fo.sts.update(true, true, FMS_FLIGHT);
    expect(fo.page().fltNumber).toBe('XX999');
    fo.sts.update(true, true, { ...FMS_FLIGHT, fltNumber: 'AIB456' });
    expect(fo.page().fltNumber).toBe('XX999');
  });

  it('exchanges nothing with a stand-alone laptop', () => {
    const { capt, fo } = twoLaptops();
    capt.sts.update(true, true, null);
    fo.sts.update(true, false, null);

    capt.sts.enter('fltNumber', 'XX999');
    expect(fo.page().fltNumber).toBeNull();
    fo.sts.enter('fromAirport', 'LFBO');
    expect(capt.page().from).toBeNull();
  });

  it('starts the page of both laptops again at an EXIT SESSION: empty, then the FMS values', () => {
    const { capt, fo } = twoLaptops();
    capt.sts.update(true, true, null);
    fo.sts.update(true, true, null);
    capt.sts.enter('fltNumber', 'XX999');

    fo.sts.exitSession();
    expect(capt.page().fltNumber).toBeNull();
    capt.sts.update(true, true, FMS_FLIGHT);
    expect(capt.page()).toEqual(FMS_FLIGHT);
  });

  it('after a network loss, no longer exchanges manual entries until both laptops restart', () => {
    const { capt, fo } = twoLaptops();
    capt.sts.update(true, true, null);
    fo.sts.update(true, true, null);
    // the network is lost, then back
    capt.sts.update(true, false, null);
    fo.sts.update(true, false, null);
    capt.sts.update(true, true, null);
    fo.sts.update(true, true, null);

    capt.sts.enter('fltNumber', 'XX999');
    expect(fo.page().fltNumber).toBeNull();

    // the CAPT laptop only is restarted
    capt.sts.update(false, false, null);
    capt.sts.update(true, true, null);
    capt.sts.enter('fltNumber', 'YY111');
    expect(fo.page().fltNumber).toBeNull();

    // then the F/O laptop
    fo.sts.update(false, false, null);
    fo.sts.update(true, true, null);
    capt.sts.enter('fltNumber', 'ZZ222');
    expect(fo.page().fltNumber).toBe('ZZ222');
  });
});

describe('FMS data route to the FLT OPS laptops', () => {
  it('needs the laptop on the network, an NSS AVNCS server, an SCI and the link from the NSS AVNCS side', () => {
    expect(fmsDataReachLaptop(true, true, true, true)).toBe(true);
    expect(fmsDataReachLaptop(false, true, true, true)).toBe(false);
    expect(fmsDataReachLaptop(true, false, true, true)).toBe(false);
    expect(fmsDataReachLaptop(true, true, false, true)).toBe(false);
    expect(fmsDataReachLaptop(true, true, true, false)).toBe(false);
  });
});

describe('FLT OPS STS aircraft lines', () => {
  it('shows the build date and release as the OIS VERSION', () => {
    expect(
      oisVersionLabel({ built: '2026-09-26T20:49:20+00:00', version: 'a380x-v2024.3.0-SNAPSHOT-develop.2baa2b3' }),
    ).toBe('26-SEP-26 V2024.3.0');
    expect(oisVersionLabel({ built: '2008-07-14T00:00:00Z', version: 'v2.0' })).toBe('14-JUL-08 V2.0');
    expect(oisVersionLabel({ built: '', version: '' })).toBe('');
    expect(oisVersionLabel({ built: 'not a date', version: 'v2.0' })).toBe('');
  });

  it('lists the ATC ID of the aircraft as its registration', () => {
    expect(registrationList(' f-wwow ')).toEqual(['F-WWOW']);
    expect(registrationList('')).toEqual([]);
    expect(registrationList(0)).toEqual([]);
  });
});
