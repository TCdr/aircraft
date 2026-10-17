// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, MappedSubject, Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import {
  isSdMoreAvailable,
  isStatusMoreAvailable,
  sdMoreShownAfterMorePb,
  sdMoreShownToKeep,
} from '@shared/EcamSdMore';
import { automaticPageInFlight, FwsSystemDisplayLogic } from './FwsSystemDisplayLogic';
import { FwsCore } from './FwsCore';

/*
 * STATUS MORE page: MORE at the bottom of the STATUS page, the MORE pb on the ECP shows the STATUS MORE page; pressing
 * it again clears the MORE information page.
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
    // the EWD shows memos (advisory ADV indication)
    ecamEwdShowAdvIndication: Subject.create(false),
    abnormalSensed: { abnormalShown: Subject.create(false) },
    normalChecklists: { checklistShown: Subject.create(false) },
    abnormalNonSensed: { abnProcShown: Subject.create(false) },
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

  return { logic, fws, redundancyLoss, cancelledCaution, showPage, pressMore, moreShown };
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

describe('FwsSystemDisplayLogic ECP MORE pb on the FUEL and WHEEL pages', () => {
  it.each([
    ['FUEL', SdPages.Fuel],
    ['WHEEL', SdPages.Wheel],
  ])('shows and clears the %s MORE page with the MORE pb', (_name, page) => {
    const { showPage, pressMore, moreShown } = setUp();
    showPage(page);
    pressMore();
    expect(moreShown()).toBe(1);
    // the MORE page stays on its page
    showPage(page);
    expect(moreShown()).toBe(1);
    pressMore();
    expect(moreShown()).toBe(0);
  });

  it('clears the WHEEL MORE page when the SD leaves the WHEEL page', () => {
    const { showPage, pressMore, moreShown } = setUp();
    showPage(SdPages.Wheel);
    pressMore();
    expect(moreShown()).toBe(1);
    showPage(SdPages.Fuel);
    expect(moreShown()).toBe(0);
  });

  it('the FUEL and WHEEL pages draw their MORE page from the FWS MORE state', () => {
    const sdPages = resolve(__dirname, '../../../instruments/src/SD/Pages');
    for (const file of ['FuelPage.tsx', 'Wheel/WheelPage.tsx']) {
      const source = readFileSync(resolve(sdPages, file), 'utf-8');
      expect(source, file).toContain("useSimVar('L:A32NX_ECAM_SD_MORE_SHOWN', 'number', 200)");
      expect(source, file).not.toContain('const [showMore] = useState(false)');
      expect(source, file).not.toContain('const moreActive = false');
    }
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
    expect(isSdMoreAvailable(SdPages.Eng, true)).toBe(false);
    // FUEL MORE and WHEEL MORE always exist
    expect(isSdMoreAvailable(SdPages.Fuel, false)).toBe(true);
    expect(isSdMoreAvailable(SdPages.Wheel, false)).toBe(true);
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
    // the MORE page belongs to the page it was shown on
    expect(sdMoreShownToKeep(SdPages.Fuel, true, false, SdPages.Wheel)).toBe(false);
    expect(sdMoreShownToKeep(SdPages.Wheel, true, false, SdPages.Wheel)).toBe(true);
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

/*
 * CRUISE from 1 500 ft or the thrust reduction (whichever comes first) until the gear extension, then WHEEL until the
 * last engine shutdown; not the A320 rules (CRUISE 60 s after T.O power / flaps / spoilers, WHEEL below 16 000 ft
 * only).
 */
describe('FwsSystemDisplayLogic automatic page in flight (phases 8-11)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Phase 8, all engines running with the ENG START selector on NORM, no APU */
  const inFlight = (values: Record<string, number>, pressureAltitude = 20000) => {
    const all: Record<string, number> = {
      'L:XMLVAR_ENG_MODE_SEL': 1,
      'L:A32NX_ENGINE_STATE:1': 1,
      'L:A32NX_ENGINE_STATE:2': 1,
      'L:A32NX_ENGINE_STATE:3': 1,
      'L:A32NX_ENGINE_STATE:4': 1,
      ...values,
    };
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => all[name] ?? 0);
    const { logic, fws } = setUp();
    fws.adrPressureAltitude.set(pressureAltitude);
    const pageWhenUnselected = (logic as unknown as { pageWhenUnselected: Subject<SdPages> }).pageWhenUnselected;
    pageWhenUnselected.set(SdPages.Eng);
    fws.flightPhase.set(8);
    logic.update(100);
    return pageWhenUnselected.get();
  };

  it('CRUISE at once from 1 500 ft with the T.O thrust still set (no 60 s delay)', () => {
    expect(
      inFlight({
        'L:A32NX_AUTOTHRUST_TLA:4': 40,
        'ENG N1 RPM:1': 80,
        'ENG N1 RPM:2': 80,
        'ENG N1 RPM:3': 80,
        'ENG N1 RPM:4': 80,
        'L:A32NX_FLAPS_HANDLE_INDEX': 2,
      }),
    ).toBe(SdPages.Crz);
  });

  it('WHEEL after the landing gear extension, also above 16 000 ft', () => {
    expect(inFlight({ 'GEAR TOTAL PCT EXTENDED': 100 }, 20000)).toBe(SdPages.Wheel);
  });

  it('WHEEL with the gear down, CRUISE with the gear up', () => {
    expect(automaticPageInFlight(true)).toBe(SdPages.Wheel);
    expect(automaticPageInFlight(false)).toBe(SdPages.Crz);
  });
});

describe('FwsSystemDisplayLogic ECAM advisory (ADVISORY)', () => {
  /** The simvars the logic reads and writes (SimVar.GetSimVarValue / SetSimVarValue) */
  let values: Record<string, number>;

  beforeEach(() => {
    values = { 'L:XMLVAR_ENG_MODE_SEL': 1 };
    for (let engine = 1; engine <= 4; engine++) {
      // four running engines in NORM mode, all parameters in range
      values[`L:A32NX_ENGINE_STATE:${engine}`] = 1;
      values[`L:A32NX_ENGINE_OIL_QTY:${engine}`] = 15;
      values[`GENERAL ENG OIL TEMPERATURE:${engine}`] = 120;
    }
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => values[name] ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
      values[name] = value;
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const pageShown = () => values['L:A32NX_ECAM_SD_PAGE_TO_SHOW'];
  // the ECP pb light: the SD page index + 1 (0: none)
  const advisoryPb = () => values['L:A380X_ECAM_SD_ADVISORY_PB'];

  it('shows the ENGINE page in flight phase mode on an engine advisory, its ECP pb lit and ADV on the EWD', () => {
    const { logic, fws } = setUp();
    fws.flightPhase.set(9); // cruise above 1 500 ft, gear up: the CRUISE page
    simvars.set('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', SdPages.None);
    logic.update(50);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Crz);
    expect(fws.ecamEwdShowAdvIndication.get()).toBe(false);

    values['GENERAL ENG OIL TEMPERATURE:3'] = 170;
    logic.update(50);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Eng);
    expect(advisoryPb()).toBe(SdPages.Eng + 1);
    expect(fws.ecamEwdShowAdvIndication.get()).toBe(true);

    // back in range: the CRUISE page again, no light, no ADV
    values['GENERAL ENG OIL TEMPERATURE:3'] = 120;
    logic.update(50);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Crz);
    expect(advisoryPb()).toBe(0);
    expect(fws.ecamEwdShowAdvIndication.get()).toBe(false);
  });

  it('keeps a page selected by the crew, with ADV on the EWD', () => {
    const { logic, fws } = setUp();
    fws.flightPhase.set(9);
    simvars.set('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', SdPages.Fuel);
    values['GENERAL ENG OIL TEMPERATURE:3'] = 170;
    logic.update(50);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Fuel);
    expect(fws.ecamEwdShowAdvIndication.get()).toBe(true);
  });

  it('gives no advisory indication while the SD shows the page of an ECAM alert', () => {
    const { logic, fws } = setUp();
    fws.flightPhase.set(9);
    simvars.set('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', SdPages.None);
    simvars.set('L:A32NX_ECAM_SFAIL', SdPages.Hyd);
    values['GENERAL ENG OIL TEMPERATURE:3'] = 170;
    logic.update(50);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Hyd);
    expect(fws.ecamEwdShowAdvIndication.get()).toBe(false);
  });
});

/*
 * SD page priority, highest first: the page the crew selects with an ECP system page pb, the page of an alert, the
 * page of an advisory, the flight phase page. Only a second press of the pb removes the crew page.
 */
describe('FwsSystemDisplayLogic page selected by the crew vs the page of an ECAM alert', () => {
  /** The simvars the logic reads and writes (SimVar.GetSimVarValue / SetSimVarValue) */
  let values: Record<string, number>;

  beforeEach(() => {
    // On the ground before engine start (flight phase 1): engines off, ENG START selector on NORM, no APU
    values = { 'L:XMLVAR_ENG_MODE_SEL': 1 };
    for (let engine = 1; engine <= 4; engine++) {
      values[`L:A32NX_ENGINE_STATE:${engine}`] = 0;
      values[`L:A32NX_ENGINE_OIL_QTY:${engine}`] = 15;
      values[`GENERAL ENG OIL TEMPERATURE:${engine}`] = 20;
    }
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => values[name] ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
      values[name] = value;
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const pageShown = () => values['L:A32NX_ECAM_SD_PAGE_TO_SHOW'];
  /** The ECP system page pb lit by the crew selection (ecam-cp.xml), SdPages.None when none */
  const crewSelection = () => simvars.get('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX');

  /** The FWS in flight phase 1, the SD on its automatic page (DOOR) */
  const onGroundBeforeEngineStart = () => {
    const setup = setUp();
    setup.fws.flightPhase.set(1);
    simvars.set('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', SdPages.None);
    setup.logic.update(50);
    setup.logic.update(50);
    expect(pageShown()).toBe(SdPages.Door);
    return setup;
  };

  /** The page the ECAM alert on top of the EWD calls (L:A32NX_ECAM_SFAIL), SdPages.None once cleared or gone */
  const alertPage = (logic: FwsSystemDisplayLogic, page: SdPages) => {
    simvars.set('L:A32NX_ECAM_SFAIL', page);
    logic.update(50);
    logic.update(50);
  };

  it('keeps the page selected with an ECP pb when an alert calls another page, and after the alert is cleared', () => {
    const { logic, showPage } = onGroundBeforeEngineStart();
    showPage(SdPages.Wheel);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Wheel);

    alertPage(logic, SdPages.Bleed);
    expect(pageShown()).toBe(SdPages.Wheel);
    expect(crewSelection()).toBe(SdPages.Wheel);

    // The alert is cleared (or the failure is gone): the crew page stays, not the phase 1 DOOR page
    alertPage(logic, SdPages.None);
    expect(pageShown()).toBe(SdPages.Wheel);
    expect(crewSelection()).toBe(SdPages.Wheel);
  });

  it('shows the alert page once the crew removes its page with a second pb press', () => {
    const { logic, showPage } = onGroundBeforeEngineStart();
    showPage(SdPages.Wheel);
    alertPage(logic, SdPages.Bleed);

    showPage(SdPages.None);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Bleed);
  });

  it('shows the alert page at once without a crew page, then the flight phase page after the alert', () => {
    const { logic } = onGroundBeforeEngineStart();
    simvars.set('L:A32NX_ECAM_SFAIL', SdPages.Bleed);
    logic.update(50);
    expect(pageShown()).toBe(SdPages.Bleed);

    alertPage(logic, SdPages.None);
    expect(pageShown()).toBe(SdPages.Door);
  });

  it('replaces the STATUS page (not an ECP system page pb) with the page of a new alert', () => {
    const { logic, showPage } = onGroundBeforeEngineStart();
    showPage(SdPages.Status);
    alertPage(logic, SdPages.Bleed);
    expect(pageShown()).toBe(SdPages.Bleed);
    expect(crewSelection()).toBe(SdPages.None);
  });
});
