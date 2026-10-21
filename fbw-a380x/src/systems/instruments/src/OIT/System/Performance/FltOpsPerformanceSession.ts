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
import { CABIN_SECTIONS, CARGO_COMPARTMENTS, DetailedLoading, PaxByType } from './LoadsheetDetailed';
import { RefuelZfSource } from './LoadsheetFuel';
import { RunwayComputation } from './MultipleRunwayResults';
import { EMPTY_AIRCRAFT_STATUS, FltOpsAircraftStatus, aircraftStatusFromLogbook } from './AircraftStatus';
import { TechLogbookState } from '../TechLogbook';

/** The views of the LOADSHEET page: the application, the MORE panel, LTS EDITION and LTS DISPLAY */
export type LoadsheetView = 'loadsheet' | 'more' | 'edition' | 'display';

/** The tabs of the LOADSHEET right panel: LMC (REDUCED) or PAYLOAD DISTR (DETAILED), FUEL DISTR, REFUEL ZF DATA */
export type LoadsheetTab = 'lmc' | 'payload' | 'fuel' | 'refuel';

/** The tabs of the airport panel of T.O PERF and LDG PERF */
export type RunwayComputationMode = 'single' | 'multiple';

/** The LOADSHEET ENTRY MODE list */
export const LOADSHEET_ENTRY_MODES: readonly string[] = ['REDUCED', 'DETAILED'];

/** The index of DETAILED in LOADSHEET_ENTRY_MODES */
export const DETAILED_ENTRY_MODE = 1;

/**
 * The runway computations of T.O PERF or LDG PERF: one runway (SINGLE RWY COMPUTATION) or the runways the crew ticked
 * (MULTIPLE RWY COMPUTATION). The computation shown is the one of the runway shown in the RESULTS panel.
 */
abstract class RunwayComputationState<C> {
  public readonly airport = Subject.create<string | null>(null);
  /** The airport comes from FLT OPS STS (yellow) */
  public readonly airportFromSts = Subject.create(false);
  public readonly runwayIdent = Subject.create<string | null>(null);
  public readonly standalone = Subject.create(false);
  /** MORE: the second page of the RESULTS */
  public readonly moreShown = Subject.create(false);
  public readonly computationMode = Subject.create<RunwayComputationMode>('single');
  /** The runways ticked in the MULTIPLE RWY COMPUTATION table */
  public readonly multipleRunways = Subject.create<readonly string[]>([]);
  /** The computation of each ticked runway, null before COMPUTE or after a change of entry */
  public readonly multipleComputation = Subject.create<readonly RunwayComputation<C>[] | null>(null);
  /** The computation of the runway the RESULTS panel shows */
  public readonly computation = Subject.create<C | null>(null);

  /** Results of other entries than the computed ones are not shown */
  public deleteResults(): void {
    this.computation.set(null);
    this.multipleComputation.set(null);
  }

  /**
   * The RWY list of the multiple results: the RESULTS panel shows another runway.
   * @param ident the runway
   */
  public showRunwayResults(ident: string): void {
    const run = this.multipleComputation.get()?.find((r) => r.ident === ident);
    if (run) {
      this.computation.set(run.computation);
    }
  }

  /** @returns the runway the RESULTS panel shows in a MULTIPLE RWY COMPUTATION, null otherwise */
  public shownRunway(): string | null {
    const shown = this.computation.get();
    return this.multipleComputation.get()?.find((r) => r.computation === shown)?.ident ?? null;
  }

  /** The entries back to their defaults (CLEAR, or a change of airport); the airport and runway are kept */
  public abstract clearEntries(): void;

  /**
   * Another airport: its runways replace the runway and the ticks of the old one.
   * @param airport the airport
   */
  public changeAirport(airport: string): void {
    this.airport.set(airport);
    this.airportFromSts.set(false);
    this.runwayIdent.set(null);
    this.multipleRunways.set([]);
  }

  /** EXIT SESSION */
  public reset(): void {
    this.airport.set(null);
    this.airportFromSts.set(false);
    this.runwayIdent.set(null);
    this.standalone.set(false);
    this.moreShown.set(false);
    this.clearEntries();
    this.computationMode.set('single');
    this.multipleRunways.set([]);
    this.deleteResults();
  }
}

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
export class TakeoffPerfState extends RunwayComputationState<TakeoffComputation> {
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
    this.deleteResults();
  }
}

/** The LDG PERF entries and results */
export class LandingPerfState extends RunwayComputationState<LandingComputation> {
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
    this.deleteResults();
  }
}

/** The LOADSHEET entries and results */
export class LoadsheetState {
  /** Index in LOADSHEET_ENTRY_MODES */
  public readonly entryMode = Subject.create(0);
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

  /** DETAILED: index in CREW_OPTIONS */
  public readonly crew = Subject.create(0);
  public readonly pax = Subject.create<PaxByType | null>(null);
  /** DETAILED: the cargo weight of the LOADING panel, kg */
  public readonly cargo = Subject.create<number | null>(null);
  /** PAYLOAD DISTR: the passengers of each cabin section */
  public readonly paxPerSection = CABIN_SECTIONS.map(() => Subject.create<number | null>(null));
  /** PAYLOAD DISTR: the cargo of each compartment, kg */
  public readonly cargoPerCompartment = CARGO_COMPARTMENTS.map(() => Subject.create<number | null>(null));
  /** PAX DISTRIBUTION STANDARD (the seated passengers spread over the cabin) or DETAILED (entered per section) */
  public readonly paxDistributionStandard = Subject.create(true);
  /** The aircraft loading was copied into the empty DETAILED fields */
  public detailedPrefilled = false;

  /** REFUEL ZF DATA: the ZFW/ZFCG of the predicted fuel distribution, and the NEW SET OF DATA entries */
  public readonly refuelZfSource = Subject.create<RefuelZfSource>('loadsheet');
  public readonly refuelZfw = Subject.create<number | null>(null);
  public readonly refuelZfcg = Subject.create<number | null>(null);
  /** The NEW SET OF DATA is the ZF data the REFUEL application sent to the FQMS (yellow) */
  public readonly refuelZfFromRefuelApplication = Subject.create(false);
  /** The REFUEL application data was looked for once */
  public refuelZfPrefilled = false;

  public readonly computation = Subject.create<LoadsheetComputation | null>(null);

  public readonly checkedBy = Subject.create<string | null>(null);
  public readonly approvedBy = Subject.create<string | null>(null);
  public readonly captInfoNotes: Subject<string | null>[] = [];
  public readonly crewText = Subject.create<string | null>(null);
  public readonly paxPerType = Subject.create<string | null>(null);
  public readonly paxPerClass = Subject.create<string | null>(null);
  public readonly reportCargo = Subject.create<number | null>(null);
  /** DETAILED: 0 DETAILED LTS, 1 REDUCED LTS */
  public readonly ltsKind = Subject.create(0);
  /** DETAILED LTS: index in the EDITION NBR list */
  public readonly editionNumber = Subject.create(0);
  /** 0: PRELIM, 1: FINAL */
  public readonly status = Subject.create(1);
  /** The generated report, null before GENERATE */
  public readonly report = Subject.create<string[] | null>(null);

  /** The view of the page, the tab of the right panel and the fuel tanks shown */
  public readonly view = Subject.create<LoadsheetView>('loadsheet');
  public readonly tab = Subject.create<LoadsheetTab>('lmc');
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
      crew: this.crewText.get() ?? '',
      paxPerType: this.paxPerType.get() ?? '',
      paxPerClass: this.paxPerClass.get() ?? '',
      cargo: this.reportCargo.get(),
      status: this.status.get() === 0 ? 'PRELIM' : 'FINAL',
    };
  }

  /** @returns whether the entries are in DETAILED mode */
  public isDetailed(): boolean {
    return this.entryMode.get() === DETAILED_ENTRY_MODE;
  }

  /** @returns the DETAILED entries */
  public detailedLoading(): DetailedLoading {
    return {
      crew: this.crew.get(),
      pax: this.pax.get(),
      cargo: this.cargo.get(),
      paxPerSection: this.paxPerSection.map((pax) => pax.get() ?? 0),
      cargoPerCompartment: this.cargoPerCompartment.map((kg) => kg.get() ?? 0),
    };
  }

  /**
   * The DETAILED fields start with the loading of the aircraft, copied once into the empty fields: the passengers of
   * each cabin section (all adults) and the cargo of each compartment.
   * @param paxPerSection the passengers of each cabin section
   * @param cargoPerCompartment the cargo of each compartment, kg
   */
  public prefillDetailedFromAircraft(paxPerSection: readonly number[], cargoPerCompartment: readonly number[]): void {
    if (this.detailedPrefilled) {
      return;
    }
    this.detailedPrefilled = true;
    if (this.pax.get() === null) {
      const seated = paxPerSection.reduce((sum, pax) => sum + pax, 0);
      this.pax.set({ adults: seated, children: 0, infants: 0 });
      this.paxDistributionStandard.set(false);
      paxPerSection.forEach((pax, i) => this.paxPerSection[i].set(pax));
    }
    if (this.cargo.get() === null) {
      const rounded = cargoPerCompartment.map((kg) => Math.round(kg));
      this.cargo.set(rounded.reduce((sum, kg) => sum + kg, 0));
      rounded.forEach((kg, i) => this.cargoPerCompartment[i].set(kg));
    }
  }

  /**
   * REFUEL ZF DATA starts with the ZF data the REFUEL application sent to the FQMS, as the NEW SET OF DATA (yellow).
   * Design choice: without it, the LOADSHEET values: the FQMS of this aircraft then refuels with the aircraft loading.
   * @param zfw the ZFW of the REFUEL application, kg, 0 when none
   * @param zfcg its ZFCG, % MAC, 0 when none
   */
  public prefillRefuelZfData(zfw: number, zfcg: number): void {
    if (this.refuelZfPrefilled) {
      return;
    }
    this.refuelZfPrefilled = true;
    if (zfw > 0 && zfcg > 0) {
      this.refuelZfSource.set('newSet');
      this.refuelZfw.set(zfw);
      this.refuelZfcg.set(zfcg);
      this.refuelZfFromRefuelApplication.set(true);
    }
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
    if (
      (view === 'edition' && !ltsEditionAllowed(results)) ||
      (view === 'more' && results === null) ||
      (view === 'display' && this.report.get() === null)
    ) {
      this.view.set('loadsheet');
    }
  }

  /** CLEAR: the LOADING panel, the LMC, the payload distribution and the results back to empty */
  public clearEntries(): void {
    this.pax.set(null);
    this.cargo.set(null);
    this.paxPerSection.forEach((pax) => pax.set(null));
    this.cargoPerCompartment.forEach((kg) => kg.set(null));
    this.paxDistributionStandard.set(true);
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

  /**
   * The AIRCRAFT STATUS of the three applications, null until the FLT OPS domain has an eLogbook status: the first
   * application shown in the session takes it, as SYNCHRO LOGBOOK does
   */
  public readonly aircraftStatus = Subject.create<FltOpsAircraftStatus | null>(null);

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
   * A performance application is shown: the FLT OPS domain takes the eLogbook status when it has none yet.
   * @param readLogbook reads the eLogbook (null when there is none)
   */
  public onApplicationShown(readLogbook: () => TechLogbookState | null): void {
    if (this.aircraftStatus.get() === null) {
      this.synchroLogbook(readLogbook());
    }
  }

  /**
   * SYNCHRO LOGBOOK: the aircraft status of the whole FLT OPS domain becomes the deferred items of the eLogbook.
   * @param logbook the eLogbook, null when there is none
   */
  public synchroLogbook(logbook: TechLogbookState | null): void {
    this.aircraftStatus.set(logbook !== null ? aircraftStatusFromLogbook(logbook) : EMPTY_AIRCRAFT_STATUS);
  }

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
      takeoff.deleteResults();
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
    takeoff.changeAirport(airport);
    takeoff.clearEntries();
    takeoff.tow.set(this.certified.mtow);
    takeoff.standalone.set(true);
    this.mtowPerfForLoadsheet = null;
  }

  /**
   * A T.O PERF computation: its MTOW(perf) goes to LOADSHEET when not above the certified MTOW. In a MULTIPLE RWY
   * COMPUTATION it is the one of the runway the RESULTS panel shows first.
   * @param computation the computation
   * @param multiple the computation of each runway of a MULTIPLE RWY COMPUTATION, null for a SINGLE one
   */
  public onTakeoffComputed(
    computation: TakeoffComputation,
    multiple: readonly RunwayComputation<TakeoffComputation>[] | null = null,
  ): void {
    this.takeoff.multipleComputation.set(multiple);
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
        landing.deleteResults();
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
    landing.changeAirport(airport);
    landing.clearEntries();
    landing.lw.set(this.certified.mlw);
    landing.standalone.set(true);
    this.mlwPerfForLoadsheet = null;
  }

  /**
   * An LDG PERF computation: its MLW(perf) goes to LOADSHEET when not above the certified MLW. In a MULTIPLE RWY
   * COMPUTATION it is the one of the runway the RESULTS panel shows first.
   * @param computation the computation
   * @param multiple the computation of each runway of a MULTIPLE RWY COMPUTATION, null for a SINGLE one
   */
  public onLandingComputed(
    computation: LandingComputation,
    multiple: readonly RunwayComputation<LandingComputation>[] | null = null,
  ): void {
    this.landing.multipleComputation.set(multiple);
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
    this.takeoff.reset();
    this.landing.reset();
    this.aircraftStatus.set(null);
    const loadsheet = this.loadsheet;
    loadsheet.clearEntries();
    loadsheet.mtow.set(null);
    loadsheet.mtowFromTakeoffPerf.set(false);
    loadsheet.mlw.set(null);
    loadsheet.mlwFromLandingPerf.set(false);
    loadsheet.prefilled = false;
    loadsheet.entryMode.set(0);
    loadsheet.crew.set(0);
    loadsheet.detailedPrefilled = false;
    loadsheet.refuelZfSource.set('loadsheet');
    loadsheet.refuelZfw.set(null);
    loadsheet.refuelZfcg.set(null);
    loadsheet.refuelZfFromRefuelApplication.set(false);
    loadsheet.refuelZfPrefilled = false;
    loadsheet.checkedBy.set(null);
    loadsheet.approvedBy.set(null);
    loadsheet.captInfoNotes.forEach((line) => line.set(null));
    loadsheet.crewText.set(null);
    loadsheet.paxPerType.set(null);
    loadsheet.paxPerClass.set(null);
    loadsheet.reportCargo.set(null);
    loadsheet.ltsKind.set(0);
    loadsheet.editionNumber.set(0);
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
