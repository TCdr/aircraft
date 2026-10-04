// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus, MappedSubject, Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import {
  isSdMoreAvailable,
  isStatusMoreAvailable,
  sdMoreShownAfterMorePb,
  sdMoreShownToKeep,
} from '@shared/EcamSdMore';
import { FwsSystemDisplayLogic } from './FwsSystemDisplayLogic';
import { FwsCore } from './FwsCore';

/*
 * A380 FCOM DSC-31-40-10 (STATUS MORE PAGE): MORE at the bottom of the STATUS page, the MORE pb on the ECP shows the
 * STATUS MORE page. FCOM DSC-31-40-20 (MORE pb): pressing it again clears the MORE information page.
 */

/** Values of the registered simvars (RegisteredSimVar reads/writes by id, which the global SimVar mock lacks) */
let simvars: Map<string, number>;
const ids: string[] = [];
const originals: Record<string, unknown> = {};

function idOf(name: string): number {
  let id = ids.indexOf(name);
  if (id < 0) {
    id = ids.push(name) - 1;
  }
  return id;
}

beforeEach(() => {
  simvars = new Map();
  originals.GetRegisteredId = SimVar.GetRegisteredId;
  originals.GetSimVarValueFastReg = SimVar.GetSimVarValueFastReg;
  originals.call = Coherent.call;
  SimVar.GetRegisteredId = (name: string) => idOf(name);
  SimVar.GetSimVarValueFastReg = (id: number) => simvars.get(ids[id]) ?? 0;
  (Coherent as any).call = (_method: string, id: number, value: number) => {
    simvars.set(ids[id], value);
    return Promise.resolve();
  };
});

afterEach(() => {
  SimVar.GetRegisteredId = originals.GetRegisteredId as typeof SimVar.GetRegisteredId;
  SimVar.GetSimVarValueFastReg = originals.GetSimVarValueFastReg as typeof SimVar.GetSimVarValueFastReg;
  (Coherent as any).call = originals.call;
});

/** The FWS display logic with an FwsCore stand-in that holds only what the logic reads */
function setUp() {
  const bus = new EventBus();
  const redundancyLoss = Subject.create<string[]>([]);
  const cancelledCaution = Subject.create<string[]>([]);
  const fws = {
    sub: bus.getSubscriber(),
    flightPhase: Subject.create(6), // cruise: no automatic page logic in the way
    ecamStatusNormal: Subject.create(false),
    adrPressureAltitude: Subject.create(35000),
    statusMoreAvailable: MappedSubject.create(
      ([r, c]) => isStatusMoreAvailable(r, c),
      redundancyLoss,
      cancelledCaution,
    ),
  };
  const logic = new FwsSystemDisplayLogic(fws as unknown as FwsCore);

  simvars.set('L:A32NX_ECAM_SFAIL', SdPages.None);
  logic.init();

  const showPage = (page: SdPages) => {
    simvars.set('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', page);
    logic.update(50);
  };
  const pressMore = () => bus.getPublisher<{ hEvent: string }>().pub('hEvent', 'A32NX_SD_REQUEST_MORE');
  const moreShown = () => simvars.get('L:A32NX_ECAM_SD_MORE_SHOWN') ?? 0;

  return { logic, redundancyLoss, cancelledCaution, showPage, pressMore, moreShown };
}

describe('FwsSystemDisplayLogic ECP MORE pb on the STATUS page', () => {
  it('shows the STATUS MORE page with REDUND LOSS items, without any value written back by the SD', () => {
    // In the sim the SD STATUS page left L:A32NX_ECAM_SD_STS_MORE_AVAILABLE at 0 while it showed MORE
    const { redundancyLoss, showPage, pressMore, moreShown } = setUp();
    redundancyLoss.set(['AC_ESS_BUS_REDUND']);
    showPage(SdPages.Status);
    simvars.set('L:A32NX_ECAM_SD_STS_PAGE_TO_SHOW', 1);

    pressMore();
    expect(moreShown()).toBe(1);
    expect(simvars.get('L:A32NX_ECAM_SD_STS_PAGE_TO_SHOW')).toBe(0);

    pressMore();
    expect(moreShown()).toBe(0);
  });

  it('shows the STATUS MORE page with only a CANCELLED CAUTION', () => {
    const { cancelledCaution, showPage, pressMore, moreShown } = setUp();
    cancelledCaution.set(['CAUTION']);
    showPage(SdPages.Status);
    pressMore();
    expect(moreShown()).toBe(1);
  });

  it('does nothing when the STATUS page has no MORE', () => {
    const { showPage, pressMore, moreShown } = setUp();
    showPage(SdPages.Status);
    pressMore();
    expect(moreShown()).toBe(0);
  });

  it('does nothing on a page without a MORE page', () => {
    const { redundancyLoss, showPage, pressMore, moreShown } = setUp();
    redundancyLoss.set(['AC_ESS_BUS_REDUND']);
    showPage(SdPages.Eng);
    pressMore();
    expect(moreShown()).toBe(0);
  });

  it('is the writer of L:A32NX_ECAM_SD_STS_MORE_AVAILABLE', () => {
    const { redundancyLoss } = setUp();
    expect(simvars.get('L:A32NX_ECAM_SD_STS_MORE_AVAILABLE')).toBe(0);
    redundancyLoss.set(['AC_ESS_BUS_REDUND']);
    expect(simvars.get('L:A32NX_ECAM_SD_STS_MORE_AVAILABLE')).toBe(1);
    redundancyLoss.set([]);
    expect(simvars.get('L:A32NX_ECAM_SD_STS_MORE_AVAILABLE')).toBe(0);
  });

  it('clears the MORE page (and the MORE pb light) when the SD leaves the STATUS page', () => {
    const { redundancyLoss, showPage, pressMore, moreShown } = setUp();
    redundancyLoss.set(['AC_ESS_BUS_REDUND']);
    showPage(SdPages.Status);
    pressMore();
    showPage(SdPages.Status);
    expect(moreShown()).toBe(1);

    showPage(SdPages.Eng);
    expect(moreShown()).toBe(0);
  });

  it('clears the MORE page when the STATUS page has no MORE any more', () => {
    const { redundancyLoss, showPage, pressMore, moreShown } = setUp();
    redundancyLoss.set(['AC_ESS_BUS_REDUND']);
    showPage(SdPages.Status);
    pressMore();
    redundancyLoss.set([]);
    showPage(SdPages.Status);
    expect(moreShown()).toBe(0);
  });

  it('stops handling the MORE pb once destroyed', () => {
    const { logic, redundancyLoss, showPage, pressMore, moreShown } = setUp();
    redundancyLoss.set(['AC_ESS_BUS_REDUND']);
    showPage(SdPages.Status);
    logic.destroy();
    pressMore();
    expect(moreShown()).toBe(0);
  });
});

describe('EcamSdMore rules', () => {
  it('has a STATUS MORE page with REDUND LOSS or CANCELLED CAUTION only', () => {
    expect(isStatusMoreAvailable([], [])).toBe(false);
    expect(isStatusMoreAvailable(['A'], [])).toBe(true);
    expect(isStatusMoreAvailable([], ['B'])).toBe(true);
  });

  it('has MORE only on the pages with a MORE page', () => {
    expect(isSdMoreAvailable(SdPages.Status, true)).toBe(true);
    expect(isSdMoreAvailable(SdPages.Status, false)).toBe(false);
    expect(isSdMoreAvailable(SdPages.Fuel, true)).toBe(false);
  });

  it('toggles the MORE page with the MORE pb, ignores the pb elsewhere', () => {
    expect(sdMoreShownAfterMorePb(SdPages.Status, false, true)).toBe(true);
    expect(sdMoreShownAfterMorePb(SdPages.Status, true, true)).toBe(false);
    expect(sdMoreShownAfterMorePb(SdPages.Status, true, false)).toBe(false);
    expect(sdMoreShownAfterMorePb(SdPages.Crz, false, true)).toBeUndefined();
  });

  it('keeps the MORE page only on its page while it has MORE', () => {
    expect(sdMoreShownToKeep(SdPages.Status, true, true)).toBe(true);
    expect(sdMoreShownToKeep(SdPages.Status, true, false)).toBe(false);
    expect(sdMoreShownToKeep(SdPages.Eng, true, true)).toBe(false);
    expect(sdMoreShownToKeep(SdPages.Status, false, true)).toBe(false);
  });
});

describe('ECP MORE pb light (ecam-cp.xml)', () => {
  it('lights from the MORE page state the FWS writes', () => {
    const xml = readFileSync(
      resolve(
        __dirname,
        '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/ecam-cp.xml',
      ),
      'utf-8',
    );
    const template = xml.slice(
      xml.indexOf('<Template Name="A32NX_ECAM_MORE_BUTTON_Template">'),
      xml.indexOf('</Template>', xml.indexOf('<Template Name="A32NX_ECAM_MORE_BUTTON_Template">')),
    );
    const emissive = template.match(/<SEQ2_EMISSIVE_CODE>([^<]*)<\/SEQ2_EMISSIVE_CODE>/);
    expect(emissive?.[1]).toContain('(L:A32NX_ECAM_SD_MORE_SHOWN, Bool)');
  });
});
