// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { FmgcFlightPhase } from '@shared/flightphase';

import type { FlightManagementComputer } from './FlightManagementComputer';
import { FMS_PRINT_EVENT, FlightPlanReport, FmsPrintEvents, FmsPrintPage, FmsPrinter } from './FmsPrinter';
import { NXSystemMessages } from '../shared/NXSystemMessages';

const { pedestalPrint, pedestalAvailable, pedestalUpdate } = vi.hoisted(() => ({
  pedestalPrint: vi.fn(),
  pedestalAvailable: vi.fn(() => true),
  pedestalUpdate: vi.fn(),
}));

// The FMC module is not loaded: the printer only needs its company wind request states
vi.mock('./FlightManagementComputer', () => ({ CompanyWindRequestState: { None: 0, Pending: 1, Received: 2 } }));
vi.mock('./PedestalPrinter', () => ({
  PedestalPrinter: class {
    print = pedestalPrint;

    isAvailable = pedestalAvailable;

    update = pedestalUpdate;
  },
}));

const WIND_RECEIVED = 2;

/**
 * The sim variables of a test. The SDK modules install the sim's own SimVar functions, which read through the mocked
 * simvar.getValueReg (always 0), so the tests keep their own values.
 */
const simVars = new Map<string, number | boolean>();

/** A performance data field for every name, null unless given */
const performanceData = (values: Record<string, unknown>) =>
  new Proxy({} as Record<string | symbol, Subject<unknown>>, {
    get: (fields, name) => (fields[name] ??= Subject.create(name in values ? values[name as string] : null)),
  });

const leg = (ident: string, extra: Record<string, unknown> = {}) => ({ isDiscontinuity: false, ident, ...extra });

const flightPlan = (overrides: Record<string, unknown> = {}) => ({
  originAirport: { ident: 'LFPG' },
  destinationAirport: { ident: 'EGLL' },
  alternateDestinationAirport: { ident: 'EGKK' },
  flightNumber: Subject.create('AFR1234'),
  originRunway: { ident: 'RW09L' },
  destinationRunway: { ident: 'RW27R' },
  allLegs: [leg('LFPG'), leg('OPALE'), leg('EGLL')],
  activeLegIndex: 1,
  originSegment: { legCount: 1 },
  departureRunwayTransitionSegment: { legCount: 0 },
  departureSegment: { legCount: 0 },
  departureEnrouteTransitionSegment: { legCount: 0 },
  enrouteSegment: { legCount: 1 },
  performanceData: performanceData({
    costIndex: 50,
    cruiseFlightLevel: 350,
    zeroFuelWeight: 380,
    zeroFuelWeightCenterOfGravity: 38.5,
    blockFuel: 120,
    taxiFuel: 1.2,
    v1: 150,
    vr: 155,
    v2: 160,
    climbWindEntries: [],
    descentWindEntries: [],
  }),
  ...overrides,
});

let flightPhase: FmgcFlightPhase;
let onGround: boolean;
let plans: Map<FlightPlanIndex, ReturnType<typeof flightPlan>>;
let cpnyFplnAvailable: Subject<boolean>;
let windRequestState: Subject<number>;
let pages: FmsPrintPage[];
let printer: FmsPrinter;
const addMessageToQueue = vi.fn();

const setEnginesRunning = (running: boolean) => {
  for (let i = 1; i <= 4; i++) {
    simVars.set(`L:A32NX_ENGINE_N2:${i}`, running ? 60 : 0);
  }
};

const titles = () => pages.map((p) => p.title);
const lastPage = () => pages[pages.length - 1];

beforeEach(() => {
  simVars.clear();
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
    simVars.set(name, value);
    return Promise.resolve();
  });
  vi.spyOn(NavigationDatabaseService, 'activeDatabase', 'get').mockReturnValue({
    getDatabaseIdent: () => Promise.resolve(null),
  } as unknown as typeof NavigationDatabaseService.activeDatabase);
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no VFS in the tests')));
  NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').set(true);

  // 26 SEP 26, 14:05 UTC
  simVars.set('E:ZULU DAY OF MONTH', 26);
  simVars.set('E:ZULU MONTH OF YEAR', 9);
  simVars.set('E:ZULU YEAR', 2026);
  simVars.set('E:ZULU TIME', 14 * 3600 + 5 * 60);

  flightPhase = FmgcFlightPhase.Preflight;
  onGround = true;
  plans = new Map([[FlightPlanIndex.Active, flightPlan()]]);
  cpnyFplnAvailable = Subject.create(false);
  windRequestState = Subject.create(0);
  pedestalPrint.mockClear();
  pedestalAvailable.mockReset();
  pedestalAvailable.mockReturnValue(true);
  pedestalUpdate.mockClear();
  addMessageToQueue.mockClear();

  const fmc = {
    fmgc: {
      data: { cpnyFplnAvailable, companyRouteIdent: () => Subject.create(null) },
      getFlightPhase: () => flightPhase,
      isOnGround: () => onGround,
      getGrossWeightCg: () => 30.5,
      getFOB: () => 118,
      getGrossWeightKg: () => 498_000,
    },
    companyWindRequestState: () => windRequestState,
    flightPlanInterface: { has: (i: FlightPlanIndex) => plans.has(i), get: (i: FlightPlanIndex) => plans.get(i) },
    guidanceController: { vnavDriver: { getDestinationPrediction: () => null, mcduProfile: undefined } },
    lastSequencedWaypoint: null,
    getTakeoffWeight: () => 498_000,
    getTripFuel: () => 80_000,
    getRouteReserveFuel: () => 4_000,
    getLandingWeight: () => 418_000,
    getExtraFuel: () => 5_000,
    addMessageToQueue,
  } as unknown as FlightManagementComputer;

  const bus = new EventBus();
  pages = [];
  bus
    .getSubscriber<FmsPrintEvents>()
    .on(FMS_PRINT_EVENT)
    .handle((page) => pages.push(page));
  printer = new FmsPrinter(fmc, bus);
  setEnginesRunning(false);
  printer.update();
});

afterEach(() => {
  printer.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FmsPrinter (A380 FCOM DSC-22-FMS-10-70, DATA / PRINTER page)', () => {
  describe('report availability (DSC-22-FMS-20-30 P 76-77)', () => {
    it('gives the PRE-FLIGHT report in the PREFLIGHT phase, with the flight plan', () => {
      expect(printer.preFlightAvailable.get()).toBe(true);
      plans.set(FlightPlanIndex.Active, flightPlan({ destinationAirport: undefined }));
      flightPhase = FmgcFlightPhase.Takeoff;
      printer.update();
      flightPhase = FmgcFlightPhase.Preflight;
      printer.update();
      expect(printer.preFlightAvailable.get()).toBe(false);
    });

    it('gives the IN-FLIGHT report from TAKEOFF, with the engines running', () => {
      expect(printer.inFlightAvailable.get()).toBe(false);
      setEnginesRunning(true);
      printer.update();
      expect(printer.inFlightAvailable.get()).toBe(false);
      flightPhase = FmgcFlightPhase.Takeoff;
      printer.update();
      expect(printer.inFlightAvailable.get()).toBe(true);
      flightPhase = FmgcFlightPhase.Done;
      setEnginesRunning(false);
      printer.update();
      expect(printer.inFlightAvailable.get()).toBe(false);
    });

    it('gives the POST-FLIGHT report after the engines are shut down, until the next flight', () => {
      expect(printer.postFlightAvailable.get()).toBe(false);
      setEnginesRunning(true);
      printer.update();
      expect(printer.postFlightAvailable.get()).toBe(false);
      flightPhase = FmgcFlightPhase.Done;
      setEnginesRunning(false);
      printer.update();
      expect(printer.postFlightAvailable.get()).toBe(true);
      flightPhase = FmgcFlightPhase.Preflight;
      printer.update();
      expect(printer.postFlightAvailable.get()).toBe(false);
    });
  });

  describe('automatic prints (P 4-5 and P 9)', () => {
    it('prints nothing by itself with no option selected (AMI default)', () => {
      setEnginesRunning(true);
      printer.update();
      flightPhase = FmgcFlightPhase.Takeoff;
      printer.update();
      setEnginesRunning(false);
      printer.update();
      cpnyFplnAvailable.set(true);
      windRequestState.set(WIND_RECEIVED);
      expect(pages).toEqual([]);
    });

    it('prints the pre-flight report at engine start, the in-flight one at TAKEOFF, the post-flight one at shutdown', () => {
      printer.autoPrint.preFlight.set(true);
      printer.autoPrint.inFlight.set(true);
      printer.autoPrint.postFlight.set(true);
      setEnginesRunning(true);
      printer.update();
      flightPhase = FmgcFlightPhase.Takeoff;
      printer.update();
      flightPhase = FmgcFlightPhase.Done;
      setEnginesRunning(false);
      printer.update();
      expect(titles()).toEqual([
        'FM ACTIVE PREFLIGHT REPORT',
        'FM ACTIVE INFLIGHT REPORT',
        'FM ACTIVE POSTFLIGHT REPORT',
      ]);
    });

    it('prints the company flight plan and wind data at reception', () => {
      plans.set(FlightPlanIndex.Uplink, flightPlan({ flightNumber: Subject.create('CPNY01') }));
      printer.autoPrint.cpnyInit.set(true);
      printer.autoPrint.cpnyWind.set(true);
      cpnyFplnAvailable.set(true);
      windRequestState.set(WIND_RECEIVED);
      expect(titles()).toEqual(['FM COMPANY FLIGHT PLAN INITIALIZATION DATA', 'FM ACTIVE WIND DATA']);
      expect(pages[0].lines.some((l) => l.includes('CPNY01'))).toBe(true);
    });
  });

  describe('printer availability', () => {
    it('handles the printer control panel buttons in its update', () => {
      pedestalUpdate.mockClear();
      printer.update();
      expect(pedestalUpdate).toHaveBeenCalledTimes(1);
    });

    it('shows PRINTER NOT AVAIL and prints nothing while the printer is off or unpowered (DSC-22-FMS-20-110 P 23)', () => {
      pedestalAvailable.mockReturnValue(false);
      expect(printer.isAvailable()).toBe(false);
      printer.printTakeoffData();
      printer.printText('ATC COM ATIS LFBO DEP', ['  LFBO DEP ATIS R   1145Z']);
      expect(pedestalPrint).not.toHaveBeenCalled();
      expect(pages).toEqual([]);
      expect(addMessageToQueue).toHaveBeenCalledWith(NXSystemMessages.printerNotAvail);
    });

    it('prints without a message while the printer is available', () => {
      expect(printer.isAvailable()).toBe(true);
      printer.printTakeoffData();
      expect(pedestalPrint).toHaveBeenCalledTimes(1);
      expect(addMessageToQueue).not.toHaveBeenCalled();
    });
  });

  describe('pages', () => {
    it('prints on the pedestal printer and sends the page to the flypad', () => {
      printer.printTakeoffData();
      expect(titles()).toEqual(['FM ACTIVE TAKE-OFF DATA']);
      expect(pedestalPrint).toHaveBeenCalledWith(lastPage().lines);
      expect(lastPage().utcSeconds).toBe(14 * 3600 + 5 * 60);
    });

    it('starts every page with the title, the UTC date and the time', () => {
      printer.printInitData();
      const [rule, title, time] = lastPage().lines;
      expect(rule).toBe('='.repeat(64));
      expect(title).toMatch(/^ FM ACTIVE FLIGHT PLAN INITIALIZATION DATA +DATE: 26 SEP 26$/);
      expect(time).toMatch(/TIME: 14:05$/);
    });

    it.each([
      ['F-PLN INIT', () => printer.printInitData()],
      ['T.O DATA', () => printer.printTakeoffData()],
      ['WIND DATA', () => printer.printWindData()],
      ['PRE-FLIGHT', () => printer.printFlightPlanReport(FlightPlanIndex.Active, FlightPlanReport.PreFlight)],
      ['IN-FLIGHT', () => printer.printFlightPlanReport(FlightPlanIndex.Active, FlightPlanReport.InFlight)],
      ['POST-FLIGHT', () => printer.printFlightPlanReport(FlightPlanIndex.Active, FlightPlanReport.PostFlight)],
    ])('fits the %s page in the 64 columns of the printer', (_, print) => {
      print();
      const tooLong = lastPage().lines.filter((l) => l.length > 64);
      expect(tooLong).toEqual([]);
    });

    it('prints dashes for the data the FMS does not have', () => {
      plans.set(
        FlightPlanIndex.Active,
        flightPlan({ flightNumber: Subject.create(null), performanceData: performanceData({ climbWindEntries: [] }) }),
      );
      printer.printTakeoffData();
      const lines = lastPage().lines.join('\n');
      expect(lines).toMatch(/V1 {3}: ---/);
      expect(lines).toMatch(/TO SHIFT {3}: ---- M/);
      printer.printInitData();
      expect(lastPage().lines.join('\n')).toMatch(/FLT NUMBER : ----------/);
    });

    it('prints the weights in the selected unit (T or KLB, as on the FUEL&LOAD page)', () => {
      printer.printInitData();
      expect(lastPage().lines.join('\n')).toMatch(/ZFW {8}: 380\.0/);
      NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').set(false);
      printer.printInitData();
      expect(lastPage().lines.join('\n')).toMatch(/ZFW {8}: 837\.8/);
    });

    it('names a secondary report after its secondary flight plan', () => {
      plans.set(FlightPlanIndex.FirstSecondary + 1, flightPlan());
      printer.printFlightPlanReport(FlightPlanIndex.FirstSecondary + 1, FlightPlanReport.PreFlight);
      expect(lastPage().title).toBe('FM SECONDARY 2 PREFLIGHT REPORT');
    });

    it('prints the page of another function with the same header (ATC COM ATIS)', () => {
      printer.printText('ATC COM ATIS LFBO DEP', ['  LFBO DEP ATIS R   1145Z']);
      expect(titles()).toEqual(['ATC COM ATIS LFBO DEP']);
      const lines = lastPage().lines;
      expect(lines[1]).toMatch(/^ ATC COM ATIS LFBO DEP +DATE: 26 SEP 26$/);
      expect(lines).toContain('  LFBO DEP ATIS R   1145Z');
      expect(lines[lines.length - 1]).toBe('='.repeat(64));
      expect(pedestalPrint).toHaveBeenCalledWith(lines);
    });

    it('prints nothing for a flight plan that does not exist', () => {
      printer.printFlightPlanReport(FlightPlanIndex.FirstSecondary, FlightPlanReport.PreFlight);
      printer.printInitData(FlightPlanIndex.Uplink);
      expect(pages).toEqual([]);
    });
  });

  describe('flight plan reports (P 4-9)', () => {
    const report = (type: FlightPlanReport) => {
      printer.printFlightPlanReport(FlightPlanIndex.Active, type);
      return lastPage().lines.join('\n');
    };

    it('has the predictions and the fuel predictions before the flight', () => {
      const text = report(FlightPlanReport.PreFlight);
      expect(text).toContain('PREDICTED VALUES');
      expect(text).toContain('FUEL PREDICTIONS');
      expect(text).toContain('CRZ FL 1 : FL350');
      expect(text).not.toContain('HISTORY VALUES');
    });

    it('has the history, the predictions and the fuel information in flight', () => {
      const text = report(FlightPlanReport.InFlight);
      expect(text).toContain('HISTORY VALUES');
      expect(text).toContain('PREDICTED VALUES');
      expect(text).toContain('FUEL INFORMATION AT 14:05');
      expect(text).toContain('FMS 1: FMC-A P/N STATUS');
    });

    it('has the fuel and time summary and the IRS data after the flight, without predictions', () => {
      const text = report(FlightPlanReport.PostFlight);
      expect(text).toContain('FUEL AND TIME SUMMARY');
      expect(text).toContain('IRS DATA');
      expect(text).not.toContain('PREDICTED VALUES');
      expect(text).not.toContain('CRUISE FL/STEP');
    });

    it('records the engine start, takeoff, landing and engine shutdown times and fuel of the flight', () => {
      const at = (hours: number, minutes: number) => simVars.set('E:ZULU TIME', hours * 3600 + minutes * 60);
      at(10, 0);
      setEnginesRunning(true);
      printer.update();
      at(10, 20);
      onGround = false;
      printer.update();
      at(11, 50);
      onGround = true;
      printer.update();
      at(12, 0);
      setEnginesRunning(false);
      printer.update();

      const text = report(FlightPlanReport.PostFlight);
      expect(text).toMatch(/TIME {3}: 10:00 +TIME {5}: 12:00/);
      expect(text).toMatch(/TO TIME: 10:20 +LDG TIME : 11:50/);
      expect(text).toMatch(/FUEL {3}: 118\.0 +FUEL {5}: 118\.0/);
    });
  });
});
