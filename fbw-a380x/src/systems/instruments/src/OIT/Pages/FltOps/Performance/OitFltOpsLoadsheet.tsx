//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  ConsumerSubject,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { NXUnits, SeatFlags, getSimBriefOfp } from '@flybywiresim/fbw-sdk';
import { A380AocPrintEvents, AocPrintout } from '@shared/AocPrintout';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { OitPerfEntryFormat, OitPerfTextFormat } from './OitPerfEntryFormat';
import { OitPerfPageBase } from './OitPerfPageBase';
import {
  A380_CERTIFIED_WEIGHTS,
  A380_TAKEOFF_CALCULATOR,
} from '../../../System/Performance/A380PerformanceCalculators';
import {
  DETAILED_ENTRY_MODE,
  LOADSHEET_ENTRY_MODES,
  missingFltOpsStsFields,
} from '../../../System/Performance/FltOpsPerformanceSession';
import {
  KG_PER_LB,
  formatWholeWeight,
  formatWeight,
  missingParameterErrors,
  parseWeightEntry,
  weightToDisplayUnit,
  weightUnitLabel,
} from '../../../System/Performance/PerformanceEntries';
import {
  LOADSHEET_AIRCRAFT,
  LOADSHEET_DOCG,
  LOADSHEET_FUEL_TANKS,
  LoadsheetConfiguration,
  LoadsheetResults,
  TRIM_TANK_INDEX,
  armToPercentMac,
  computeLoadsheet,
  loadsheetPrintout,
  loadsheetReportLines,
  ltsEditionAllowed,
  missingLoadsheetParameters,
  takeoffThsText,
} from '../../../System/Performance/Loadsheet';
import {
  CABIN_SECTIONS,
  CABIN_SECTION_STATIONS,
  CARGO_COMPARTMENTS,
  CATERING_OPTIONS,
  CREW_OPTIONS,
  MISC_OPTIONS,
  PaxByType,
  computeDetailedZeroFuel,
  detailedDryOperatingWeight,
  detailedLoadsheetReportLines,
  formatPaxEntry,
  missingDetailedParameters,
  parsePaxEntry,
  seatedPax,
  standardPaxDistribution,
  undistributedPayload,
} from '../../../System/Performance/LoadsheetDetailed';
import {
  RefuelZfData,
  RefuelZfEntries,
  RefuelZfSource,
  cgTargetingDistribution,
  groundTransferAdvice,
  groundTransferLines,
  refuelZfData,
  refuelZfFields,
  takeoffCgLimits,
} from '../../../System/Performance/LoadsheetFuel';
import {
  FUEL_MODE_LABELS,
  FUEL_MODE_MANUAL,
  FUEL_MODE_TRIM_ADJUSTMENT,
  displayedTankTotal,
  manualDistribution,
  fitManualDistributionToFob,
  manualDistributionMatchesFob,
  trimAdjustmentDistribution,
} from '../../../System/Performance/LoadsheetFuelModes';
import { A380_CG_LIMITS } from '../../../System/Performance/CgEnvelopes';
import { OitCgDiagram } from './OitCgDiagram';
import {
  CG_DIAGRAM_SIZE,
  MORE_ADVICE_COLUMN_WIDTH,
  MORE_LINE_WIDTHS,
  MORE_RESULTS_COLUMN_WIDTH,
  RESULTS_COLUMN_WIDTH,
  RESULTS_LINE_WIDTHS,
  ResultLineWidths,
  SMALL_CG_DIAGRAM_SIZE,
} from './LoadsheetLayout';
import { applicationExportIdentifier } from '../../../System/OisExportBox';

interface OitFltOpsLoadsheetProps extends AbstractOitFltOpsPageProps {}

/** The tank fields of the MANUAL DISTR mode accept up to the largest tank at the highest fuel density, kg */
const MANUAL_TANK_MAX = 45_000;

/** Design choice: the standard taxi fuel when the crew enters none, the FBW A380X FMS taxi fuel default */
const STANDARD_TAXI_FUEL = 1_500;

/** The passenger weight of the LMC when the aircraft has none set, kg */
const DEFAULT_PER_PAX_WEIGHT = 84;

/** EDITION NBR of the detailed loadsheet */
const EDITION_NUMBERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];

/** The LTS kinds of the DETAILED mode: the index of each in the radio buttons of LTS EDITION */
const DETAILED_LTS = 0;
const REDUCED_LTS = 1;

/**
 * LOADSHEET in REDUCED or DETAILED mode: the ZFW/CG (entered, or computed from the crew, the passengers and the cargo
 * with their distribution) and the fuel give the TOW/CG and LW/CG with the fuel distributed as the FQMS CG targeting
 * does (REFUEL ZF DATA), MORE gives the automatic ground transfer, and LTS EDITION writes the reduced or detailed
 * loadsheet, which can be printed (also with PRINT of the FUNCTIONS list) or exported: EXPORT puts it in the EXPORT BOX,
 * from where the crew sends it to the ground.
 */
export class OitFltOpsLoadsheet extends OitPerfPageBase<OitFltOpsLoadsheetProps, LoadsheetResults> {
  protected readonly pageId = 'loadsheet';

  protected readonly application = 'LOADSHEET';

  private readonly sts = this.props.container.laptopData;

  private readonly state = this.session.loadsheet;

  private readonly metric = NXUnits.metricWeight;

  private readonly weightUnit = weightUnitLabel(this.metric);

  private readonly missingStsFields = missingFltOpsStsFields(
    'LOADSHEET',
    this.sts.fltNumber.get(),
    this.sts.fromAirport.get(),
    this.sts.toAirport.get(),
  );

  // The view, tab and tanks shown stay in the session: the switching bar brings the page back as the crew left it
  private readonly view = this.state.view;

  private readonly tab = this.state.tab;

  private readonly allTanksShown = this.state.allTanksShown;

  private readonly detailed = this.state.entryMode.map((mode) => mode === DETAILED_ENTRY_MODE);

  private readonly reduced = this.detailed.map((detailed) => !detailed);

  /** The predicted fuel of each tank after the refuel with the CG targeting, kg */
  private readonly distribution = Subject.create<number[]>(LOADSHEET_FUEL_TANKS.map(() => 0));

  /** The manual distribution the last computation ran on (rounding remainder placed), null in the other modes */
  private fittedDistribution: number[] | null = null;

  private readonly weightFormat = (maxWeight: number) =>
    new OitPerfEntryFormat<number>(
      (text) => parseWeightEntry(text, this.metric, maxWeight),
      (kg) => formatWeight(kg, this.metric),
    );

  private readonly mtowFormat = this.weightFormat(A380_CERTIFIED_WEIGHTS.mtow);

  private readonly mlwFormat = this.weightFormat(A380_CERTIFIED_WEIGHTS.mlw);

  private readonly zfwFormat = this.weightFormat(LOADSHEET_AIRCRAFT.mzfw);

  private readonly fuelFormat = this.weightFormat(LOADSHEET_AIRCRAFT.mzfw);

  private readonly cgFormat = new OitPerfEntryFormat<number>(
    (text) => (/^\d{1,2}(\.\d)?$/.test(text.trim()) ? parseFloat(text) : null),
    (cg) => cg.toFixed(1),
    4,
  );

  private readonly densityFormat = new OitPerfEntryFormat<number>(
    (text) => {
      const value = parseFloat(text);
      return /^\d(\.\d{1,3})?$/.test(text.trim()) && value >= 0.7 && value <= 0.9 ? value : null;
    },
    (density) => density.toFixed(3),
    5,
  );

  private readonly paxFormat = new OitPerfEntryFormat<number>(
    (text) => (/^[+-]?\d{1,3}$/.test(text.trim()) ? parseInt(text.trim(), 10) : null),
    (pax) => (pax > 0 ? `+${pax}` : pax.toFixed(0)),
    4,
  );

  /** DETAILED PAX: adults/children/infants */
  private readonly paxByTypeFormat = new OitPerfEntryFormat<PaxByType>(parsePaxEntry, formatPaxEntry, 11);

  private readonly sectionPaxFormat = new OitPerfEntryFormat<number>(
    (text) => (/^\d{1,3}$/.test(text.trim()) ? parseInt(text.trim(), 10) : null),
    (pax) => pax.toFixed(0),
    3,
  );

  /**
   * A cargo weight entered in kg (lb)
   * @param pattern the valid entries
   * @param maxDigits the longest entry
   * @returns the format
   */
  private cargoWeightFormat(pattern: RegExp, maxDigits: number): OitPerfEntryFormat<number> {
    return new OitPerfEntryFormat<number>(
      (text) => {
        if (!pattern.test(text.trim())) {
          return null;
        }
        const value = parseInt(text.trim(), 10);
        return this.metric ? value : value * KG_PER_LB;
      },
      (kg) => formatWholeWeight(kg, this.metric),
      maxDigits,
    );
  }

  /** The LMC cargo: a change, which may be negative */
  private readonly cargoFormat = this.cargoWeightFormat(/^[+-]?\d{1,5}$/, 6);

  private readonly reportCargoFormat = this.cargoWeightFormat(/^\d{1,6}$/, 7);

  private readonly textFormat = new OitPerfTextFormat(24);

  private readonly notesFormat = new OitPerfTextFormat(40);

  private readonly cargoUnit = this.metric ? 'kg' : 'lbs';

  protected readonly results = this.state.computation.map((c) => c?.results ?? null);

  private readonly missingParameters = MappedSubject.create(
    () => this.missingEntries(),
    this.state.entryMode,
    this.state.zfw,
    this.state.zfcg,
    this.state.fob,
    this.state.tripFuel,
    this.state.pax,
    this.state.cargo,
  );

  private readonly errorLines = this.errorLinesOf(this.missingParameters, this.state.computation);

  private readonly hideResults = this.results.map((r) => r === null);

  private readonly hideErrors = this.errorLines.map((lines) => lines.length === 0);

  private readonly errorListRef = FSComponent.createRef<HTMLDivElement>();

  private readonly computeDisabled = this.missingParameters.map((m) => m.length > 0);

  private readonly editDisabled = this.results.map((r) => !ltsEditionAllowed(r));

  private readonly reportRef = FSComponent.createRef<HTMLDivElement>();

  /** The sim UTC time, ms, for the date and time of the loadsheet */
  private readonly simTime = ConsumerSubject.create(this.props.bus.getSubscriber<ClockEvents>().on('simTime'), 0);

  /** The REFUEL ZF DATA fields show the values of the selected button */
  private readonly refuelZfwShown = Subject.create<number | null>(null);

  private readonly refuelZfcgShown = Subject.create<number | null>(null);

  private readonly moreLinesRef = FSComponent.createRef<HTMLDivElement>();

  constructor(props: OitFltOpsLoadsheetProps) {
    super(props);
    if (this.missingStsFields.length === 0) {
      this.session.onLoadsheetShown();
      this.state.restoreView();
      this.takeLogbookStatus();
      this.prefillLoading();
      this.state.prefillRefuelZfData(
        SimVar.GetSimVarValue('L:A32NX_FUEL_REFUEL_ZFW', 'number'),
        SimVar.GetSimVarValue('L:A32NX_FUEL_REFUEL_ZFCG', 'number'),
      );
      if (this.state.isDetailed()) {
        this.prefillDetailed();
      }
    }
  }

  /** @returns the missing parameters of the entry mode */
  private missingEntries(): string[] {
    const s = this.state;
    const fuel = missingLoadsheetParameters(s.loading(STANDARD_TAXI_FUEL)).filter((p) => p !== 'ZFW' && p !== 'ZFCG');
    if (s.isDetailed()) {
      return [...missingDetailedParameters(s.detailedLoading()), ...fuel];
    }
    return missingLoadsheetParameters(s.loading(STANDARD_TAXI_FUEL));
  }

  /**
   * Design choice: the LOADING panel starts with the values of the ground, so that the crew only checks them: the ZFW
   * and ZFCG of the aircraft loading, the fuel on board, and the trip and taxi fuel of the SimBrief OFP. The crew can
   * overwrite each of them.
   */
  private async prefillLoading(): Promise<void> {
    const prefilled = this.state.prefillFromAircraft(
      SimVar.GetSimVarValue('L:A32NX_AIRFRAME_ZFW', 'number'),
      SimVar.GetSimVarValue('L:A32NX_AIRFRAME_ZFW_CG_PERCENT_MAC', 'number'),
      SimVar.GetSimVarValue('FUEL TOTAL QUANTITY WEIGHT', 'kilograms'),
    );
    if (!prefilled) {
      return;
    }
    try {
      const ofp = await getSimBriefOfp();
      const kg = (value: number) => (ofp.units === 'lbs' ? value * KG_PER_LB : value);
      if (this.state.tripFuel.get() === null && ofp.fuel.enrouteBurn > 0) {
        this.state.tripFuel.set(kg(ofp.fuel.enrouteBurn));
      }
      if (this.state.taxiFuel.get() === null && ofp.fuel.taxi > 0) {
        this.state.taxiFuel.set(kg(ofp.fuel.taxi));
      }
    } catch (e) {
      console.warn('[OIT] LOADSHEET: no SimBrief OFP', e);
    }
  }

  /** Design choice: the DETAILED entries start with the passengers and the cargo loaded on the aircraft */
  private prefillDetailed(): void {
    this.state.prefillDetailedFromAircraft(
      CABIN_SECTION_STATIONS.map((stations) =>
        stations.reduce(
          (sum, station) =>
            sum + new SeatFlags(SimVar.GetSimVarValue(station.simVar, 'number'), station.seats).getTotalFilledSeats(),
          0,
        ),
      ),
      CARGO_COMPARTMENTS.map((compartment) => SimVar.GetSimVarValue(compartment.simVar, 'number')),
    );
  }

  /** @returns the CONFIGURATION panel, with the DOW/DOCG of the crew composition in DETAILED mode */
  private configuration(): LoadsheetConfiguration {
    const s = this.state;
    const dryOperating = detailedDryOperatingWeight(s.crew.get());
    return {
      mtow: s.mtow.get() ?? A380_CERTIFIED_WEIGHTS.mtow,
      mtowFromTakeoffPerf: s.mtowFromTakeoffPerf.get(),
      mlw: s.mlw.get() ?? A380_CERTIFIED_WEIGHTS.mlw,
      mlwFromLandingPerf: s.mlwFromLandingPerf.get(),
      dryOperating: s.isDetailed() ? { dow: dryOperating.dow, docg: armToPercentMac(dryOperating.arm) } : undefined,
    };
  }

  private perPaxWeight(): number {
    return SimVar.GetSimVarValue('L:A32NX_WB_PER_PAX_WEIGHT', 'kilograms') || DEFAULT_PER_PAX_WEIGHT;
  }

  /** @returns the ZFW/ZFCG of the loading entries, null while they are incomplete */
  private loadingZeroFuel(): RefuelZfData | null {
    const s = this.state;
    if (s.isDetailed()) {
      const detailed = s.detailedLoading();
      if (missingDetailedParameters(detailed).length > 0) {
        return null;
      }
      return computeDetailedZeroFuel(detailed, this.perPaxWeight()).zeroFuel;
    }
    const zfw = s.zfw.get();
    const zfcg = s.zfcg.get();
    return zfw !== null && zfcg !== null ? { zfw, zfcg } : null;
  }

  /** @returns the ZFW/ZFCG of the REFUEL ZF DATA button selected, null while it is not known */
  private refuelZfData(): RefuelZfData | null {
    const s = this.state;
    return refuelZfData(s.refuelZfSource.get(), this.refuelZfEntries(), this.loadingZeroFuel());
  }

  private refuelZfEntries(): RefuelZfEntries {
    return { zfw: this.state.refuelZfw.get(), zfcg: this.state.refuelZfcg.get() };
  }

  /** The exact tank quantities the MANUAL DISTR fields started with; the boxes only show them rounded */
  private manualBaseline: number[] = [];

  private density(): number {
    return this.state.density.get() ?? LOADSHEET_AIRCRAFT.standardDensity;
  }

  /** The FUEL DISTR panel and the REFUEL ZF DATA fields follow the entries */
  private updateFuelDistribution(): void {
    const s = this.state;
    const loading = this.loadingZeroFuel();
    const shown = refuelZfFields(s.refuelZfSource.get(), this.refuelZfEntries(), loading);
    this.refuelZfwShown.set(shown.zfw);
    this.refuelZfcgShown.set(shown.zfcg !== null ? Math.round(shown.zfcg * 10) / 10 : null);
    const refuelZf = refuelZfData(s.refuelZfSource.get(), this.refuelZfEntries(), loading);
    const fob = this.state.fob.get() ?? 0;
    const mode = s.fuelMode.get();
    if (mode === FUEL_MODE_MANUAL) {
      this.distribution.set(
        manualDistribution(
          s.manualFuel.map((tank) => tank.get()),
          this.density(),
          this.manualBaseline,
          this.metric,
        ),
      );
    } else if (mode === FUEL_MODE_TRIM_ADJUSTMENT && s.trimFuel.get() !== null) {
      this.distribution.set(trimAdjustmentDistribution(fob, s.trimFuel.get()!, this.density()));
    } else {
      this.distribution.set(
        refuelZf !== null ? cgTargetingDistribution(fob, refuelZf, this.density()) : LOADSHEET_FUEL_TANKS.map(() => 0),
      );
    }
  }

  /**
   * The fuel mode changes: the fields of the new mode start with the distribution shown so far.
   * @param mode the new mode
   */
  private onFuelModeChanged(mode: number): void {
    const s = this.state;
    const shown = this.distribution.get();
    if (shown.reduce((sum, kg) => sum + kg, 0) <= 0) {
      return;
    }
    if (mode === FUEL_MODE_TRIM_ADJUSTMENT) {
      s.trimFuel.set(shown[TRIM_TANK_INDEX]);
    } else if (mode === FUEL_MODE_MANUAL) {
      this.manualBaseline = [...shown];
      s.manualFuel.forEach((tank, i) => tank.set(shown[i]));
    }
  }

  private compute(): void {
    const s = this.state;
    let loading = s.loading(STANDARD_TAXI_FUEL);
    const fail = (errors: string[]) => this.session.onLoadsheetComputed({ results: null, errors });
    if (s.isDetailed()) {
      const detailed = s.detailedLoading();
      const missing = missingDetailedParameters(detailed);
      if (missing.length > 0) {
        fail(missingParameterErrors(missing));
        return;
      }
      const { zeroFuel, errors } = computeDetailedZeroFuel(detailed, this.perPaxWeight());
      if (zeroFuel === null) {
        fail(errors);
        return;
      }
      loading = { ...loading, zfw: zeroFuel.zfw, zfcg: zeroFuel.zfcg, lmcPax: 0, lmcCargo: 0 };
    }
    const refuelZf = this.refuelZfData();
    if (refuelZf === null) {
      fail(missingParameterErrors(['REFUEL ZF DATA']));
      return;
    }
    this.updateFuelDistribution();
    this.fittedDistribution = null;
    let distribution = this.distribution.get();
    if (s.fuelMode.get() === FUEL_MODE_MANUAL) {
      const fob = loading.fob ?? 0;
      if (!manualDistributionMatchesFob(distribution, fob, this.metric)) {
        fail(['FUEL DISTR FOB differs from the FOB of the loading']);
        return;
      }
      const fitted = fitManualDistributionToFob(distribution, fob, this.density());
      if (fitted === null) {
        fail(['FUEL DISTR FOB differs from the FOB of the loading']);
        return;
      }
      distribution = fitted;
      this.fittedDistribution = fitted;
    }
    this.session.onLoadsheetComputed(
      computeLoadsheet(this.configuration(), loading, distribution, this.perPaxWeight(), A380_CG_LIMITS),
    );
  }

  private generate(): void {
    const results = this.results.get();
    if (!ltsEditionAllowed(results)) {
      return;
    }
    const s = this.state;
    const flight = {
      flightNumber: this.sts.fltNumber.get() ?? '',
      registration: 'F-FBWA',
      from: this.sts.fromAirport.get() ?? '',
      to: this.sts.toAirport.get() ?? '',
    };
    const date = new Date(this.simTime.get());
    const lines =
      s.isDetailed() && s.ltsKind.get() === DETAILED_LTS
        ? detailedLoadsheetReportLines(
            {
              checkedBy: s.checkedBy.get() ?? '',
              approvedBy: s.approvedBy.get() ?? '',
              captInfoNotes: s.captInfoNotes.map((line) => line.get() ?? ''),
              paxPerClass: s.paxPerClass.get() ?? '',
              edition: s.editionNumber.get() + 1,
            },
            flight,
            this.configuration(),
            s.detailedLoading(),
            results!,
            date,
            this.metric,
          )
        : loadsheetReportLines(s.edition(), flight, this.configuration(), results!, date, this.metric);
    s.report.set(lines);
    this.view.set('display');
  }

  /** @returns the loadsheet as a printout, null while there is none */
  private printout(): AocPrintout | null {
    const report = this.state.report.get();
    return report !== null ? loadsheetPrintout(report) : null;
  }

  /** PRINT: the loadsheet goes to the cockpit printer through the AOC printout route */
  private print(): void {
    const printout = this.printout();
    if (printout !== null) {
      this.props.bus.getPublisher<A380AocPrintEvents>().pub('aocPrintMessage', printout, true, false);
    }
  }

  /** EXPORT: the loadsheet enters the EXPORT BOX of the laptop */
  private exportReport(): void {
    if (this.state.report.get() === null) {
      return;
    }
    const identifier = applicationExportIdentifier(
      'LOADSHEET',
      this.sts.fltNumber.get() ?? '',
      this.sts.fromAirport.get() ?? '',
      this.sts.toAirport.get() ?? '',
      this.simTime.get(),
    );
    this.props.container.laptop.exportBox.add(identifier, 'LOADSHEET', this.simTime.get());
  }

  private showReport(lines: string[] | null): void {
    const element = this.reportRef.getOrDefault();
    if (element) {
      element.textContent = (lines ?? []).join('\n');
    }
  }

  /**
   * The AGT information of the MORE panel, for the results
   * @param results the loadsheet results, null without
   */
  private showMoreLines(results: LoadsheetResults | null): void {
    const element = this.moreLinesRef.getOrDefault();
    if (!element) {
      return;
    }
    OitPerfPageBase.clear(element);
    if (results === null) {
      return;
    }
    const advice = groundTransferAdvice(
      { zfw: results.zfw, zfcg: results.zfcg },
      this.fittedDistribution ?? this.distribution.get(),
      results.tow,
      results.towCg,
      takeoffCgLimits(results.tow, (cg, weight) => A380_TAKEOFF_CALCULATOR.isCgWithinLimits(cg, weight)),
      this.density(),
    );
    for (const line of groundTransferLines(advice, results.towCg, this.metric)) {
      FSComponent.render(
        <div class={{ 'oit-perf-more-line': true, red: line.warning }}>{line.text === '' ? ' ' : line.text}</div>,
        element,
      );
    }
  }

  /**
   * The entry mode changes: the tabs follow the mode, the DETAILED fields take the aircraft loading
   * @param detailed whether the entries are now DETAILED
   */
  private onEntryModeChanged(detailed: boolean): void {
    const tab = this.tab.get();
    if (detailed && tab === 'lmc') {
      this.tab.set('payload');
    } else if (!detailed && tab === 'payload') {
      this.tab.set('lmc');
    }
    if (detailed) {
      this.prefillDetailed();
    }
  }

  /** PAX DISTRIBUTION STANDARD: the seated passengers spread over the cabin sections */
  private distributeStandard(): void {
    const s = this.state;
    if (!s.paxDistributionStandard.get()) {
      return;
    }
    const pax = s.pax.get();
    const distribution = standardPaxDistribution(pax !== null ? seatedPax(pax) : 0);
    distribution.forEach((sectionPax, i) => s.paxPerSection[i].set(pax !== null ? sectionPax : null));
  }

  /** The shortcuts of the buttons and tabs of each view: F10 is MORE on the loadsheet view, GENERATE on the edition */
  private registerKeyboardShortcuts(): void {
    const view = this.view;
    const notInView = (name: string) => this.tracked(view.map((v) => v !== name));
    const notInLoadsheet = notInView('loadsheet');
    const inLoadsheetWhen = (disabled: Subscribable<boolean>) =>
      this.tracked(MappedSubject.create(([other, off]) => other || off, notInLoadsheet, disabled));
    const firstTab = () => this.tab.set(this.state.isDetailed() ? 'payload' : 'lmc');
    this.props.uiService.registerPageShortcuts({
      ...this.aircraftStatusShortcuts(notInLoadsheet),
      F2: this.shortcut(firstTab, notInLoadsheet),
      'ALT+F2': this.shortcut(() => this.tab.set('fuel'), notInLoadsheet),
      'CTRL+F2': this.shortcut(() => this.tab.set('refuel'), notInLoadsheet),
      F6: this.shortcut(() => this.state.clearEntries(), notInLoadsheet),
      F8: this.shortcut(() => this.compute(), inLoadsheetWhen(this.computeDisabled)),
      F9: this.shortcut(() => this.view.set('edition'), inLoadsheetWhen(this.editDisabled)),
      F10: this.shortcut(
        () => (view.get() === 'edition' ? this.generate() : view.set('more')),
        this.tracked(
          MappedSubject.create(
            ([v, noResults]) => (v === 'loadsheet' ? noResults : v !== 'edition'),
            view,
            this.hideResults,
          ),
        ),
      ),
      F7: this.shortcut(() => this.exportReport(), notInView('display')),
    });
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.simTime,
      this.results,
      this.missingParameters,
      this.errorLines,
      this.hideResults,
      this.hideErrors,
      this.computeDisabled,
      this.editDisabled,
      this.detailed,
      this.reduced,
    );
    if (this.missingStsFields.length > 0) {
      return;
    }

    // Results of other entries than the computed ones are not shown (the computation is deleted)
    const deleteResults = () => this.state.computation.set(null);
    const s = this.state;
    const hasReport = this.tracked(s.report.map((lines) => lines !== null));
    this.props.uiService.registerPageFunctions({
      print: { run: () => this.print(), available: hasReport },
      store: this.storePageFunction('WBA', () => this.printout(), hasReport),
    });
    this.registerKeyboardShortcuts();
    const entries: Subscribable<unknown>[] = [
      s.entryMode,
      s.mtow,
      s.mlw,
      s.zfw,
      s.zfcg,
      s.fob,
      s.tripFuel,
      s.taxiFuel,
      s.density,
      s.lmcPax,
      s.lmcCargo,
      s.crew,
      s.pax,
      s.cargo,
      ...s.paxPerSection,
      ...s.cargoPerCompartment,
      s.refuelZfSource,
      s.refuelZfw,
      s.refuelZfcg,
      s.fuelMode,
      s.trimFuel,
      ...s.manualFuel,
    ];
    // The MORE panel of results kept in the session needs their fuel distribution
    this.updateFuelDistribution();
    this.subs.push(
      this.errorLines.sub((lines) => this.showErrorLines(this.errorListRef, lines), true),
      s.report.sub((lines) => this.showReport(lines), true),
      this.detailed.sub((detailed) => this.onEntryModeChanged(detailed)),
      s.fuelMode.sub((mode) => {
        this.onFuelModeChanged(mode);
        if (mode === FUEL_MODE_MANUAL) {
          this.allTanksShown.set(true);
        }
      }),
      s.pax.sub(() => this.distributeStandard()),
      s.paxDistributionStandard.sub(() => this.distributeStandard()),
      ...entries.map((entry) => entry.sub(deleteResults)),
      ...entries.map((entry) => entry.sub(() => this.updateFuelDistribution())),
      this.results.sub((results) => this.showMoreLines(results), true),
    );
  }

  /**
   * @param row a row of the DETAILED mode
   * @returns the row, hidden in REDUCED mode
   */
  private onlyDetailed(row: VNode): VNode {
    return <div class={{ hidden: this.reduced }}>{row}</div>;
  }

  /**
   * @param row a row of the REDUCED mode
   * @returns the row, hidden in DETAILED mode
   */
  private onlyReduced(row: VNode): VNode {
    return <div class={{ hidden: this.detailed }}>{row}</div>;
  }

  private renderConfiguration(): VNode {
    const s = this.state;
    return (
      <div class="oit-perf-panel">
        <div class="oit-perf-panel-title">CONFIGURATION &lt;F3&gt;</div>
        {this.row('CONFIG', null, this.list('config', ['Standard (STD)'], Subject.create(0)))}
        {this.row('ENTRY MODE', null, this.list('entryMode', LOADSHEET_ENTRY_MODES, s.entryMode))}
        {this.onlyDetailed(
          this.row(
            'CREW',
            null,
            this.list(
              'crew',
              CREW_OPTIONS.map((o) => o.label),
              s.crew,
            ),
          ),
        )}
        {this.onlyDetailed(this.row('CATERING', null, this.list('catering', CATERING_OPTIONS, Subject.create(0))))}
        {this.onlyDetailed(this.row('MISC', null, this.list('misc', MISC_OPTIONS, Subject.create(0))))}
        {this.onlyReduced(
          this.row('DOW', this.weightUnit, this.value(formatWeight(LOADSHEET_AIRCRAFT.dow, this.metric))),
        )}
        {this.onlyReduced(this.row('DOCG', '%', this.value(LOADSHEET_DOCG.toFixed(1))))}
        {this.row(
          'MTOW',
          this.weightUnit,
          this.numberBox(this.mtowFormat, s.mtow, 150, {
            yellow: s.mtowFromTakeoffPerf,
            onModified: (mtow) => {
              s.mtowFromTakeoffPerf.set(false);
              s.mtow.set(Math.min(mtow ?? A380_CERTIFIED_WEIGHTS.mtow, A380_CERTIFIED_WEIGHTS.mtow));
            },
          }),
        )}
        {this.row(
          'MLW',
          this.weightUnit,
          this.numberBox(this.mlwFormat, s.mlw, 150, {
            yellow: s.mlwFromLandingPerf,
            onModified: (mlw) => {
              s.mlwFromLandingPerf.set(false);
              s.mlw.set(Math.min(mlw ?? A380_CERTIFIED_WEIGHTS.mlw, A380_CERTIFIED_WEIGHTS.mlw));
            },
          }),
        )}
      </div>
    );
  }

  private renderLoading(): VNode {
    const s = this.state;
    const lmcText = this.resultText((r) =>
      r.lmcWeight !== 0 ? `LMC: ${r.lmcWeight > 0 ? '+' : '-'}${formatWeight(Math.abs(r.lmcWeight), this.metric)}` : '',
    );
    const underloadText = this.resultText(
      (r) =>
        `${r.underload >= 0 ? 'UNDERLOAD' : 'OVERLOAD'}(${this.weightUnit}): ${weightToDisplayUnit(Math.abs(r.underload), this.metric).toFixed(1)} LIMITED BY ${r.limitedBy}`,
    );
    const overload = this.tracked(this.results.map((r) => r !== null && r.underload < 0));
    const taxiShown = Subject.create<number | null>(null);
    const densityShown = Subject.create<number | null>(null);
    this.subs.push(
      s.taxiFuel.sub((taxi) => taxiShown.set(taxi ?? STANDARD_TAXI_FUEL), true),
      s.density.sub((density) => densityShown.set(density ?? LOADSHEET_AIRCRAFT.standardDensity), true),
    );
    return (
      <div class="oit-perf-panel">
        <div class="oit-perf-panel-title">LOADING &lt;F4&gt;</div>
        {this.onlyReduced(this.row('ZFW', this.weightUnit, this.numberBox(this.zfwFormat, s.zfw, 150)))}
        {this.onlyReduced(this.row('ZFCG', '%', this.numberBox(this.cgFormat, s.zfcg, 150)))}
        {this.onlyReduced(<div class="oit-perf-row">{this.value(lmcText)}</div>)}
        {this.onlyDetailed(
          this.row(
            'PAX',
            null,
            <InputField<PaxByType> dataEntryFormat={this.paxByTypeFormat} value={s.pax} {...this.boxProps(200, {})} />,
          ),
        )}
        {this.onlyDetailed(this.row('CARGO', this.cargoUnit, this.numberBox(this.reportCargoFormat, s.cargo, 200)))}
        {this.row('FOB', this.weightUnit, this.numberBox(this.fuelFormat, s.fob, 150))}
        {this.row('TRIP FUEL', this.weightUnit, this.numberBox(this.fuelFormat, s.tripFuel, 150))}
        {this.row(
          'TAXI FUEL',
          this.weightUnit,
          this.numberBox(this.fuelFormat, taxiShown, 150, { onModified: (taxi) => s.taxiFuel.set(taxi) }),
        )}
        {this.row(
          'DENSITY',
          'kg/l',
          this.numberBox(this.densityFormat, densityShown, 150, { onModified: (d) => s.density.set(d) }),
        )}
        <div class="oit-perf-row">
          <span class={{ 'oit-perf-value': true, red: overload }}>{underloadText}</span>
        </div>
      </div>
    );
  }

  private renderLmc(): VNode {
    const s = this.state;
    return (
      <div class={{ fc: true, hidden: this.tracked(this.tab.map((t) => t !== 'lmc')) }} style="padding: 8px;">
        {this.row('MODE', null, this.list('lmcMode', ['TOTAL'], Subject.create(0), 160))}
        {this.row('PAX', null, this.numberBox(this.paxFormat, s.lmcPax, 120))}
        {this.row('CARGO', this.cargoUnit, this.numberBox(this.cargoFormat, s.lmcCargo, 120))}
      </div>
    );
  }

  /**
   * PAYLOAD DISTR: the passengers of each cabin section (main deck, then upper deck) and the cargo of each compartment,
   * with what is left to distribute (red in excess), and the PAX DISTRIBUTION STANDARD / DETAILED buttons.
   * @returns the tab
   */
  private renderPayloadDistribution(): VNode {
    const s = this.state;
    const left = this.tracked(
      MappedSubject.create(
        () => undistributedPayload(s.detailedLoading()),
        s.pax,
        s.cargo,
        ...s.paxPerSection,
        ...s.cargoPerCompartment,
      ),
    );
    const cell = (label: string, field: VNode) => (
      <div class="oit-perf-distr-cell">
        <div class="oit-perf-distr-label">{label}</div>
        {field}
      </div>
    );
    const section = (i: number) =>
      cell(
        `${CABIN_SECTIONS[i].name.replace(/^(MAIN|UPPER) /, '')} (${CABIN_SECTIONS[i].seats})`,
        this.numberBox(this.sectionPaxFormat, s.paxPerSection[i], 100, { disabled: s.paxDistributionStandard }),
      );
    const total = (label: string, text: Subscribable<string>, red?: Subscribable<boolean>) =>
      cell(label, <span class={{ 'oit-perf-value': true, red: red ?? false }}>{text}</span>);
    const cargoText = (kg: number) => formatWholeWeight(kg, this.metric);
    const seated = this.tracked(s.pax.map((pax) => (pax !== null ? seatedPax(pax).toFixed(0) : '')));
    const cargoTotal = this.tracked(s.cargo.map((kg) => (kg !== null ? cargoText(kg) : '')));
    return (
      <div class={{ fc: true, hidden: this.tracked(this.tab.map((t) => t !== 'payload')) }} style="padding: 4px 8px;">
        <div class="oit-perf-distr-grid">
          <div class="oit-perf-distr-row-label">PAX MAIN</div>
          {section(0)}
          {section(1)}
          {section(2)}
          {section(3)}
          {total('TOTAL', seated)}
          <div class="oit-perf-distr-row-label">UPPER</div>
          {section(4)}
          {section(5)}
          {section(6)}
          <div />
          {total('Δ PAX', this.tracked(left.map((l) => l.pax.toFixed(0))), this.tracked(left.map((l) => l.pax < 0)))}
          <div class="oit-perf-distr-row-label">
            CARGO <span class="oit-perf-unit">{this.cargoUnit}</span>
          </div>
          {CARGO_COMPARTMENTS.map((compartment, i) =>
            cell(compartment.name, this.numberBox(this.reportCargoFormat, s.cargoPerCompartment[i], 100)),
          )}
          {total('TOTAL', cargoTotal)}
          {total(
            'Δ CARGO',
            this.tracked(left.map((l) => cargoText(l.cargo))),
            this.tracked(left.map((l) => l.cargo < -0.5)),
          )}
        </div>
        <div class="oit-perf-row">
          <span class="oit-perf-text">PAX DISTRIBUTION</span>
          <Button
            label="STANDARD"
            onClick={() => s.paxDistributionStandard.set(true)}
            selected={s.paxDistributionStandard}
          />
          <div style="width: 8px;" />
          <Button
            label="DETAILED"
            onClick={() => s.paxDistributionStandard.set(false)}
            selected={this.tracked(s.paxDistributionStandard.map((standard) => !standard))}
          />
        </div>
      </div>
    );
  }

  /**
   * REFUEL ZF DATA: the ZFW/ZFCG of the predicted fuel distribution in CG TARGETING mode: the FQMS default values,
   * a new set of data (the values the REFUEL application sent to the FQMS, in yellow), or the values of the loading.
   * @returns the tab
   */
  private renderRefuelZfData(): VNode {
    const s = this.state;
    const source = s.refuelZfSource;
    const newSetOnly = this.tracked(source.map((src) => src !== 'newSet'));
    const yellow = this.tracked(
      MappedSubject.create(([src, fromApp]) => src === 'newSet' && fromApp, source, s.refuelZfFromRefuelApplication),
    );
    const button = (label: string, value: RefuelZfSource) => (
      <Button
        label={label}
        onClick={() => source.set(value)}
        selected={this.tracked(source.map((src) => src === value))}
      />
    );
    const enter = (set: () => void) => {
      set();
      s.refuelZfFromRefuelApplication.set(false);
    };
    return (
      <div class={{ fc: true, hidden: this.tracked(this.tab.map((t) => t !== 'refuel')) }} style="padding: 8px;">
        <div class="oit-perf-row">
          {button('FQMS DEFAULT', 'fqmsDefault')}
          <div style="width: 10px;" />
          {button('NEW SET OF DATA', 'newSet')}
          <div style="width: 10px;" />
          {button('LOADSHEET', 'loadsheet')}
        </div>
        {this.row(
          'ZFW',
          this.weightUnit,
          this.numberBox(this.zfwFormat, this.refuelZfwShown, 150, {
            yellow,
            disabled: newSetOnly,
            onModified: (zfw) => enter(() => s.refuelZfw.set(zfw)),
          }),
        )}
        {this.row(
          'ZFCG',
          '%',
          this.numberBox(this.cgFormat, this.refuelZfcgShown, 150, {
            yellow,
            disabled: newSetOnly,
            onModified: (zfcg) => enter(() => s.refuelZfcg.set(zfcg)),
          }),
        )}
        <div class="oit-perf-row">
          <span class={{ 'oit-perf-text': true, hidden: this.tracked(yellow.map((y) => !y)) }}>
            ZFW/ZFCG SENT TO THE FQMS BY THE REFUEL APPLICATION
          </span>
        </div>
      </div>
    );
  }

  private renderFuelDistribution(): VNode {
    const s = this.state;
    const mode = s.fuelMode;
    const fobText = this.tracked(s.fob.map((fob) => formatWeight(fob, this.metric)));
    const tankText = (index: number) => this.tracked(this.distribution.map((d) => formatWeight(d[index], this.metric)));
    const tankFormat = this.weightFormat(MANUAL_TANK_MAX);
    const notMode = (wanted: number) => this.tracked(mode.map((m) => m !== wanted));
    const notTrimEntry = notMode(FUEL_MODE_TRIM_ADJUSTMENT);
    const notManual = notMode(FUEL_MODE_MANUAL);
    const distributionFob = this.tracked(this.distribution.map((d) => displayedTankTotal(d, this.metric).toFixed(1)));
    return (
      <div class={{ fc: true, hidden: this.tracked(this.tab.map((t) => t !== 'fuel')) }} style="padding: 8px;">
        <div class="oit-perf-row">
          <span class="oit-perf-text">FOB</span>
          {this.value(fobText)}
          <span class="oit-perf-unit">{this.weightUnit}</span>
          <span class="oit-perf-text" style="padding-left: 40px;">
            TRIM
          </span>
          <span class={{ hidden: this.tracked(notTrimEntry.map((hidden) => !hidden)) }}>
            {this.value(tankText(TRIM_TANK_INDEX))}
          </span>
          <span class={{ hidden: notTrimEntry }}>{this.numberBox(tankFormat, s.trimFuel, 150)}</span>
          <span class="oit-perf-unit">{this.weightUnit}</span>
        </div>
        <div class="oit-perf-row">
          {this.list('fuelMode', [...FUEL_MODE_LABELS], mode, 300)}
          <div style="width: 30px;" />
          <Button
            label={this.tracked(this.allTanksShown.map((all) => (all ? 'TRIM TK ONLY' : 'DISPLAY ALL TKS')))}
            onClick={() => this.allTanksShown.set(!this.allTanksShown.get())}
            disabled={this.tracked(mode.map((m) => m === FUEL_MODE_MANUAL))}
          />
        </div>
        <div
          class={{ 'oit-perf-grid': true, hidden: this.tracked(this.allTanksShown.map((all) => !all)) }}
          style="grid-template-columns: 1fr 1fr; grid-auto-rows: 30px;"
        >
          {LOADSHEET_FUEL_TANKS.map((tank, i) => (
            <div style="display: flex; align-items: center;">
              <span class="oit-perf-text" style="display: inline-block; width: 150px;">
                {tank.name}
              </span>
              <span class={{ hidden: this.tracked(notManual.map((hidden) => !hidden)) }}>
                {this.value(tankText(i))}
              </span>
              <span class={{ hidden: notManual }}>{this.numberBox(tankFormat, s.manualFuel[i], 130)}</span>
            </div>
          ))}
        </div>
        <div class={{ 'oit-perf-row': true, hidden: notManual }}>
          <span class="oit-perf-text">FOB (DISTR)</span>
          {this.value(distributionFob)}
          <span class="oit-perf-unit">{this.weightUnit}</span>
        </div>
      </div>
    );
  }

  /**
   * The weight and CG lines of the RESULTS and MORE panels.
   * @param widths the widths of the label, weight and CG columns
   * @returns the lines
   */
  private renderResultLines(widths: ResultLineWidths): VNode[] {
    // One unit element per line: an element rendered twice moves to its last place
    const unit = () => <span class="oit-perf-unit">{this.weightUnit}</span>;
    const line = (
      label: string,
      weight: (r: LoadsheetResults) => number,
      cg: ((r: LoadsheetResults) => number) | null,
      big: boolean,
      outOfLimits: ((r: LoadsheetResults) => boolean) | null = null,
    ) => {
      const red = this.tracked(this.results.map((r) => (r !== null && outOfLimits !== null ? outOfLimits(r) : false)));
      const valueClass = { 'oit-perf-value': true, big, red };
      return (
        <div class="oit-perf-row" style="min-height: 38px;">
          <span class={valueClass} style={`width: ${widths.label}px;`}>
            {label}
          </span>
          <span class={valueClass} style={`width: ${widths.weight}px; text-align: right;`}>
            {this.resultText((r) => formatWeight(weight(r), this.metric))}
          </span>
          {unit()}
          <span class={valueClass} style={`width: ${widths.cg}px; text-align: right;`}>
            {this.resultText((r) => (cg ? cg(r).toFixed(1) : ''))}
          </span>
          {cg !== null && <span class="oit-perf-unit">%</span>}
        </div>
      );
    };
    return [
      line(
        'DOW/CG',
        (r) => r.dow,
        (r) => r.docg,
        false,
      ),
      line('PAYLOAD', (r) => r.payload, null, false),
      line(
        'ZFW/CG',
        (r) => r.zfw,
        (r) => r.zfcg,
        true,
        (r) => r.zfwOutOfLimits,
      ),
      line('T.O FUEL', (r) => r.takeoffFuel, null, false),
      line(
        'TOW/CG',
        (r) => r.tow,
        (r) => r.towCg,
        true,
        (r) => r.towOutOfLimits,
      ),
      line('TRIP FUEL', (r) => r.tripFuel, null, false),
      line(
        'LW/CG',
        (r) => r.lw,
        (r) => r.lwCg,
        true,
        (r) => r.lwOutOfLimits,
      ),
    ];
  }

  /**
   * @returns the T.O THS FOR line under the result lines, as wide as the panel
   */
  private renderTakeoffThsLine(): VNode {
    return (
      <div class="oit-perf-row oit-perf-ths-row">
        {this.value(
          this.resultText((r) => takeoffThsText(r)),
          'big',
        )}
      </div>
    );
  }

  private renderLoadsheetView(): VNode {
    const tabActive = (tab: string) => this.tracked(this.tab.map((t) => t === tab));
    return (
      <div class={{ fc: true, f1: true, hidden: this.tracked(this.view.map((v) => v !== 'loadsheet')) }}>
        <div class="oit-perf-main">
          <div class="oit-perf-left">
            {this.renderConfiguration()}
            {this.renderLoading()}
            <div class="oit-perf-panel grow">{this.renderAircraftStatusReminder()}</div>
          </div>
          <div class="oit-perf-right">
            {this.renderTabs([
              {
                label: (
                  <span>
                    <span class={{ hidden: this.detailed }}>{'LMC &lt;F2&gt;'}</span>
                    <span class={{ hidden: this.reduced }}>{'PAYLOAD DISTR &lt;F2&gt;'}</span>
                  </span>
                ),
                active: this.tracked(
                  MappedSubject.create(
                    ([t, detailed]) => (detailed ? t === 'payload' : t === 'lmc'),
                    this.tab,
                    this.detailed,
                  ),
                ),
                onClick: () => this.tab.set(this.state.isDetailed() ? 'payload' : 'lmc'),
              },
              { label: 'FUEL DISTR <Alt F2>', active: tabActive('fuel'), onClick: () => this.tab.set('fuel') },
              { label: 'REFUEL ZF DATA <Ctrl F2>', active: tabActive('refuel'), onClick: () => this.tab.set('refuel') },
            ])}
            <div class="oit-perf-panel" style="height: 300px;">
              {this.renderLmc()}
              {this.renderPayloadDistribution()}
              {this.renderFuelDistribution()}
              {this.renderRefuelZfData()}
            </div>
            <div class="oit-perf-panel grow">
              <div class="oit-perf-panel-title">
                {this.tracked(
                  MappedSubject.create(
                    ([hidden, detailed]) => (hidden ? 'ERROR' : detailed ? 'RESULTS' : 'RESULTS including LMC'),
                    this.hideResults,
                    this.detailed,
                  ),
                )}
              </div>
              <div class={{ fc: true, hidden: this.hideResults }} style="padding: 6px 10px;">
                <div class="fr">
                  <div class="fc" style={`width: ${RESULTS_COLUMN_WIDTH}px;`}>
                    {this.renderResultLines(RESULTS_LINE_WIDTHS)}
                  </div>
                  <OitCgDiagram results={this.results} size={SMALL_CG_DIAGRAM_SIZE} />
                </div>
                {this.renderTakeoffThsLine()}
              </div>
              <div ref={this.errorListRef} class={{ hidden: this.hideErrors }} />
              <div style="flex: 1 1 auto;" />
              <div class={{ fr: true, jend: true }} style="padding: 6px;">
                <Button label="MORE <F10>" onClick={() => this.view.set('more')} disabled={this.hideResults} />
              </div>
            </div>
          </div>
        </div>
        <div class="oit-perf-bottom">
          {this.renderAircraftStatusButtons()}
          <div style="flex: 1 1 auto;" />
          <Button label="COMPUTE <F8>" onClick={() => this.compute()} disabled={this.computeDisabled} />
          <div style="width: 10px;" />
          <Button label="EDIT <F9>" onClick={() => this.view.set('edition')} disabled={this.editDisabled} />
          <div style="width: 10px;" />
          <Button label="CLEAR <F6>" onClick={() => this.state.clearEntries()} />
          <div style="width: 10px;" />
          <Button label="IMPORT <F7>" onClick={() => {}} disabled={Subject.create(true)} />
          <div style="flex: 1 1 auto;" />
        </div>
      </div>
    );
  }

  /**
   * MORE: the primary results, the TOCG warning and the automatic ground transfer to the limit and to the refuel
   * target.
   * @returns the view
   */
  private renderMoreView(): VNode {
    return (
      <div class={{ fc: true, f1: true, hidden: this.tracked(this.view.map((v) => v !== 'more')) }}>
        <div class="oit-perf-panel grow">
          <div class="oit-perf-panel-title">MORE RESULTS</div>
          <div class="fr">
            <div class="fc" style={`flex: 0 0 auto; width: ${MORE_RESULTS_COLUMN_WIDTH}px; padding: 6px 10px;`}>
              {this.renderResultLines(MORE_LINE_WIDTHS)}
              {this.renderTakeoffThsLine()}
            </div>
            <div ref={this.moreLinesRef} class="oit-perf-more-lines" style={`width: ${MORE_ADVICE_COLUMN_WIDTH}px;`} />
            <OitCgDiagram results={this.results} size={CG_DIAGRAM_SIZE} />
          </div>
        </div>
        <div class="oit-perf-bottom jend">
          <Button label="RETURN <Esc>" onClick={() => this.view.set('loadsheet')} />
        </div>
      </div>
    );
  }

  private renderEditionView(): VNode {
    const s = this.state;
    const flight = (airport: string | null) => <span class="oit-perf-value yellow">{airport ?? ''}</span>;
    const detailedLts = this.tracked(
      MappedSubject.create(([detailed, kind]) => detailed && kind === DETAILED_LTS, this.detailed, s.ltsKind),
    );
    const notDetailedLts = this.tracked(detailedLts.map((d) => !d));
    const radio = (label: string, kind: number) => (
      <div ref={this.clickRef(() => s.ltsKind.set(kind))} class="oit-perf-row" style="min-height: 36px;">
        <span class={{ 'oit-perf-radio': true, on: this.tracked(s.ltsKind.map((k) => k === kind)) }} />
        <span class="oit-perf-text">{label}</span>
      </div>
    );
    return (
      <div class={{ fc: true, f1: true, hidden: this.tracked(this.view.map((v) => v !== 'edition')) }}>
        <div class="oit-perf-panel grow">
          <div class="oit-perf-panel-title">LTS EDITION</div>
          <div class="fr">
            <div class="fc" style="width: 620px;">
              {this.row('CHECKED BY', null, this.stringBox(this.textFormat, s.checkedBy, 320))}
              {this.row('APPROVED BY', null, this.stringBox(this.textFormat, s.approvedBy, 320))}
              <div class="oit-perf-row">
                <div class="oit-perf-label">CAPT INFO NOTES</div>
              </div>
              {s.captInfoNotes.map((line) => (
                <div class="oit-perf-row" style="min-height: 38px; padding-left: 20px;">
                  {this.stringBox(this.notesFormat, line, 560)}
                </div>
              ))}
            </div>
            <div class="fc" style="flex: 1 1 auto;">
              <div class="oit-perf-row">
                <div class="oit-perf-label">FROM</div>
                {flight(this.sts.fromAirport.get())}
                <span class="oit-perf-text" style="padding-left: 30px;">
                  TO
                </span>
                {flight(this.sts.toAirport.get())}
              </div>
              <div class={{ hidden: detailedLts }}>
                {this.row('CREW', null, this.stringBox(this.textFormat, s.crewText, 300))}
                {this.row('PAX PER TYPE', null, this.stringBox(this.textFormat, s.paxPerType, 300))}
              </div>
              {this.row('PAX PER CLASS', null, this.stringBox(this.textFormat, s.paxPerClass, 300))}
              <div class={{ hidden: detailedLts }}>
                {this.row('CARGO', this.cargoUnit, this.numberBox(this.reportCargoFormat, s.reportCargo, 300))}
              </div>
            </div>
          </div>
          <div class="oit-perf-row" style="justify-content: center; padding-top: 20px;">
            <div class={{ fc: true, hidden: this.reduced }} style="width: 240px;">
              {radio('DETAILED LTS', DETAILED_LTS)}
              {radio('REDUCED LTS', REDUCED_LTS)}
            </div>
            <div class={{ fr: true, hidden: this.detailed }} style="align-items: center;">
              <span class="oit-perf-value">●</span>
              <span class="oit-perf-text">REDUCED LTS</span>
            </div>
            <div class="fc">
              <div class={{ 'oit-perf-row': true, hidden: this.reduced }}>
                <span class="oit-perf-text" style="width: 160px; text-align: right;">
                  EDITION NBR
                </span>
                {this.list('editionNumber', EDITION_NUMBERS, s.editionNumber, 110, notDetailedLts)}
              </div>
              <div class="oit-perf-row">
                <span class="oit-perf-text" style="width: 160px; text-align: right;">
                  STATUS
                </span>
                {this.list('status', ['Prelim', 'Final'], s.status, 140, detailedLts)}
              </div>
            </div>
            <div style="width: 60px;" />
            <Button label="GENERATE <F10>" onClick={() => this.generate()} />
          </div>
          <div class="oit-perf-panel-title" style="margin-top: 16px;">
            NO ERROR
          </div>
          <div style="flex: 1 1 auto;" />
        </div>
        <div class="oit-perf-bottom jend">
          <Button label="RETURN <Esc>" onClick={() => this.view.set('loadsheet')} />
        </div>
      </div>
    );
  }

  private renderDisplayView(): VNode {
    return (
      <div class={{ fc: true, f1: true, hidden: this.tracked(this.view.map((v) => v !== 'display')) }}>
        <div class="oit-perf-panel grow">
          <div class="oit-perf-panel-title">LTS DISPLAY</div>
          <div ref={this.reportRef} class="oit-perf-report" />
        </div>
        <div class="oit-perf-bottom jend">
          <Button label="EXPORT <F7>" onClick={() => this.exportReport()} />
          <div style="width: 10px;" />
          <Button label="PRINT <Ctrl P>" onClick={() => this.print()} />
          <div style="width: 10px;" />
          <Button label="RETURN <Esc>" onClick={() => this.view.set('edition')} />
        </div>
      </div>
    );
  }

  render(): VNode {
    if (this.missingStsFields.length > 0) {
      return this.renderNotStarted('LOADSHEET', this.missingStsFields);
    }
    return (
      <div class="oit-perf-page">
        {this.renderLoadsheetView()}
        {this.renderMoreView()}
        {this.renderEditionView()}
        {this.renderDisplayView()}
        {this.renderAircraftStatusPanel()}
        {this.renderStoredPopup()}
      </div>
    );
  }
}
