// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, Subject, Subscribable, Subscription, UnitType, Vec2Math } from '@microsoft/msfs-sdk';
import { MathUtils, NXDataStore } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { FlightPlanWindEntry, WindVector } from '@fmgc/flightplanning/data/wind';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { FmgcFlightPhase } from '@shared/flightphase';
import { AirlineModifiableInformation } from '@shared/AirlineModifiableInformation';

import type { FlightManagementComputer } from './FlightManagementComputer';
import { CompanyWindRequestState } from './FlightManagementComputer';

/** One printed page, sent to the flypad (the A380X cockpit printer has no paper to print on). */
export interface FmsPrintPage {
  title: string;
  /** Sim UTC time of the print, in seconds of the day */
  utcSeconds: number;
  lines: string[];
}

/** The Coherent event the printed pages are sent with (received by the flypad PRINTOUTS page) */
export const FMS_PRINT_EVENT = 'A380X_FMS_PRINT';

/** Flight plan reports of the DATA / PRINTER page (A380 FCOM DSC-22-FMS-20-30 P 76-77) */
export enum FlightPlanReport {
  PreFlight = 'PREFLIGHT',
  InFlight = 'INFLIGHT',
  PostFlight = 'POSTFLIGHT',
}

const WIDTH = 64;
const RULE = '='.repeat(WIDTH);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const pad = (s: string, n: number) => (s.length >= n ? s.substring(0, n) : s + ' '.repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s.substring(0, n) : ' '.repeat(n - s.length) + s);
/** Left text, and right text starting at column `col` */
const cols = (left: string, right: string, col = 36) => pad(left, col) + right;
const orDash = (v: string | null | undefined, dashes = '---') =>
  v === null || v === undefined || v === '' ? dashes : v;
const hhmm = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '--:--';
  }
  const s = ((seconds % 86400) + 86400) % 86400;
  return `${Math.floor(s / 3600)
    .toFixed(0)
    .padStart(2, '0')}:${Math.floor((s % 3600) / 60)
    .toFixed(0)
    .padStart(2, '0')}`;
};
const flightLevel = (feet: number | null | undefined) =>
  feet === null || feet === undefined
    ? 'FL---'
    : `FL${Math.round(feet / 100)
        .toFixed(0)
        .padStart(3, '0')}`;
const windText = (vector: WindVector | null | undefined) => {
  if (!vector) {
    return "---'/---";
  }
  const direction = Math.round(MathUtils.normalise360(Vec2Math.theta(vector) * MathUtils.RADIANS_TO_DEGREES)) % 360;
  return `${direction.toFixed(0).padStart(3, '0')}'/${Math.round(Vec2Math.abs(vector)).toFixed(0).padStart(3, '0')}`;
};

/**
 * The FMS print functions (A380 FCOM DSC-22-FMS-10-70 and DSC-22-FMS-20-30 P 74-77): the active flight plan data
 * (initialization, takeoff and wind data), the flight plan reports (pre-flight, in-flight, post-flight, and the
 * secondary flight plan reports), and the automatic prints at engine start, at the transition to TAKEOFF, at engine
 * shutdown and at the reception of company data.
 *
 * The pages follow the FCOM printout examples; data the FMS does not have (e.g. the takeoff contamination, the IRS
 * drift) are printed as dashes.
 */
export class FmsPrinter {
  /** CPNY DATA and ACTIVE F-PLN REPORT options of the DATA / PRINTER page (AMI default: none selected) */
  public readonly autoPrint = {
    cpnyInit: Subject.create(false),
    cpnyTakeoff: Subject.create(false),
    cpnyWind: Subject.create(false),
    preFlight: Subject.create(false),
    inFlight: Subject.create(false),
    postFlight: Subject.create(false),
  };

  private readonly flightPhase = Subject.create(FmgcFlightPhase.Preflight);

  private readonly enginesRunning = Subject.create(false);

  /** Whether the engines ran since the last flight began (the post-flight report is available after their shutdown) */
  private readonly enginesHaveRun = Subject.create(false);

  /** FCOM P 76: PRE-FLIGHT only in the PREFLIGHT phase, with the flight plan data entered */
  public readonly preFlightAvailable = MappedSubject.create(
    ([phase]) => phase === FmgcFlightPhase.Preflight && this.hasFlightPlanData(FlightPlanIndex.Active),
    this.flightPhase,
  );

  /** FCOM P 76: IN-FLIGHT from TAKEOFF to DONE, before all engines are shut down */
  public readonly inFlightAvailable = MappedSubject.create(
    ([phase, running]) => phase >= FmgcFlightPhase.Takeoff && running,
    this.flightPhase,
    this.enginesRunning,
  );

  /** FCOM P 77: POST-FLIGHT after all engines are shut down */
  public readonly postFlightAvailable = MappedSubject.create(
    ([running, haveRun]) => !running && haveRun,
    this.enginesRunning,
    this.enginesHaveRun,
  );

  private readonly listener = RegisterViewListener('JS_LISTENER_SIMVARS', undefined, true);

  private readonly subs: Subscription[] = [];

  /** Fuel and time summary of the post-flight report */
  private startUp: { utc: number; fuelTonnes: number | null; weightTonnes: number | null } | null = null;

  private shutDown: { utc: number; fuelTonnes: number | null; weightTonnes: number | null } | null = null;

  private takeoffUtc: number | null = null;

  private landingUtc: number | null = null;

  private wasOnGround = true;

  private softwareVersion: string | null = null;

  constructor(private readonly fmc: FlightManagementComputer) {
    fetch('/VFS/a380x_build_info.json')
      .then((response) => response.json())
      .then((info) => (this.softwareVersion = typeof info?.version === 'string' ? info.version : null))
      .catch(() => (this.softwareVersion = null));

    this.subs.push(
      // FCOM DSC-22-FMS-10-70 P 4-5: automatic reports at engine start, at transition to TAKEOFF, at engine shutdown
      this.enginesRunning.sub((running) => {
        if (running) {
          this.enginesHaveRun.set(true);
          this.startUp = { utc: this.utc(), fuelTonnes: this.fuelOnBoard(), weightTonnes: this.grossWeight() };
          this.shutDown = null;
          if (this.autoPrint.preFlight.get() && this.flightPhase.get() === FmgcFlightPhase.Preflight) {
            this.printFlightPlanReport(FlightPlanIndex.Active, FlightPlanReport.PreFlight);
          }
        } else if (this.enginesHaveRun.get()) {
          this.shutDown = { utc: this.utc(), fuelTonnes: this.fuelOnBoard(), weightTonnes: this.grossWeight() };
          if (this.autoPrint.postFlight.get()) {
            this.printFlightPlanReport(FlightPlanIndex.Active, FlightPlanReport.PostFlight);
          }
        }
      }),
      this.flightPhase.sub((phase) => {
        if (phase === FmgcFlightPhase.Takeoff && this.autoPrint.inFlight.get()) {
          this.printFlightPlanReport(FlightPlanIndex.Active, FlightPlanReport.InFlight);
        }
        if (phase === FmgcFlightPhase.Preflight) {
          this.enginesHaveRun.set(this.enginesRunning.get());
          this.takeoffUtc = null;
          this.landingUtc = null;
        }
      }),
      // FCOM DSC-22-FMS-10-70 P 9: the received company data are printed at reception
      this.fmc.fmgc.data.cpnyFplnAvailable.sub((available) => {
        if (available && this.autoPrint.cpnyInit.get()) {
          this.printInitData(FlightPlanIndex.Uplink, 'FM COMPANY FLIGHT PLAN INITIALIZATION DATA');
        }
      }),
      this.fmc.companyWindRequestState(FlightPlanIndex.Active).sub((state) => {
        if (state === CompanyWindRequestState.Received && this.autoPrint.cpnyWind.get()) {
          this.printWindData();
        }
      }),
      this.preFlightAvailable,
      this.inFlightAvailable,
      this.postFlightAvailable,
    );
  }

  /** Called by the FMC update loop */
  public update(): void {
    this.flightPhase.set(this.fmc.fmgc.getFlightPhase());
    this.enginesRunning.set([1, 2, 3, 4].some((i) => SimVar.GetSimVarValue(`L:A32NX_ENGINE_N2:${i}`, 'number') > 20));
    const onGround = this.fmc.fmgc.isOnGround();
    if (this.wasOnGround && !onGround) {
      this.takeoffUtc = this.utc();
    } else if (!this.wasOnGround && onGround) {
      this.landingUtc = this.utc();
    }
    this.wasOnGround = onGround;
  }

  public destroy(): void {
    this.subs.forEach((s) => s.destroy());
    this.listener.unregister();
  }

  // ---- ACTIVE DATA ----------------------------------------------------------------------------------------------------

  /** FCOM DSC-22-FMS-10-70 P 2: flight plan initialization data (route, then performance data) */
  public printInitData(
    planIndex: FlightPlanIndex = FlightPlanIndex.Active,
    title = 'FM ACTIVE FLIGHT PLAN INITIALIZATION DATA',
  ): void {
    if (!this.fmc.flightPlanInterface.has(planIndex)) {
      return;
    }
    const plan = this.fmc.flightPlanInterface.get(planIndex);
    const pd = plan.performanceData;
    const lines = [
      ...this.header(title),
      '',
      cols(`  FLT NUMBER : ${orDash(plan.flightNumber.get(), '----------')}`, `FROM/TO : ${this.cityPair(plan)}`, 38),
      cols(
        `  CO RTE     : ${orDash(this.companyRoute(planIndex), '----------')}`,
        `ALTN    : ${orDash(plan.alternateDestinationAirport?.ident, '----')}`,
        38,
      ),
      '  ALTN CO RTE: ----------',
      '',
      '  PRIMARY F-PLN',
      '  -------------',
      ...this.routeLines(plan),
      '',
      RULE,
      '',
      ...this.header(title),
      '',
      '  PERFORMANCE DATA',
      '  ----------------',
      cols(
        `   PERF FACTOR : ${this.factor(AirlineModifiableInformation.EK.perfFactor)}`,
        `COST INDEX : ${orDash(pd.costIndex.get()?.toFixed(0))}`,
        38,
      ),
      cols(
        `   IDLE FACTOR : ${this.factor(AirlineModifiableInformation.EK.idleFactor)}`,
        `ZFWCG      : ${this.percent(pd.zeroFuelWeightCenterOfGravity.get())}`,
        38,
      ),
      cols(
        `   CRZ ALT     : ${this.cruiseLevel(pd.cruiseFlightLevel.get())}`,
        `ZFW        : ${this.weight(pd.zeroFuelWeight.get())}`,
        38,
      ),
      cols(
        `   CRZ TEMP    : ${this.signed(pd.cruiseTemperature.get())}`,
        `BLOCK      : ${this.weight(pd.blockFuel.get())}`,
        38,
      ),
      cols(
        `   CRZ TRANS   : ${orDash(pd.transitionAltitude.get()?.toFixed(0))}`,
        `TAXI       : ${this.weight(pd.taxiFuel.get())}`,
        38,
      ),
      `   TROPOPAUSE  : ${orDash(pd.tropopause.get()?.toFixed(0))}`,
      '',
      RULE,
    ];
    this.send(title, lines);
  }

  /** FCOM DSC-22-FMS-10-70 P 2: takeoff data */
  public printTakeoffData(): void {
    const plan = this.fmc.flightPlanInterface.get(FlightPlanIndex.Active);
    const pd = plan.performanceData;
    const title = 'FM ACTIVE TAKE-OFF DATA';
    const runway = plan.originRunway?.ident ?? '---';
    const flaps = pd.takeoffFlaps.get();
    const lines = [
      ...this.header(title),
      '',
      `  RUNWAY ${runway}`,
      cols(
        `    TOW     : ${this.weightKg(this.fmc.getTakeoffWeight())}`,
        `TO SHIFT   : ${orDash(pd.takeoffShift.get()?.toFixed(0), '----')} M`,
      ),
      cols(`    TOCG    : ${this.percent(this.fmc.fmgc.getGrossWeightCg())}`, 'TO LIMIT   : ---- M'),
      cols(
        `    STA     : ${this.signed(SimVar.GetSimVarValue('AMBIENT TEMPERATURE', 'celsius'))}`,
        "MAG WIND   : ---'/---",
      ),
      '    CONTAM  : ----------',
      '    MAX TO -----------',
      `         TEMP : ${pd.flexTakeoffTemperature.get() !== null ? `F${pd.flexTakeoffTemperature.get()!.toFixed(0)}` : '---'}`,
      `         FLAP : ${flaps !== null ? flaps.toFixed(0) : '-'}`,
      `         THS  : ${this.percent(pd.trimmableHorizontalStabilizer.get())}`,
      `         V1   : ${orDash(pd.v1.get()?.toFixed(0))}`,
      `         VR   : ${orDash(pd.vr.get()?.toFixed(0))}`,
      `         V2   : ${orDash(pd.v2.get()?.toFixed(0))}`,
      '',
      cols(
        `  THR RED ALT: ${orDash(pd.thrustReductionAltitude.get()?.toFixed(0), '----')}`,
        `BARO         : ${this.baro()}`,
      ),
      cols(`  ACC ALT    : ${orDash(pd.accelerationAltitude.get()?.toFixed(0), '----')}`, 'NOISE END ALT: ----'),
      cols(
        `  EO ACC ALT : ${orDash(pd.engineOutAccelerationAltitude.get()?.toFixed(0), '----')}`,
        'NOISE SPD    : ----',
      ),
      cols('', 'NOISE THR    : ----'),
      '',
      RULE,
    ];
    this.send(title, lines);
  }

  /** FCOM DSC-22-FMS-10-70 P 3: wind data (climb, cruise and descent winds, destination data, alternate wind) */
  public printWindData(): void {
    const plan = this.fmc.flightPlanInterface.get(FlightPlanIndex.Active);
    const pd = plan.performanceData;
    const title = 'FM ACTIVE WIND DATA';
    const levelWinds = (entries: readonly FlightPlanWindEntry[]) =>
      entries.length === 0
        ? ['    NO WIND']
        : entries.map((e) => `    ${pad(flightLevel(e.altitude), 8)} ${windText(e.vector)}`);

    const cruiseLevels = new Set<number>();
    const cruiseRows: { ident: string; winds: Map<number, WindVector> }[] = [];
    for (const leg of plan.allLegs) {
      if (isLeg(leg) && leg.cruiseWindEntries && leg.cruiseWindEntries.length > 0) {
        const winds = new Map<number, WindVector>();
        for (const entry of leg.cruiseWindEntries) {
          cruiseLevels.add(entry.altitude);
          winds.set(entry.altitude, entry.vector);
        }
        cruiseRows.push({ ident: leg.ident, winds });
      }
    }
    const levels = [...cruiseLevels].sort((a, b) => a - b).slice(0, 4);

    const lines = [
      ...this.header(title),
      '',
      '  CLIMB WINDS',
      '  -----------',
      ...levelWinds(pd.climbWindEntries.get()),
      '',
      '  CRUISE WINDS',
      '  ------------',
      `    ALT:  ${levels.map((l) => padL(flightLevel(l), 9)).join(' ')}`,
      `    NPT   ${levels.map(() => padL('T. WIND', 9)).join(' ')}   SAT/ALT`,
      ...(cruiseRows.length === 0
        ? ['    NO WIND']
        : cruiseRows.map(
            (r) => `    ${pad(r.ident, 6)}${levels.map((l) => padL(windText(r.winds.get(l)), 9)).join(' ')}   ---/---`,
          )),
      '',
      '  DESCENT WINDS',
      '  -------------',
      ...levelWinds(pd.descentWindEntries.get()),
      '',
      '  DEST DATA',
      '  ---------',
      `    QNH       : ${orDash(pd.approachQnh.get()?.toFixed(pd.approachQnh.get()! < 100 ? 2 : 0))}`,
      `    TEMP      : ${this.signed(pd.approachTemperature.get())}`,
      `    MAG WIND  : ${pd.approachWindDirection.get() !== null && pd.approachWindMagnitude.get() !== null ? `${pd.approachWindDirection.get()!.toFixed(0).padStart(3, '0')}/${pd.approachWindMagnitude.get()!.toFixed(0).padStart(3, '0')}` : '---/---'}`,
      '',
      `    TRANS ALT :${orDash(pd.transitionAltitude.get()?.toFixed(0), '-----')}`,
      '',
      '  ALTERNATE WIND',
      '  --------------',
      `    ${pd.alternateWind.get() ? windText(pd.alternateWind.get()) : "---'/---"}`,
      '',
      RULE,
    ];
    this.send(title, lines);
  }

  // ---- F-PLN REPORTS --------------------------------------------------------------------------------------------------

  /** FCOM DSC-22-FMS-10-70 P 4-9: pre-flight, in-flight and post-flight reports of the active or a secondary plan */
  public printFlightPlanReport(planIndex: FlightPlanIndex, report: FlightPlanReport): void {
    if (!this.fmc.flightPlanInterface.has(planIndex)) {
      return;
    }
    const plan = this.fmc.flightPlanInterface.get(planIndex);
    const pd = plan.performanceData;
    const isActive = planIndex === FlightPlanIndex.Active;
    const title = isActive
      ? `FM ACTIVE ${report} REPORT`
      : `FM SECONDARY ${planIndex - FlightPlanIndex.FirstSecondary + 1} ${report} REPORT`;

    const dest = plan.destinationAirport?.ident ?? '----';
    const altn = plan.alternateDestinationAirport?.ident ?? '----';
    const destPrediction = isActive ? this.fmc.guidanceController.vnavDriver.getDestinationPrediction() : null;
    const cruiseLevel = pd.cruiseFlightLevel.get();

    const lines = [
      ...this.header(title),
      '',
      cols('  A/C TYPE   : A380-800', `DATABASE  : ${this.navDatabase ?? '----------'}`),
      cols('  ENG TYPE   : TRENT 972', `CYCLE     : ${this.navCycle ?? '---------------'}`),
      '',
      cols(`  FLT NUMBER : ${orDash(plan.flightNumber.get(), '----------')}`, `FROM/TO   : ${this.cityPair(plan)}`),
      cols(`  CO RTE     : ${orDash(this.companyRoute(planIndex), '----------')}`, `ALTN      : ${altn}`),
      cols('  ALTN CO RTE: ----------', `PAX NBR   : ${orDash(this.paxNumber(planIndex))}`),
      '',
      cols(
        `  PERF FACTOR: ${this.factor(AirlineModifiableInformation.EK.perfFactor)}`,
        `COST INDEX : ${orDash(pd.costIndex.get()?.toFixed(0))}`,
      ),
      `  IDLE FACTOR: ${this.factor(AirlineModifiableInformation.EK.idleFactor)}`,
      '',
    ];

    if (report !== FlightPlanReport.PostFlight) {
      lines.push(
        ' CRUISE FL/STEP START WPT',
        ' ------------------------',
        `   CRZ FL 1 : ${this.cruiseLevel(cruiseLevel)}`,
      );
      let step = 2;
      for (const leg of plan.allLegs) {
        if (isLeg(leg) && leg.cruiseStep) {
          lines.push(`   CRZ FL ${step} : ${flightLevel(leg.cruiseStep.toAltitude)}/${leg.ident}`);
          step++;
        }
      }
      lines.push('');
    }

    lines.push(
      ' FLIGHT PLAN DATA',
      ' ----------------',
      `                 DIST     TIME     CRZ FL`,
      `   ${pad(`DEST-${dest}`, 11)}: ${padL(destPrediction ? destPrediction.distanceFromAircraft.toFixed(0) : '----', 5)}    ${hhmm(destPrediction ? this.utc() + destPrediction.secondsFromPresent : null)}    ${this.cruiseLevel(cruiseLevel)}`,
      `   ${pad(`ALTN-${altn}`, 11)}: ----     --:--    FL---`,
      '',
      cols(
        `   DEP RWY    : ${orDash(plan.originRunway?.ident)}`,
        `ARV PRC   : ${orDash(plan.arrival?.ident, '------')}`,
      ),
      cols(
        `   DEP PRC    : ${orDash(plan.originDeparture?.ident, '------')}`,
        `APR PRC   : ${orDash(plan.approach?.ident, '------')}`,
      ),
      cols('', `ARV RWY   : ${orDash(plan.destinationRunway?.ident)}`),
      '',
      ' WPT      TIME  SPD/ALT     FOB  T. WIND   TAS SAT  CRS DIST',
      ' ' + '-'.repeat(WIDTH - 2),
    );

    if (isActive && report !== FlightPlanReport.PreFlight) {
      lines.push(' HISTORY VALUES');
      const last = this.fmc.lastSequencedWaypoint;
      lines.push(
        last
          ? ` ${pad(last.ident, 8)}${hhmm(this.utcOfAbsoluteTime(last.absoluteTimeSeconds))} ---/${padL(last.altitude !== null ? last.altitude.toFixed(0) : '-----', 5)} ${padL(this.weight(last.fuelOnBoard), 5)} ${last.windDirection !== null && last.windSpeed !== null ? `${last.windDirection.toFixed(0).padStart(3, '0')}'/${last.windSpeed.toFixed(0).padStart(3, '0')}` : "---'/---"} --- ${padL(last.staticAirTemperature !== null ? this.signed(last.staticAirTemperature) : '---', 3)}`
          : ' NONE',
      );
      lines.push('');
    }

    if (report !== FlightPlanReport.PostFlight) {
      lines.push(' PREDICTED VALUES');
      lines.push(...this.predictionLines(planIndex));
      lines.push('');
    }

    if (report === FlightPlanReport.InFlight) {
      lines.push(
        ` FUEL INFORMATION AT ${hhmm(this.utc())}`,
        ' -------------------',
        '   WEIGHT     CG     FOB   RSV/RSV%   FINAL   EXTRA',
        `   ${padL(this.weight(this.grossWeight()), 6)}  ${padL(this.percent(this.fmc.fmgc.getGrossWeightCg()), 5)} ${padL(this.weight(this.fuelOnBoard()), 6)}  --.-/--.-%  ${padL(this.weight(pd.finalHoldingFuel.get()), 5)}  ${padL(this.weightKg(this.fmc.getExtraFuel(planIndex)), 6)}`,
        '',
      );
    } else if (report === FlightPlanReport.PostFlight) {
      lines.push(
        ' FUEL AND TIME SUMMARY',
        ' ---------------------',
        cols('   START UP', 'SHUT DOWN'),
        cols(
          `     FUEL   : ${this.weight(this.startUp?.fuelTonnes ?? null)}`,
          `  FUEL     : ${this.weight(this.shutDown?.fuelTonnes ?? null)}`,
        ),
        cols(
          `     WEIGHT : ${this.weight(this.startUp?.weightTonnes ?? null)}`,
          `  WEIGHT   : ${this.weight(this.shutDown?.weightTonnes ?? null)}`,
        ),
        cols(`     TIME   : ${hhmm(this.startUp?.utc)}`, `  TIME     : ${hhmm(this.shutDown?.utc)}`),
        cols(`     TO TIME: ${hhmm(this.takeoffUtc)}`, `  LDG TIME : ${hhmm(this.landingUtc)}`),
        '',
        ' IRS DATA',
        ' --------',
        '                        IRS 1     IRS 2     IRS 3',
        '   AVERAGE DRIFT   -  --.- NM/H --.- NM/H --.- NM/H',
        '   RESIDUAL GND SPD - --.- KTS  --.- KTS  --.- KTS',
        '',
      );
    } else {
      lines.push(
        ' FUEL PREDICTIONS',
        ' ----------------',
        cols(
          `   TAXI       : ${this.weight(pd.taxiFuel.get())}`,
          `ZFWCG     : ${this.percent(pd.zeroFuelWeightCenterOfGravity.get())}`,
        ),
        cols(
          `   TRIP (DEST): ${this.weightKg(this.fmc.getTripFuel(planIndex))}`,
          `ZFW       : ${this.weight(pd.zeroFuelWeight.get())}`,
        ),
        cols(
          `   RSV        : ${this.weightKg(this.fmc.getRouteReserveFuel(planIndex))}`,
          `TOW       : ${this.weightKg(this.fmc.getTakeoffWeight(planIndex))}`,
        ),
        cols(
          `   ALTN       : ${this.weight(pd.alternateFuel.get())}`,
          `LW        : ${this.weightKg(this.fmc.getLandingWeight(planIndex))}`,
        ),
        cols(
          `   FINAL      : ${this.weight(pd.finalHoldingFuel.get())}`,
          `CG        : ${this.percent(this.fmc.fmgc.getGrossWeightCg())}`,
        ),
        `   EXTRA      : ${this.weightKg(this.fmc.getExtraFuel(planIndex))}`,
        '   ------------------',
        `   BLOCK      : ${this.weight(pd.blockFuel.get())}`,
        '',
      );
    }

    if (report !== FlightPlanReport.PreFlight) {
      const pn = this.softwareVersion ?? '---------------';
      lines.push(
        cols(' FMS 1: FMC-A P/N STATUS', 'FMS 2: FMC-B P/N STATUS'),
        cols(' -----------------------', '-----------------------'),
        cols('                    FMS SOFTWARE', ''),
        cols(` ${pn}`, pn),
        cols('                    NAV DATABASE', ''),
        cols(` ${this.navDatabase ?? '----------'}`, this.navDatabase ?? '----------'),
        '',
      );
    }
    lines.push(RULE);
    this.send(title, lines);
  }

  // ---- helpers --------------------------------------------------------------------------------------------------------

  private navDatabase: string | null = null;

  private navCycle: string | null = null;

  /** The navigation database ident and cycle, as on the DATA / STATUS page */
  private refreshDatabase(): void {
    NavigationDatabaseService.activeDatabase
      .getDatabaseIdent()
      .then((db) => {
        if (!db) {
          return;
        }
        this.navDatabase = `${db.provider.substring(0, 2).toUpperCase()}${db.airacCycle}0001`;
        const from = db.effectiveFrom?.match(/^\d{2}(\d{2})(\d{2})$/) ?? db.effectiveFrom?.match(/(\d{2})(\d{2})$/);
        const to = db.effectiveTo?.match(/(\d{2})(\d{2})$/);
        this.navCycle =
          from && to
            ? `${from[2]} ${MONTHS[Number(from[1]) - 1] ?? '---'}-${to[2]} ${MONTHS[Number(to[1]) - 1] ?? '---'}`
            : db.airacCycle;
      })
      .catch(() => {});
  }

  private send(title: string, lines: string[]): void {
    this.refreshDatabase();
    const page: FmsPrintPage = { title, utcSeconds: this.utc(), lines };
    this.listener.triggerToAllSubscribers(FMS_PRINT_EVENT, JSON.stringify(page));
  }

  private header(title: string): string[] {
    const day = SimVar.GetSimVarValue('E:ZULU DAY OF MONTH', 'number');
    const month = SimVar.GetSimVarValue('E:ZULU MONTH OF YEAR', 'number');
    const year = SimVar.GetSimVarValue('E:ZULU YEAR', 'number');
    const date = `${day.toFixed(0).padStart(2, '0')} ${MONTHS[month - 1] ?? '---'} ${(year % 100).toFixed(0).padStart(2, '0')}`;
    return [RULE, cols(` ${title}`, `DATE: ${date}`, 46), cols('', `TIME: ${hhmm(this.utc())}`, 46)];
  }

  private routeLines(plan: ReturnType<FlightManagementComputer['flightPlanInterface']['get']>): string[] {
    const lines: string[] = [];
    if (plan.originDeparture) {
      lines.push(`   DEP PRC: ${plan.originDeparture.ident}`);
    }
    let previousAirway: string | undefined;
    const enrouteStart =
      plan.originSegment.legCount + plan.departureRunwayTransitionSegment.legCount + plan.departureSegment.legCount;
    const enrouteEnd = enrouteStart + plan.departureEnrouteTransitionSegment.legCount + plan.enrouteSegment.legCount;
    for (let i = enrouteStart; i < enrouteEnd; i++) {
      const leg = plan.allLegs[i];
      if (!isLeg(leg)) {
        continue;
      }
      const airway = leg.annotation || undefined;
      if (airway && airway === previousAirway) {
        lines[lines.length - 1] = `   ${pad(airway, 5)}: ${leg.ident}`;
        continue;
      }
      lines.push(`   ${pad(airway ?? 'DIR', 5)}: ${leg.ident}`);
      previousAirway = airway;
    }
    if (plan.arrival) {
      lines.push(`   ARV PRC: ${plan.arrival.ident}`);
    }
    if (plan.approach) {
      lines.push(`   ARV PRC: ${plan.approach.ident}`);
    }
    if (plan.destinationRunway) {
      lines.push(`   ARV RWY: ${plan.destinationRunway.ident.replace(/^RW/, '')}`);
    }
    return lines.length > 0 ? lines : ['   NO ROUTE'];
  }

  /** The predicted values of the flight plan waypoints (active plan: the FMS predictions) */
  private predictionLines(planIndex: FlightPlanIndex): string[] {
    const plan = this.fmc.flightPlanInterface.get(planIndex);
    const predictions =
      planIndex === FlightPlanIndex.Active
        ? this.fmc.guidanceController.vnavDriver.mcduProfile?.waypointPredictions
        : undefined;
    const lines: string[] = [];
    const start = planIndex === FlightPlanIndex.Active ? Math.max(0, plan.activeLegIndex - 1) : 0;
    for (let i = start; i < plan.allLegs.length && lines.length < 60; i++) {
      const leg = plan.allLegs[i];
      if (!isLeg(leg)) {
        continue;
      }
      const p = predictions?.get(i);
      if (!p) {
        lines.push(` ${pad(leg.ident, 8)}--:-- ---/-----  ---.- ---'/--- --- ---  --- ----`);
        continue;
      }
      const speed = p.speed < 1 ? `.${Math.round(p.speed * 100).toFixed(0)}` : p.speed.toFixed(0);
      const altitude = p.altitude > 10000 ? flightLevel(p.altitude) : p.altitude.toFixed(0);
      const fob = this.weightKg(UnitType.POUND.convertTo(p.estimatedFuelOnBoard, UnitType.KILOGRAM));
      const wind = typeof p.windPrediction === 'number' ? "---'/---" : windText(p.windPrediction);
      lines.push(
        ` ${pad(leg.ident, 8)}${hhmm(this.utc() + p.secondsFromPresent)} ${padL(speed, 3)}/${padL(altitude, 5)} ${padL(fob, 6)} ${wind} --- ---  --- ${padL(p.distanceFromAircraft.toFixed(0), 4)}`,
      );
    }
    return lines.length > 0 ? lines : [' NONE'];
  }

  private hasFlightPlanData(planIndex: FlightPlanIndex): boolean {
    if (!this.fmc.flightPlanInterface.has(planIndex)) {
      return false;
    }
    const plan = this.fmc.flightPlanInterface.get(planIndex);
    return plan.originAirport !== undefined && plan.destinationAirport !== undefined;
  }

  private cityPair(plan: ReturnType<FlightManagementComputer['flightPlanInterface']['get']>): string {
    return `${plan.originAirport?.ident ?? '----'}/${plan.destinationAirport?.ident ?? '----'}`;
  }

  private companyRoute(planIndex: FlightPlanIndex): string | null {
    return this.fmc.fmgc.data.companyRouteIdent(planIndex).get() ?? null;
  }

  private paxNumber(planIndex: FlightPlanIndex): string | null {
    const pd = this.fmc.flightPlanInterface.get(planIndex).performanceData as {
      paxNumber?: Subscribable<number | null>;
    };
    return pd.paxNumber?.get()?.toFixed(0) ?? null;
  }

  private utc(): number {
    return SimVar.GetSimVarValue('E:ZULU TIME', 'seconds');
  }

  private utcOfAbsoluteTime(absoluteTimeSeconds: number): number {
    return this.utc() - (SimVar.GetSimVarValue('E:ABSOLUTE TIME', 'seconds') - absoluteTimeSeconds);
  }

  private fuelOnBoard(): number | null {
    return this.fmc.fmgc.getFOB() ?? null;
  }

  private grossWeight(): number | null {
    const gw = this.fmc.fmgc.getGrossWeightKg();
    return gw !== null && gw !== undefined ? gw / 1000 : null;
  }

  private get usesKilograms(): boolean {
    return NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').get();
  }

  /** A weight in tonnes, printed in thousands of the selected unit (T or KLB, as on the FUEL&LOAD page) */
  private weight(tonnes: number | null | undefined): string {
    if (tonnes === null || tonnes === undefined || !Number.isFinite(tonnes)) {
      return '---.-';
    }
    const value = this.usesKilograms ? tonnes : UnitType.KILOGRAM.convertTo(tonnes, UnitType.POUND);
    return value.toFixed(1);
  }

  private weightKg(kilograms: number | null | undefined): string {
    return this.weight(kilograms === null || kilograms === undefined ? null : kilograms / 1000);
  }

  private percent(value: number | null | undefined): string {
    return value === null || value === undefined || !Number.isFinite(value) ? '--.- %' : `${value.toFixed(1)} %`;
  }

  private signed(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '---';
    }
    return `${value >= 0 ? '+' : '-'}${Math.abs(Math.round(value)).toFixed(0).padStart(2, '0')}`;
  }

  private factor(value: number): string {
    return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}`;
  }

  private cruiseLevel(fl: number | null | undefined): string {
    return fl === null || fl === undefined ? 'FL---' : `FL${fl.toFixed(0).padStart(3, '0')}`;
  }

  private baro(): string {
    const hpa = SimVar.GetSimVarValue('KOHLSMAN SETTING MB:1', 'millibars');
    return Number.isFinite(hpa) ? `E${Math.round(hpa).toFixed(0)}` : '-----';
  }
}
