// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FltOpsPerformanceSession, missingFltOpsStsFields } from './FltOpsPerformanceSession';
import { LoadsheetComputation, LoadsheetResults } from './Loadsheet';
import { TakeoffComputation, TakeoffResults } from './TakeoffPerformance';
import { LandingComputation, LandingResults } from './LandingPerformance';
import { deleteAircraftStatusItem } from './AircraftStatus';
import { LogbookItem, createTechLogbook } from '../TechLogbook';

const CERTIFIED = { mtow: 510_000, mlw: 395_000 };

const session = (): FltOpsPerformanceSession => new FltOpsPerformanceSession(CERTIFIED, () => true);

const loadsheetComputation = (tow: number, lw: number): LoadsheetComputation => ({
  results: { tow, lw } as LoadsheetResults,
  errors: [],
});

const takeoffComputation = (mtowPerf: number | null): TakeoffComputation => ({
  results: { mtowPerf } as TakeoffResults,
  errors: [],
});

const landingComputation = (mlwPerf: number | null): LandingComputation => ({
  results: { mlwPerf } as LandingResults,
  errors: [],
});

describe('FLT OPS performance applications', () => {
  describe('T.O PERF', () => {
    it('starts on the FROM airport (yellow) with the maximum structural TOW', () => {
      const s = session();
      s.onTakeoffPerfShown('LFBO');
      expect(s.takeoff.airport.get()).toBe('LFBO');
      expect(s.takeoff.airportFromSts.get()).toBe(true);
      expect(s.takeoff.tow.get()).toBe(510_000);
      expect(s.takeoff.towFromLoadsheet.get()).toBe(false);
    });

    it('takes the TOW of each new LOADSHEET computation once, rounded up (yellow)', () => {
      const s = session();
      s.onLoadsheetComputed(loadsheetComputation(450_201, 380_000));
      s.onTakeoffPerfShown('LFBO');
      expect(s.takeoff.tow.get()).toBe(450_300);
      expect(s.takeoff.towFromLoadsheet.get()).toBe(true);

      // The crew changes the TOW: switching back to T.O PERF keeps it until a new LOADSHEET computation
      s.takeoff.tow.set(460_000);
      s.takeoff.towFromLoadsheet.set(false);
      s.onTakeoffPerfShown('LFBO');
      expect(s.takeoff.tow.get()).toBe(460_000);
      s.onLoadsheetComputed(loadsheetComputation(455_000, 380_000));
      s.onTakeoffPerfShown('LFBO');
      expect(s.takeoff.tow.get()).toBe(455_000);
    });

    it('goes standalone on another airport: entries reset, TOW = MSTOW, no LOADSHEET link', () => {
      const s = session();
      s.onTakeoffPerfShown('LFBO');
      s.takeoff.oat.set(20);
      s.takeoff.runwayIdent.set('14R');
      s.onTakeoffAirportEntered('LFPG');
      expect(s.takeoff.standalone.get()).toBe(true);
      expect(s.takeoff.airportFromSts.get()).toBe(false);
      expect(s.takeoff.oat.get()).toBeNull();
      expect(s.takeoff.runwayIdent.get()).toBeNull();
      expect(s.takeoff.tow.get()).toBe(510_000);

      s.onLoadsheetComputed(loadsheetComputation(450_000, 380_000));
      s.onTakeoffPerfShown('LFBO');
      expect(s.takeoff.tow.get()).toBe(510_000);
      expect(s.takeoff.airport.get()).toBe('LFPG');

      s.onTakeoffComputed(takeoffComputation(480_000));
      s.onLoadsheetShown();
      expect(s.loadsheet.mtow.get()).toBe(510_000);
      expect(s.loadsheet.mtowFromTakeoffPerf.get()).toBe(false);
    });

    it('gives its MTOW(perf) to LOADSHEET when not above the certified MTOW', () => {
      const s = session();
      s.onLoadsheetShown();
      expect(s.loadsheet.mtow.get()).toBe(510_000);
      s.onTakeoffComputed(takeoffComputation(520_000));
      s.onLoadsheetShown();
      expect(s.loadsheet.mtow.get()).toBe(510_000);
      expect(s.loadsheet.mtowFromTakeoffPerf.get()).toBe(false);
      s.onTakeoffComputed(takeoffComputation(480_000));
      s.onLoadsheetShown();
      expect(s.loadsheet.mtow.get()).toBe(480_000);
      expect(s.loadsheet.mtowFromTakeoffPerf.get()).toBe(true);
    });
  });

  describe('LDG PERF', () => {
    it('starts on the TO airport with the maximum structural LW, then always takes the LOADSHEET LW', () => {
      const s = session();
      s.onLandingPerfShown('RJTT');
      expect(s.landing.airport.get()).toBe('RJTT');
      expect(s.landing.lw.get()).toBe(395_000);
      s.onLoadsheetComputed(loadsheetComputation(450_000, 380_050));
      s.onLandingPerfShown('RJTT');
      expect(s.landing.lw.get()).toBe(380_100);
      expect(s.landing.lwFromLoadsheet.get()).toBe(true);
      s.landing.lw.set(390_000);
      s.landing.lwFromLoadsheet.set(false);
      s.onLandingPerfShown('RJTT');
      expect(s.landing.lw.get()).toBe(380_100);
    });

    it('goes standalone on another airport', () => {
      const s = session();
      s.onLoadsheetComputed(loadsheetComputation(450_000, 380_000));
      s.onLandingPerfShown('RJTT');
      s.onLandingAirportEntered('RJAA');
      expect(s.landing.standalone.get()).toBe(true);
      expect(s.landing.lw.get()).toBe(395_000);
      s.onLandingPerfShown('RJTT');
      expect(s.landing.lw.get()).toBe(395_000);
    });

    it('gives its MLW(perf) to LOADSHEET when not above the certified MLW', () => {
      const s = session();
      s.onLandingComputed(landingComputation(400_000));
      s.onLoadsheetShown();
      expect(s.loadsheet.mlw.get()).toBe(395_000);
      s.onLandingComputed(landingComputation(390_000));
      s.onLoadsheetShown();
      expect(s.loadsheet.mlw.get()).toBe(390_000);
      expect(s.loadsheet.mlwFromLandingPerf.get()).toBe(true);
    });
  });

  describe('return to an open application', () => {
    const allowed = (): LoadsheetComputation => ({
      results: { zfwOutOfLimits: false, towOutOfLimits: false, lwOutOfLimits: false } as LoadsheetResults,
      errors: [],
    });

    it('brings LOADSHEET back on the view the crew left while what it shows still exists', () => {
      const s = session();
      s.onLoadsheetComputed(allowed());
      s.loadsheet.view.set('edition');
      s.loadsheet.restoreView();
      expect(s.loadsheet.view.get()).toBe('edition');

      s.loadsheet.report.set(['LOADSHEET FINAL']);
      s.loadsheet.view.set('display');
      s.loadsheet.restoreView();
      expect(s.loadsheet.view.get()).toBe('display');
    });

    it('goes back to the LOADSHEET view when the computation or the report was deleted meanwhile', () => {
      const s = session();
      s.loadsheet.view.set('edition');
      s.loadsheet.restoreView();
      expect(s.loadsheet.view.get()).toBe('loadsheet');

      s.onLoadsheetComputed(allowed());
      s.loadsheet.view.set('display');
      s.loadsheet.restoreView();
      expect(s.loadsheet.view.get()).toBe('loadsheet');
    });

    it('starts every page on its first view after EXIT SESSION', () => {
      const s = session();
      s.loadsheet.view.set('display');
      s.loadsheet.tab.set('fuel');
      s.loadsheet.allTanksShown.set(true);
      s.takeoff.moreShown.set(true);
      s.landing.moreShown.set(true);
      s.reset();
      expect(s.loadsheet.view.get()).toBe('loadsheet');
      expect(s.loadsheet.tab.get()).toBe('lmc');
      expect(s.loadsheet.allTanksShown.get()).toBe(false);
      expect(s.takeoff.moreShown.get()).toBe(false);
      expect(s.landing.moreShown.get()).toBe(false);
    });
  });

  describe('LOADSHEET LOADING prefill', () => {
    it('copies the aircraft ZFW, ZFCG and fuel on board once into the empty fields', () => {
      const loadsheet = session().loadsheet;
      expect(loadsheet.prefillFromAircraft(300_007, 36.24, 120_400.6)).toBe(true);
      expect(loadsheet.zfw.get()).toBe(300_007);
      expect(loadsheet.zfcg.get()).toBe(36.2);
      expect(loadsheet.fob.get()).toBe(120_401);

      // CLEAR keeps the fields empty: no second copy in the same session
      loadsheet.clearEntries();
      expect(loadsheet.prefillFromAircraft(300_007, 36.24, 120_400)).toBe(false);
      expect(loadsheet.zfw.get()).toBe(null);
    });

    it('waits for the aircraft weight: a page opened before it is published copies at the next opening', () => {
      const loadsheet = session().loadsheet;
      expect(loadsheet.prefillFromAircraft(0, 0, 0)).toBe(false);
      expect(loadsheet.zfw.get()).toBe(null);

      expect(loadsheet.prefillFromAircraft(300_007, 36.24, 0)).toBe(true);
      expect(loadsheet.zfw.get()).toBe(300_007);
      // Empty tanks: FOB stays empty for the crew to enter
      expect(loadsheet.fob.get()).toBe(null);
    });

    it('keeps the crew entries', () => {
      const loadsheet = session().loadsheet;
      loadsheet.zfw.set(350_000);
      loadsheet.zfcg.set(38.0);
      loadsheet.fob.set(100_000);
      loadsheet.prefillFromAircraft(300_007, 36.24, 120_400);
      expect(loadsheet.zfw.get()).toBe(350_000);
      expect(loadsheet.zfcg.get()).toBe(38.0);
      expect(loadsheet.fob.get()).toBe(100_000);
    });
  });

  it('starts every application empty after EXIT SESSION', () => {
    const s = session();
    s.onLoadsheetComputed(loadsheetComputation(450_000, 380_000));
    s.onTakeoffPerfShown('LFBO');
    s.onTakeoffAirportEntered('LFPG');
    s.loadsheet.checkedBy.set('BARKER');
    s.reset();
    expect(s.takeoff.airport.get()).toBeNull();
    expect(s.takeoff.standalone.get()).toBe(false);
    expect(s.loadsheet.computation.get()).toBeNull();
    expect(s.loadsheet.checkedBy.get()).toBeNull();
    s.onTakeoffPerfShown('EGLL');
    expect(s.takeoff.tow.get()).toBe(510_000);
  });

  describe('MULTIPLE RWY COMPUTATION', () => {
    it('shows the results of the runway chosen in the RWY list, and loses them all on a change of entry', () => {
      const s = session();
      const on06 = takeoffComputation(560_000);
      const on07 = takeoffComputation(520_000);
      s.onTakeoffComputed(on06, [
        { ident: '06', computation: on06 },
        { ident: '07', computation: on07 },
      ]);
      expect(s.takeoff.shownRunway()).toBe('06');
      s.takeoff.showRunwayResults('07');
      expect(s.takeoff.computation.get()).toBe(on07);
      expect(s.takeoff.shownRunway()).toBe('07');

      s.takeoff.deleteResults();
      expect(s.takeoff.computation.get()).toBeNull();
      expect(s.takeoff.multipleComputation.get()).toBeNull();
    });

    it('drops the ticked runways of the old airport when the crew enters another one', () => {
      const s = session();
      s.onTakeoffPerfShown('LFBO');
      s.takeoff.multipleRunways.set(['14R', '32L']);
      s.onTakeoffAirportEntered('LFPG');
      expect(s.takeoff.multipleRunways.get()).toEqual([]);
      s.onLandingPerfShown('EGLL');
      s.landing.multipleRunways.set(['27L']);
      s.onLandingAirportEntered('EGKK');
      expect(s.landing.multipleRunways.get()).toEqual([]);
    });

    it('has no RWY list after a SINGLE RWY COMPUTATION, and starts single after EXIT SESSION', () => {
      const s = session();
      const on06 = landingComputation(420_000);
      s.onLandingComputed(on06, [{ ident: '06', computation: on06 }]);
      s.onLandingComputed(landingComputation(410_000));
      expect(s.landing.multipleComputation.get()).toBeNull();
      expect(s.landing.shownRunway()).toBeNull();

      s.landing.computationMode.set('multiple');
      s.landing.multipleRunways.set(['06', '24']);
      s.reset();
      expect(s.landing.computationMode.get()).toBe('single');
      expect(s.landing.multipleRunways.get()).toEqual([]);
    });
  });

  describe('AIRCRAFT STATUS', () => {
    const logbook = {
      ...createTechLogbook(),
      items: [
        {
          ref: 'R1',
          title: 'PACK 1 INOP',
          ata: '21-51-00',
          state: 'deferred',
          deferral: { category: 'MEL', reference: '21-51-01', expiryDate: null },
        } as LogbookItem,
      ],
    };

    it('takes the eLogbook status at the first application shown, and again on SYNCHRO LOGBOOK only', () => {
      const s = session();
      expect(s.aircraftStatus.get()).toBeNull();
      s.onApplicationShown(() => logbook);
      expect(s.aircraftStatus.get()?.melItems.map((i) => i.ref)).toEqual(['R1']);

      s.aircraftStatus.set(deleteAircraftStatusItem(s.aircraftStatus.get()!, 'R1'));
      s.onApplicationShown(() => logbook);
      expect(s.aircraftStatus.get()?.melItems).toEqual([]);

      s.synchroLogbook(logbook);
      expect(s.aircraftStatus.get()?.melItems).toHaveLength(1);
      s.reset();
      expect(s.aircraftStatus.get()).toBeNull();
    });

    it('has no item without an eLogbook', () => {
      const s = session();
      s.onApplicationShown(() => null);
      expect(s.aircraftStatus.get()?.melItems).toEqual([]);
    });
  });

  describe('LOADSHEET DETAILED and REFUEL ZF DATA prefill', () => {
    it('copies the aircraft passengers and cargo once into the empty DETAILED fields', () => {
      const loadsheet = session().loadsheet;
      loadsheet.prefillDetailedFromAircraft([50, 100, 100, 80, 10, 40, 10], [10_000, 5_000.4, 0]);
      expect(loadsheet.pax.get()).toEqual({ adults: 390, children: 0, infants: 0 });
      expect(loadsheet.paxDistributionStandard.get()).toBe(false);
      expect(loadsheet.detailedLoading().paxPerSection).toEqual([50, 100, 100, 80, 10, 40, 10]);
      expect(loadsheet.cargo.get()).toBe(15_000);
      expect(loadsheet.detailedLoading().cargoPerCompartment).toEqual([10_000, 5_000, 0]);

      loadsheet.clearEntries();
      loadsheet.prefillDetailedFromAircraft([50, 100, 100, 80, 10, 40, 10], [10_000, 5_000, 0]);
      expect(loadsheet.pax.get()).toBeNull();
    });

    it('distributes all the cargo it copies, whole kilograms in each compartment', () => {
      const loadsheet = session().loadsheet;
      loadsheet.prefillDetailedFromAircraft([0, 0, 0, 0, 0, 0, 0], [1_000.4, 1_000.4, 0]);
      expect(loadsheet.cargo.get()).toBe(2_000);
      expect(loadsheet.detailedLoading().cargoPerCompartment).toEqual([1_000, 1_000, 0]);
    });

    it('starts REFUEL ZF DATA on the data of the REFUEL application, else on the LOADSHEET values', () => {
      const sent = session().loadsheet;
      sent.prefillRefuelZfData(350_000, 37.5);
      expect(sent.refuelZfSource.get()).toBe('newSet');
      expect(sent.refuelZfw.get()).toBe(350_000);
      expect(sent.refuelZfcg.get()).toBe(37.5);
      expect(sent.refuelZfFromRefuelApplication.get()).toBe(true);

      const none = session().loadsheet;
      none.prefillRefuelZfData(0, 0);
      expect(none.refuelZfSource.get()).toBe('loadsheet');
      none.prefillRefuelZfData(350_000, 37.5);
      expect(none.refuelZfSource.get()).toBe('loadsheet');
    });

    it('keeps the more view only with results', () => {
      const s = session();
      s.loadsheet.view.set('more');
      s.loadsheet.restoreView();
      expect(s.loadsheet.view.get()).toBe('loadsheet');
    });
  });

  it('needs FLT NBR and FROM on FLT OPS STS, and TO for LDG PERF', () => {
    expect(missingFltOpsStsFields('T.O PERF', 'AIB406', 'LFBO', null)).toEqual([]);
    expect(missingFltOpsStsFields('LDG PERF', 'AIB406', 'LFBO', null)).toEqual(['TO']);
    expect(missingFltOpsStsFields('LOADSHEET', null, null, 'RJTT')).toEqual(['FLT NBR', 'FROM']);
  });
});
