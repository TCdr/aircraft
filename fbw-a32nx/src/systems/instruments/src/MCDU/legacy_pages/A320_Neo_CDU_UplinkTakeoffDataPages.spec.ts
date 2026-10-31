// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CDUUplinkTakeoffDataPages } from './A320_Neo_CDU_UplinkTakeoffDataPages';

const PAGE_IDS = { UplinkToDataReq: 7, UplinkToData: 8 };

const simVars: Record<string, number> = {};

beforeAll(() => {
  vi.stubGlobal('SimVar', { GetSimVarValue: (name: string) => simVars[name] ?? 0 });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const field = <T>(value: T) => ({ get: () => value });

/** The FMS data both screens share */
function createFms(airport: string | null = 'LFPG', runway: string | null = 'LFPG27L') {
  const plan = {
    originAirport: airport !== null ? { ident: airport } : undefined,
    originRunway: runway !== null ? { ident: runway } : undefined,
    performanceData: {
      takeoffShift: field(null as number | null),
      takeoffFlaps: field(1 as number | null),
      trimmableHorizontalStabilizer: field(1.5 as number | null),
      flexTakeoffTemperature: field(null as number | null),
      zeroFuelWeight: field(null),
    },
  };
  const uplinkTakeoffData = {
    requestPending: field(false),
    runways: () => [],
    find: () => undefined,
    opensOnFlexPage: () => false,
  };
  const createScreen = () =>
    ({
      page: { Current: 0, ...PAGE_IDS },
      onLeftInput: [] as any[],
      onRightInput: [] as any[],
      leftInputDelay: [] as any[],
      rightInputDelay: [] as any[],
      pageUpdate: () => {},
      pageRedrawCallback: undefined,
      clearDisplay: vi.fn(),
      setTemplate: vi.fn(),
      setArrows: vi.fn(),
      setScratchpadMessage: vi.fn(),
      getDelaySwitchPage: vi.fn(),
      getFlightPlan: () => plan,
      uplinkTakeoffData,
      computeTakeoffWeight: () => ({ takeoffWeight: null }),
      getCG: () => 25,
      flightPhaseManager: { phase: 0 },
    }) as any;
  return { plan, createScreen };
}

/** The first runway of the request, as sent to the dispatcher */
const firstRunwayRequest = (mcdu: any) => CDUUplinkTakeoffDataPages.requestContent(mcdu).runways[0];

describe('UPLINK TO DATA timer on two screens', () => {
  it('both screens on the REQ page refresh every 50 updates', () => {
    const fms = createFms();
    const cpt = fms.createScreen();
    const fo = fms.createScreen();
    CDUUplinkTakeoffDataPages.ShowRequestPage(cpt);
    CDUUplinkTakeoffDataPages.ShowRequestPage(fo);
    cpt.clearDisplay.mockClear();
    fo.clearDisplay.mockClear();

    for (let i = 0; i < 50; i++) {
      cpt.pageUpdate();
      fo.pageUpdate();
    }

    expect(cpt.clearDisplay).toHaveBeenCalled();
    expect(fo.clearDisplay).toHaveBeenCalled();
  });
});

describe('UPLINK TO DATA REQ form', () => {
  beforeEach(() => {
    Object.keys(simVars).forEach((k) => delete simVars[k]);
    // The form is static: each test starts without the one of the previous test
    (CDUUplinkTakeoffDataPages as any).form = null;
  });

  it('the F-PLN runway fills the page 1 defaults', () => {
    const fms = createFms();
    fms.plan.performanceData.takeoffFlaps = field(2);
    const mcdu = fms.createScreen();

    expect(firstRunwayRequest(mcdu)).toMatchObject({ runway: '27L', flaps: 2 });
  });

  it('a new origin runway refills the defaults', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    expect(firstRunwayRequest(mcdu).runway).toBe('27L');

    fms.plan.originRunway = { ident: 'LFPG09R' };
    fms.plan.performanceData.takeoffFlaps = field(3);

    expect(firstRunwayRequest(mcdu)).toMatchObject({ runway: '09R', flaps: 3 });
  });

  it('a runway entered by the pilot is not replaced by the F-PLN runway', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu);
    mcdu.onRightInput[0]('26R', vi.fn());

    fms.plan.originRunway = { ident: 'LFPG09R' };

    expect(firstRunwayRequest(mcdu).runway).toBe('26R');
  });

  it('a refill drops the TO LIMIT and CONTAM of the previous runway', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    expect(firstRunwayRequest(mcdu).runway).toBe('27L');
    // Entries through the page set the edited flag, so the stale values are put in the form directly
    const first = (CDUUplinkTakeoffDataPages as any).form.runways[0];
    first.toLimit = 2500;
    first.contamination = 3;
    expect(firstRunwayRequest(mcdu)).toMatchObject({ toLimit: 2500, runwayCondition: 3 });

    fms.plan.originRunway = { ident: 'LFPG09R' };

    expect(firstRunwayRequest(mcdu)).toMatchObject({ runway: '09R', toLimit: null, runwayCondition: 0 });
  });

  it('a page 1 entry without runway is not wiped by a new origin runway', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu);
    mcdu.onRightInput[3]('55', vi.fn());

    fms.plan.originRunway = { ident: 'LFPG09R' };
    CDUUplinkTakeoffDataPages.requestContent(mcdu);

    const [first] = (CDUUplinkTakeoffDataPages as any).form.runways;
    expect(first).toMatchObject({ runway: '27L', flex: 55 });
  });

  it('a moment without origin airport keeps the form', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu);
    mcdu.onRightInput[0]('26R', vi.fn());
    mcdu.onLeftInput[1]('1020', vi.fn());

    fms.plan.originAirport = undefined;
    fms.plan.originRunway = undefined;
    CDUUplinkTakeoffDataPages.requestContent(mcdu);
    fms.plan.originAirport = { ident: 'LFPG' };
    fms.plan.originRunway = { ident: 'LFPG27L' };

    expect(firstRunwayRequest(mcdu)).toMatchObject({ runway: '26R', qnh: 1020 });
  });

  it('the QNH follows the sim until the pilot enters it', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    simVars['KOHLSMAN SETTING MB:1'] = 1013;
    expect(firstRunwayRequest(mcdu).qnh).toBe(1013);

    simVars['KOHLSMAN SETTING MB:1'] = 1005;
    expect(firstRunwayRequest(mcdu).qnh).toBe(1005);

    CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu);
    mcdu.onLeftInput[1]('1020', vi.fn());
    simVars['KOHLSMAN SETTING MB:1'] = 1000;
    expect(firstRunwayRequest(mcdu).qnh).toBe(1020);
  });

  it('the wind follows the sim until the pilot enters it', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    simVars['AMBIENT WIND VELOCITY'] = 10;
    expect(firstRunwayRequest(mcdu).windSpeed).toBe(10);

    simVars['AMBIENT WIND VELOCITY'] = 20;
    expect(firstRunwayRequest(mcdu).windSpeed).toBe(20);

    CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu);
    mcdu.onLeftInput[2]('270/15', vi.fn());
    simVars['AMBIENT WIND VELOCITY'] = 30;
    expect(firstRunwayRequest(mcdu)).toMatchObject({ windDirection: 270, windSpeed: 15 });
  });

  it('a new origin airport forgets the whole form', () => {
    const fms = createFms();
    const mcdu = fms.createScreen();
    CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu);
    mcdu.onRightInput[0]('26R', vi.fn());
    mcdu.onLeftInput[1]('1020', vi.fn());
    expect(firstRunwayRequest(mcdu)).toMatchObject({ runway: '26R', qnh: 1020 });

    fms.plan.originAirport = { ident: 'EGLL' };
    fms.plan.originRunway = { ident: 'EGLL27R' };
    simVars['KOHLSMAN SETTING MB:1'] = 1008;

    expect(firstRunwayRequest(mcdu)).toMatchObject({ runway: '27R', qnh: 1008 });
  });
});
