// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { WindEntry, roundWeightUpForPerformance } from './PerformanceEntries';
import { TakeoffComputation, TakeoffConditions, TakeoffThrustOption } from './TakeoffPerformance';
import { LandingComputation, LandingConditions } from './LandingPerformance';
import {
  LoadsheetComputation,
  LoadsheetLoading,
  LtsEdition,
  LTS_CAPT_INFO_NOTES_LINES,
  ltsEditionAllowed,
} from './Loadsheet';

/** The views of the LOADSHEET page */
export type LoadsheetView = 'loadsheet' | 'edition' | 'display';

/*
 * The state of the FLT OPS performance applications of one laptop, kept while the crew switches between them (the
 * applications stay open until EXIT SESSION), and the links between them:
 * - LOADSHEET gives its TOW to T.O PERF and its LW to LDG PERF (yellow fields),
 * - T.O PERF gives its MTOW(perf) to LOADSHEET when it is not above the certified MTOW, LDG PERF its MLW(perf) when it
 *   is not above the certified MLW (yellow fields).
 * A change of airport inside T.O PERF (LDG PERF) is a new flight simulation: the application goes standalone, its
 * entries are reset, the TOW (LW) is the maximum structural one, and the links with LOADSHEET are lost.
 */

/** The T.O PERF entries and results */
export class TakeoffPerfState {
  public readonly airport = Subject.create<string | null>(null);
  /** The airport comes from FLT OPS STS (yellow) */
  public readonly airportFromSts = Subject.create(false);
  public readonly runwayIdent = Subject.create<string | null>(null);
  public readonly wind = Subject.create<WindEntry | null>(null);
  public readonly oat = Subject.create<number | null>(null);
  public readonly qnh = Subject.create<number | null>(null);
  public readonly runwayCondition = Subject.create<number | null>(null);
  public readonly antiIce = Subject.create<number | null>(null);
  public readonly tow = Subject.create<number | null>(null);
  public readonly towFromLoadsheet = Subject.create(false);
  public readonly conf = Subject.create(0);
  public readonly airCond = Subject.create(0);
  /** Index in the THRUST list (takeoffThrustOptions) */
  public readonly thrust = Subject.create(0);
  public readonly standalone = Subject.create(false);
  public readonly computation = Subject.create<TakeoffComputation | null>(null);
  /** MORE: the second page of the RESULTS */
  public readonly moreShown = Subject.create(false);

  /**
   * @param thrustOption the option of the THRUST index
   * @returns the CONDITIONS panel
   */
  public conditions(thrustOption: TakeoffThrustOption): TakeoffConditions {
    return {
      wind: this.wind.get(),
      oat: this.oat.get(),
      qnh: this.qnh.get(),
      runwayCondition: this.runwayCondition.get(),
      antiIce: this.antiIce.get(),
      tow: this.tow.get(),
      conf: this.conf.get(),
      airCond: this.airCond.get(),
      thrust: thrustOption,
    };
  }

  /** The entries back to their defaults (CLEAR, or a change of airport); the airport and runway are kept */
  public clearEntries(): void {
    this.wind.set(null);
    this.oat.set(null);
    this.qnh.set(null);
    this.runwayCondition.set(null);
    this.antiIce.set(null);
    this.tow.set(null);
    this.towFromLoadsheet.set(false);
    this.conf.set(0);
    this.airCond.set(0);
    this.thrust.set(0);
    this.computation.set(null);
  }
}

/** The LDG PERF entries and results */
export class LandingPerfState {
  public readonly airport = Subject.create<string | null>(null);
  public readonly airportFromSts = Subject.create(false);
  public readonly runwayIdent = Subject.create<string | null>(null);
  public readonly computationType = Subject.create(0);
  public readonly wind = Subject.create<WindEntry | null>(null);
  public readonly oat = Subject.create<number | null>(null);
  public readonly qnh = Subject.create<number | null>(null);
  public readonly runwayCondition = Subject.create<number | null>(null);
  public readonly antiIce = Subject.create<number | null>(null);
  public readonly lw = Subject.create<number | null>(null);
  public readonly lwFromLoadsheet = Subject.create(false);
  public readonly conf = Subject.create(0);
  public readonly goAroundConf = Subject.create(0);
  public readonly airCond = Subject.create(0);
  public readonly approachType = Subject.create(0);
  public readonly goAroundGradient = Subject.create<number | null>(null);
  public readonly speedIncrement = Subject.create<number | null>(null);
  public readonly technique = Subject.create(0);
  public readonly glideSlope = Subject.create<number | null>(null);
  public readonly braking = Subject.create(0);
  public readonly standalone = Subject.create(false);
  public readonly computation = Subject.create<LandingComputation | null>(null);
  /** MORE: the second page of the RESULTS */
  public readonly moreShown = Subject.create(false);

  /** @returns the CONDITIONS panel */
  public conditions(): LandingConditions {
    return {
      computation: this.computationType.get(),
      wind: this.wind.get(),
      oat: this.oat.get(),
      qnh: this.qnh.get(),
      runwayCondition: this.runwayCondition.get(),
      antiIce: this.antiIce.get(),
      lw: this.lw.get(),
      conf: this.conf.get(),
      goAroundConf: this.goAroundConf.get(),
      airCond: this.airCond.get(),
      approachType: this.approachType.get(),
      goAroundGradient: this.goAroundGradient.get(),
      speedIncrement: this.speedIncrement.get(),
      technique: this.technique.get(),
      glideSlope: this.glideSlope.get(),
      braking: this.braking.get(),
    };
  }

  /** The entries back to their defaults (CLEAR, or a change of airport); the airport and runway are kept */
  public clearEntries(): void {
    this.computationType.set(0);
    this.wind.set(null);
    this.oat.set(null);
    this.qnh.set(null);
    this.runwayCondition.set(null);
    this.antiIce.set(null);
    this.lw.set(null);
    this.lwFromLoadsheet.set(false);
    this.conf.set(0);
    this.goAroundConf.set(0);
    this.airCond.set(0);
    this.approachType.set(0);
    this.goAroundGradient.set(null);
    this.speedIncrement.set(null);
    this.technique.set(0);
    this.glideSlope.set(null);
    this.braking.set(0);
    this.computation.set(null);
  }
}

/** The LOADSHEET entries and results */
export class LoadsheetState {
  public readonly mtow = Subject.create<number | null>(null);
  public readonly mtowFromTakeoffPerf = Subject.create(false);
  public readonly mlw = Subject.create<number | null>(null);
  public readonly mlwFromLandingPerf = Subject.create(false);
  public readonly zfw = Subject.create<number | null>(null);
  public readonly zfcg = Subject.create<number | null>(null);
  public readonly fob = Subject.create<number | null>(null);
  public readonly tripFuel = Subject.create<number | null>(null);
  /** null: the standard taxi fuel */
  public readonly taxiFuel = Subject.create<number | null>(null);
  /** null: the standard density */
  public readonly density = Subject.create<number | null>(null);
  public readonly lmcPax = Subject.create<number | null>(null);
  public readonly lmcCargo = Subject.create<number | null>(null);
  /** The aircraft and OFP values were copied into the empty LOADING fields */
  public prefilled = false;
  public readonly computation = Subject.create<LoadsheetComputation | null>(null);

  public readonly checkedBy = Subject.create<string | null>(null);
  public readonly approvedBy = Subject.create<string | null>(null);
  public readonly captInfoNotes: Subject<string | null>[] = [];
  public readonly crew = Subject.create<string | null>(null);
  public readonly paxPerType = Subject.create<string | null>(null);
  public readonly paxPerClass = Subject.create<string | null>(null);
  public readonly cargo = Subject.create<number | null>(null);
  /** 0: PRELIM, 1: FINAL */
  public readonly status = Subject.create(1);
  /** The generated report, null before GENERATE */
  public readonly report = Subject.create<string[] | null>(null);

  /** The view of the page, the tab of the right panel and the fuel tanks shown */
  public readonly view = Subject.create<LoadsheetView>('loadsheet');
  public readonly tab = Subject.create<'lmc' | 'fuel'>('lmc');
  public readonly allTanksShown = Subject.create(false);

  constructor() {
    for (let i = 0; i < LTS_CAPT_INFO_NOTES_LINES; i++) {
      this.captInfoNotes.push(Subject.create<string | null>(null));
    }
  }

  /**
   * @param standardTaxiFuel the standard taxi fuel, kg
   * @returns the LOADING panel and the LMC
   */
  public loading(standardTaxiFuel: number): LoadsheetLoading {
    return {
      zfw: this.zfw.get(),
      zfcg: this.zfcg.get(),
      fob: this.fob.get(),
      tripFuel: this.tripFuel.get(),
      taxiFuel: this.taxiFuel.get() ?? standardTaxiFuel,
      lmcPax: this.lmcPax.get() ?? 0,
      lmcCargo: this.lmcCargo.get() ?? 0,
    };
  }

  /** @returns the LTS EDITION entries */
  public edition(): LtsEdition {
    return {
      checkedBy: this.checkedBy.get() ?? '',
      approvedBy: this.approvedBy.get() ?? '',
      captInfoNotes: this.captInfoNotes.map((line) => line.get() ?? ''),
      crew: this.crew.get() ?? '',
      paxPerType: this.paxPerType.get() ?? '',
      paxPerClass: this.paxPerClass.get() ?? '',
      cargo: this.cargo.get(),
      status: this.status.get() === 0 ? 'PRELIM' : 'FINAL',
    };
  }

  /**
   * The LOADING panel starts with the values of the aircraft, copied once into the empty fields: the ZFW and ZFCG of
   * its loading and the fuel on board. The copy waits for the aircraft weight: a page opened before the aircraft
   * publishes it (ZFW 0) copies at its next opening instead of leaving the fields empty for the whole session.
   * @param zfw the ZFW of the aircraft, kg; 0 while it is not published
   * @param zfcg the ZFCG of the aircraft, %MAC
   * @param fob the fuel on board, kg
   * @returns whether the values were copied now
   */
  public prefillFromAircraft(zfw: number, zfcg: number, fob: number): boolean {
    if (this.prefilled || !(zfw > 0)) {
      return false;
    }
    this.prefilled = true;
    if (this.zfw.get() === null) {
      this.zfw.set(zfw);
      this.zfcg.set(Math.round(zfcg * 10) / 10);
    }
    if (this.fob.get() === null && fob > 0) {
      this.fob.set(Math.round(fob));
    }
    return true;
  }

  /**
   * Back on the page through the switching bar: the view the crew left, LTS EDITION while the results still permit it
   * and LTS DISPLAY while its report exists (a new computation in the meantime deletes them).
   */
  public restoreView(): void {
    const view = this.view.get();
    const results = this.computation.get()?.results ?? null;
    if ((view === 'edition' && !ltsEditionAllowed(results)) || (view === 'display' && this.report.get() === null)) {
      this.view.set('loadsheet');
    }
  }

  /** CLEAR: the LOADING panel, the LMC and the results back to empty */
  public clearEntries(): void {
    this.zfw.set(null);
    this.zfcg.set(null);
    this.fob.set(null);
    this.tripFuel.set(null);
    this.taxiFuel.set(null);
    this.density.set(null);
    this.lmcPax.set(null);
    this.lmcCargo.set(null);
    this.computation.set(null);
    this.report.set(null);
  }
}

/** The certified weight limits of the aircraft, kg */
export interface CertifiedWeights {
  readonly mtow: number;
  readonly mlw: number;
}

/** The performance applications of one laptop and their links */
export class FltOpsPerformanceSession {
  public readonly takeoff = new TakeoffPerfState();

  public readonly landing = new LandingPerfState();

  public readonly loadsheet = new LoadsheetState();

  /** Counts the LOADSHEET computations, so that T.O PERF takes each new TOW once */
  private loadsheetVersion = 0;

  private loadsheetVersionTakenByTakeoff = 0;

  /** The MTOW(perf) (MLW(perf)) of the last T.O PERF (LDG PERF) computation that LOADSHEET takes, kg */
  private mtowPerfForLoadsheet: number | null = null;

  private mlwPerfForLoadsheet: number | null = null;

  /** Counts the T.O PERF (LDG PERF) computations, so that LOADSHEET takes each new value once */
  private takeoffVersion = 0;

  private landingVersion = 0;

  private takeoffVersionTakenByLoadsheet = 0;

  private landingVersionTakenByLoadsheet = 0;

  constructor(
    private readonly certified: CertifiedWeights,
    private readonly metric: () => boolean,
  ) {}

  /**
   * T.O PERF is shown: it takes the departure airport of FLT OPS STS (yellow) the first time, and the TOW of a new
   * LOADSHEET computation (yellow); without one, the TOW is the maximum structural one.
   * @param fromAirport the FROM airport of FLT OPS STS
   */
  public onTakeoffPerfShown(fromAirport: string | null): void {
    const takeoff = this.takeoff;
    if (takeoff.airport.get() === null && fromAirport !== null) {
      takeoff.airport.set(fromAirport);
      takeoff.airportFromSts.set(true);
    }
    const loadsheet = this.loadsheet.computation.get()?.results ?? null;
    if (
      !takeoff.standalone.get() &&
      loadsheet !== null &&
      this.loadsheetVersionTakenByTakeoff !== this.loadsheetVersion
    ) {
      this.loadsheetVersionTakenByTakeoff = this.loadsheetVersion;
      takeoff.tow.set(roundWeightUpForPerformance(loadsheet.tow, this.metric()));
      takeoff.towFromLoadsheet.set(true);
      takeoff.computation.set(null);
    } else if (takeoff.tow.get() === null) {
      takeoff.tow.set(this.certified.mtow);
      takeoff.towFromLoadsheet.set(false);
    }
  }

  /**
   * The crew enters another airport in T.O PERF: a new flight simulation in standalone mode.
   * @param airport the new airport
   */
  public onTakeoffAirportEntered(airport: string): void {
    const takeoff = this.takeoff;
    if (airport === takeoff.airport.get()) {
      return;
    }
    takeoff.airport.set(airport);
    takeoff.airportFromSts.set(false);
    takeoff.runwayIdent.set(null);
    takeoff.clearEntries();
    takeoff.tow.set(this.certified.mtow);
    takeoff.standalone.set(true);
    this.mtowPerfForLoadsheet = null;
  }

  /**
   * A T.O PERF computation: its MTOW(perf) goes to LOADSHEET when not above the certified MTOW.
   * @param computation the computation
   */
  public onTakeoffComputed(computation: TakeoffComputation): void {
    this.takeoff.computation.set(computation);
    const mtowPerf = computation.results?.mtowPerf ?? null;
    if (!this.takeoff.standalone.get() && mtowPerf !== null && mtowPerf <= this.certified.mtow) {
      this.mtowPerfForLoadsheet = mtowPerf;
      this.takeoffVersion++;
    }
  }

  /**
   * LDG PERF is shown: it takes the destination of FLT OPS STS (yellow) the first time; with LOADSHEET results, it
   * always takes their LW (yellow); without, the LW is the maximum structural one.
   * @param toAirport the TO airport of FLT OPS STS
   */
  public onLandingPerfShown(toAirport: string | null): void {
    const landing = this.landing;
    if (landing.airport.get() === null && toAirport !== null) {
      landing.airport.set(toAirport);
      landing.airportFromSts.set(true);
    }
    const loadsheet = this.loadsheet.computation.get()?.results ?? null;
    if (!landing.standalone.get() && loadsheet !== null) {
      const lw = roundWeightUpForPerformance(loadsheet.lw, this.metric());
      if (lw !== landing.lw.get() || !landing.lwFromLoadsheet.get()) {
        landing.lw.set(lw);
        landing.lwFromLoadsheet.set(true);
        landing.computation.set(null);
      }
    } else if (landing.lw.get() === null) {
      landing.lw.set(this.certified.mlw);
      landing.lwFromLoadsheet.set(false);
    }
  }

  /**
   * The crew enters another airport in LDG PERF: a new landing simulation in standalone mode.
   * @param airport the new airport
   */
  public onLandingAirportEntered(airport: string): void {
    const landing = this.landing;
    if (airport === landing.airport.get()) {
      return;
    }
    landing.airport.set(airport);
    landing.airportFromSts.set(false);
    landing.runwayIdent.set(null);
    landing.clearEntries();
    landing.lw.set(this.certified.mlw);
    landing.standalone.set(true);
    this.mlwPerfForLoadsheet = null;
  }

  /**
   * An LDG PERF computation: its MLW(perf) goes to LOADSHEET when not above the certified MLW.
   * @param computation the computation
   */
  public onLandingComputed(computation: LandingComputation): void {
    this.landing.computation.set(computation);
    const mlwPerf = computation.results?.mlwPerf ?? null;
    if (!this.landing.standalone.get() && mlwPerf !== null && mlwPerf <= this.certified.mlw) {
      this.mlwPerfForLoadsheet = mlwPerf;
      this.landingVersion++;
    }
  }

  /**
   * LOADSHEET is shown: the MTOW and MLW are the certified ones, or the MTOW(perf) and MLW(perf) of new T.O PERF and
   * LDG PERF computations (yellow).
   */
  public onLoadsheetShown(): void {
    const loadsheet = this.loadsheet;
    if (loadsheet.mtow.get() === null) {
      loadsheet.mtow.set(this.certified.mtow);
    }
    if (loadsheet.mlw.get() === null) {
      loadsheet.mlw.set(this.certified.mlw);
    }
    if (this.mtowPerfForLoadsheet !== null && this.takeoffVersionTakenByLoadsheet !== this.takeoffVersion) {
      this.takeoffVersionTakenByLoadsheet = this.takeoffVersion;
      loadsheet.mtow.set(this.mtowPerfForLoadsheet);
      loadsheet.mtowFromTakeoffPerf.set(true);
      loadsheet.computation.set(null);
    }
    if (this.mlwPerfForLoadsheet !== null && this.landingVersionTakenByLoadsheet !== this.landingVersion) {
      this.landingVersionTakenByLoadsheet = this.landingVersion;
      loadsheet.mlw.set(this.mlwPerfForLoadsheet);
      loadsheet.mlwFromLandingPerf.set(true);
      loadsheet.computation.set(null);
    }
  }

  /**
   * A LOADSHEET computation: its TOW and LW go to T.O PERF and LDG PERF.
   * @param computation the computation
   */
  public onLoadsheetComputed(computation: LoadsheetComputation): void {
    this.loadsheet.computation.set(computation);
    this.loadsheet.report.set(null);
    if (computation.results !== null) {
      this.loadsheetVersion++;
    }
  }

  /** EXIT SESSION: every application starts empty for the next flight */
  public reset(): void {
    this.takeoff.airport.set(null);
    this.takeoff.airportFromSts.set(false);
    this.takeoff.runwayIdent.set(null);
    this.takeoff.standalone.set(false);
    this.takeoff.moreShown.set(false);
    this.takeoff.clearEntries();
    this.landing.airport.set(null);
    this.landing.airportFromSts.set(false);
    this.landing.runwayIdent.set(null);
    this.landing.standalone.set(false);
    this.landing.moreShown.set(false);
    this.landing.clearEntries();
    const loadsheet = this.loadsheet;
    loadsheet.clearEntries();
    loadsheet.mtow.set(null);
    loadsheet.mtowFromTakeoffPerf.set(false);
    loadsheet.mlw.set(null);
    loadsheet.mlwFromLandingPerf.set(false);
    loadsheet.prefilled = false;
    loadsheet.checkedBy.set(null);
    loadsheet.approvedBy.set(null);
    loadsheet.captInfoNotes.forEach((line) => line.set(null));
    loadsheet.crew.set(null);
    loadsheet.paxPerType.set(null);
    loadsheet.paxPerClass.set(null);
    loadsheet.cargo.set(null);
    loadsheet.status.set(1);
    loadsheet.view.set('loadsheet');
    loadsheet.tab.set('lmc');
    loadsheet.allTanksShown.set(false);
    this.loadsheetVersion = 0;
    this.loadsheetVersionTakenByTakeoff = 0;
    this.mtowPerfForLoadsheet = null;
    this.mlwPerfForLoadsheet = null;
    this.takeoffVersion = 0;
    this.landingVersion = 0;
    this.takeoffVersionTakenByLoadsheet = 0;
    this.landingVersionTakenByLoadsheet = 0;
  }
}

/**
 * The prerequisites of the performance applications on FLT OPS STS (the registration and the MSN are always set on
 * this aircraft): T.O PERF needs the flight number and the departure airport, LDG PERF also the destination.
 * Design choice: LOADSHEET has the prerequisites of T.O PERF, the application it feeds first.
 * @param application the application
 * @param fltNumber the FLT NBR of FLT OPS STS
 * @param from the FROM airport
 * @param to the TO airport
 * @returns the missing FLT OPS STS fields; empty when the application can be started
 */
export function missingFltOpsStsFields(
  application: 'T.O PERF' | 'LDG PERF' | 'LOADSHEET',
  fltNumber: string | null,
  from: string | null,
  to: string | null,
): string[] {
  const missing: string[] = [];
  if (!fltNumber) {
    missing.push('FLT NBR');
  }
  if (!from) {
    missing.push('FROM');
  }
  if (application === 'LDG PERF' && !to) {
    missing.push('TO');
  }
  return missing;
}
