//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { LandingComputationType, LandingConf, NXUnits } from '@flybywiresim/fbw-sdk';
import { A380AocPrintEvents, AocPrintout } from '@shared/AocPrintout';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitPerfEntryFormat } from './OitPerfEntryFormat';
import { OitPerfPageBase, RunwayTableColumn } from './OitPerfPageBase';
import { OitPerfRunwaySelection } from './OitPerfRunwaySelection';
import { A380_LANDING_CALCULATOR } from '../../../System/Performance/A380PerformanceCalculators';
import { missingFltOpsStsFields } from '../../../System/Performance/FltOpsPerformanceSession';
import {
  formatLength,
  formatWeight,
  formatWindEntry,
  lengthUnitLabel,
  parseWeightEntry,
  runwayWind,
  weightUnitLabel,
} from '../../../System/Performance/PerformanceEntries';
import { PerformanceRunway } from '../../../System/Performance/PerformanceRunways';
import {
  LANDING_AIR_COND_OPTIONS,
  LANDING_ANTI_ICE_OPTIONS,
  LANDING_APPROACH_TYPE_OPTIONS,
  LANDING_BRAKING_OPTIONS,
  LANDING_COMPUTATION_OPTIONS,
  LANDING_CONF_OPTIONS,
  LANDING_GO_AROUND_CONF_LABELS,
  LANDING_GO_AROUND_CONF_OPTIONS,
  LANDING_RUNWAY_CONDITIONS,
  LANDING_TECHNIQUE_OPTIONS,
  LandingResults,
  computeLandingPerformance,
  landingGoAroundConfShown,
  missingLandingParameters,
  parseGoAroundGradientEntry,
} from '../../../System/Performance/LandingPerformance';
import { computeMultipleRunways, landingRunwayItems } from '../../../System/Performance/MultipleRunwayResults';
import { itemsNotInComputation, reminderLines } from '../../../System/Performance/AircraftStatus';
import { PrintoutEntry, landingPerfPrintout } from '../../../System/Performance/PerformancePrintouts';

interface OitFltOpsLandingPerfProps extends AbstractOitFltOpsPageProps {}

/**
 * LDG PERF: SINGLE RWY COMPUTATION and MULTIPLE RWY COMPUTATION of the landing performance, DISPATCH or IN-FLIGHT, the
 * AIRCRAFT STATUS and PRINT of the page.
 */
export class OitFltOpsLandingPerf extends OitPerfPageBase<OitFltOpsLandingPerfProps, LandingResults> {
  protected readonly pageId = 'ldgPerf';

  protected readonly application = 'LDG PERF';

  private readonly sts = this.props.container.laptopData;

  private readonly state = this.session.landing;

  private readonly calculator = A380_LANDING_CALCULATOR;

  private readonly metric = NXUnits.metricWeight;

  private readonly minGoAroundGradient = this.calculator.minGoAroundGradient ?? 0;

  private readonly missingStsFields = missingFltOpsStsFields(
    'LDG PERF',
    this.sts.fltNumber.get(),
    this.sts.fromAirport.get(),
    this.sts.toAirport.get(),
  );

  private readonly selection = new OitPerfRunwaySelection(this.props.bus, this.state);

  private readonly lwFormat = new OitPerfEntryFormat<number>(
    (text) => parseWeightEntry(text, this.metric, this.calculator.mlw),
    (kg) => formatWeight(kg, this.metric),
  );

  /** GA GRADIENT: an empty box (or MIN) is the regulatory minimum, shown as the standard */
  private readonly goAroundGradientFormat = new OitPerfEntryFormat<number>(
    (text) => {
      const gradient = parseGoAroundGradientEntry(text, this.minGoAroundGradient);
      return gradient === undefined ? null : gradient ?? this.minGoAroundGradient;
    },
    (gradient) => gradient.toFixed(1),
    4,
  );

  /** GA GRADIENT as shown: the entry, or the regulatory minimum (the standard) */
  private readonly goAroundGradientShown = Subject.create<number | null>(null);

  /** VLS+ as shown: the entry, or the wind increment with the A/THR (the default) */
  private readonly speedIncrementShown = Subject.create<number | null>(null);

  private readonly speedIncrementFormat = new OitPerfEntryFormat<number>(
    (text) => (/^\d{1,2}$/.test(text.trim()) ? parseInt(text.trim(), 10) : null),
    (kt) => kt.toFixed(0),
    2,
  );

  private readonly glideSlopeFormat = new OitPerfEntryFormat<number>(
    (text) => {
      const value = parseFloat(text);
      return /^\d(\.\d{1,2})?$/.test(text.trim()) && value >= 2.5 && value <= 4.5 ? value : null;
    },
    (deg) => deg.toFixed(1),
    4,
  );

  private readonly hideGoAroundConf = MappedSubject.create(
    () => !landingGoAroundConfShown(this.state.conditions(), this.calculator.mlw),
    this.state.computationType,
    this.state.lw,
  );

  private readonly hideGlideSlope = this.state.technique.map((t) => !LANDING_TECHNIQUE_OPTIONS[t].autoland);

  /** A DISPATCH computation always uses the manual braking */
  private readonly brakingDisabled = this.state.computationType.map(
    (t) => LANDING_COMPUTATION_OPTIONS[t].type === LandingComputationType.Dispatch,
  );

  protected readonly results = this.state.computation.map((c) => c?.results ?? null);

  private readonly multiple = this.state.computationMode.map((mode) => mode === 'multiple');

  private readonly missingParameters = MappedSubject.create(
    ([multiple, ticked]) => {
      const missing = missingLandingParameters(this.state.conditions(), null).filter((p) => p !== 'RWY');
      const runwayChosen = multiple ? ticked.length > 0 : this.selection.runway.get() !== null;
      return runwayChosen ? missing : [...missing, 'RWY'];
    },
    this.multiple,
    this.state.multipleRunways,
    this.state.wind,
    this.state.oat,
    this.state.qnh,
    this.state.runwayCondition,
    this.state.antiIce,
    this.state.lw,
    this.selection.runway,
  );

  private readonly errorLines = this.errorLinesOf(this.missingParameters, this.state.computation);

  private readonly hideResults = this.results.map((r) => r === null);

  private readonly hideErrors = this.errorLines.map((lines) => lines.length === 0);

  private readonly errorListRef = FSComponent.createRef<HTMLDivElement>();

  private readonly computeDisabled = this.missingParameters.map((m) => m.length > 0);

  private readonly moreShown = this.state.moreShown;

  /** The RWY list of the multiple results */
  private readonly runwayItems = this.state.multipleComputation.map((runs) =>
    runs !== null ? landingRunwayItems(runs, this.metric) : [],
  );

  private readonly shownRunway = this.state.computation.map(() => this.state.shownRunway());

  constructor(props: OitFltOpsLandingPerfProps) {
    super(props);
    if (this.missingStsFields.length === 0) {
      this.session.onLandingPerfShown(this.sts.toAirport.get());
      this.takeLogbookStatus();
    }
  }

  private compute(): void {
    const conditions = this.state.conditions();
    if (this.state.computationMode.get() === 'single') {
      const runway = this.selection.runway.get();
      if (runway !== null) {
        this.session.onLandingComputed(computeLandingPerformance(this.calculator, conditions, runway));
      }
      return;
    }
    const { shown, runs } = computeMultipleRunways(
      this.selection.airport.get()?.runways ?? [],
      this.state.multipleRunways.get(),
      conditions.wind,
      (runway) => computeLandingPerformance(this.calculator, conditions, runway),
      (computed) => landingRunwayItems(computed, this.metric),
    );
    this.session.onLandingComputed(shown, runs);
  }

  /** @returns the page as shown (the conditions, the aircraft status, the results of the runway shown) */
  private printout(): AocPrintout | null {
    const computation = this.state.computation.get();
    if (!computation || computation.results === null) {
      return null;
    }
    const s = this.state;
    const wind = s.wind.get();
    const runway = this.selection.airport.get()?.runways.find((r) => r.ident === computation.results!.runway);
    const conditions: PrintoutEntry[] = [
      ['COMPUTATION', LANDING_COMPUTATION_OPTIONS[s.computationType.get()].label],
      ['WIND', wind !== null ? formatWindEntry(wind, runwayWind(wind, runway?.magneticBearing ?? null)) : ''],
      ['OAT', `${s.oat.get() ?? ''} °C`],
      ['QNH', `${s.qnh.get() ?? ''} hPa`],
      ['RWY COND', LANDING_RUNWAY_CONDITIONS[s.runwayCondition.get() ?? 0].label],
      ['A-ICE', LANDING_ANTI_ICE_OPTIONS[s.antiIce.get() ?? 0].label],
      ['LDG CONF', LANDING_CONF_OPTIONS[s.conf.get()].label],
      ['AIR COND', LANDING_AIR_COND_OPTIONS[s.airCond.get()].label],
      ['APPR TYPE', LANDING_APPROACH_TYPE_OPTIONS[s.approachType.get()].label],
      ['LDG TECHNIQUE', LANDING_TECHNIQUE_OPTIONS[s.technique.get()].label],
      ['BRK MODE', LANDING_BRAKING_OPTIONS[s.braking.get()].label],
    ];
    const status = this.aircraftStatus.get();
    return landingPerfPrintout({
      flightNumber: this.sts.fltNumber.get() ?? '',
      airport: s.airport.get() ?? '',
      conditions,
      aircraftStatus: reminderLines(status, this.application).map((line) => line.text),
      notInComputation: itemsNotInComputation(status, this.application),
      results: computation.results,
      errors: computation.errors,
      runwayList: this.runwayItems.get().map((item) => item.label),
      metric: this.metric,
    });
  }

  /** PRINT: the page goes to the cockpit printer through the AOC printout route */
  private print(): void {
    const printout = this.printout();
    if (printout !== null) {
      this.props.bus.getPublisher<A380AocPrintEvents>().pub('aocPrintMessage', printout, true, false);
    }
  }

  private clear(): void {
    this.state.clearEntries();
    this.state.lw.set(this.calculator.mlw);
    this.moreShown.set(false);
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      ...this.selection.computedSubjects(),
      this.hideGoAroundConf,
      this.hideGlideSlope,
      this.brakingDisabled,
      this.results,
      this.missingParameters,
      this.errorLines,
      this.hideResults,
      this.hideErrors,
      this.computeDisabled,
      this.multiple,
      this.runwayItems,
      this.shownRunway,
    );
    if (this.missingStsFields.length > 0) {
      return;
    }

    const hasResults = this.tracked(this.results.map((r) => r !== null));
    this.props.uiService.registerPageFunctions({
      print: { run: () => this.print(), available: hasResults },
      store: this.storePageFunction('LDPA', () => this.printout(), hasResults),
    });
    this.props.uiService.registerPageShortcuts({
      ...this.runwayComputationShortcuts(this.state),
      ...this.aircraftStatusShortcuts(),
      F6: this.shortcut(() => this.clear()),
      F8: this.shortcut(() => this.compute(), this.computeDisabled),
      F10: this.shortcut(() => this.moreShown.set(!this.moreShown.get()), this.hideResults),
    });

    // Results of other entries than the computed ones are not shown (the computation is deleted)
    const deleteResults = () => this.state.deleteResults();
    const s = this.state;
    this.subs.push(
      ...this.selection.follow(),
      this.errorLines.sub((lines) => this.showErrorLines(this.errorListRef, lines), true),
      s.goAroundGradient.sub((g) => this.goAroundGradientShown.set(g ?? this.minGoAroundGradient), true),
      MappedSubject.create(
        ([entered, wind, runway]) => {
          const components = wind ? runwayWind(wind, runway?.magneticBearing ?? null) : null;
          this.speedIncrementShown.set(
            entered ?? (components ? this.calculator.windIncrement(components.headwind) : null),
          );
        },
        s.speedIncrement,
        s.wind,
        this.selection.runway,
      ),
      ...[
        s.computationType,
        s.wind,
        s.oat,
        s.qnh,
        s.runwayCondition,
        s.antiIce,
        s.lw,
        s.conf,
        s.goAroundConf,
        s.airCond,
        s.approachType,
        s.goAroundGradient,
        s.speedIncrement,
        s.technique,
        s.glideSlope,
        s.braking,
        s.runwayIdent,
        s.computationMode,
        s.multipleRunways,
      ].map((entry) => (entry as Subscribable<unknown>).sub(deleteResults)),
    );
  }

  private renderResults(): VNode {
    const weightUnit = weightUnitLabel(this.metric);
    const lengthUnit = lengthUnitLabel(this.metric);
    const label = (text: string) => <span class="oit-perf-text">{text}</span>;
    const unit = (text: string) => <span class="oit-perf-unit">{text}</span>;
    const flapsLine = (conf: LandingConf, confLabel: string, flapsLabelShown: boolean) => (
      <div>
        <span class="oit-perf-text" style={flapsLabelShown ? '' : 'visibility: hidden;'}>
          FLAPS
        </span>
        {this.value(this.resultText((r) => (r.flaps === conf ? '●' : '○')))}
        {label(confLabel)}
      </div>
    );
    const moreHidden = this.tracked(this.moreShown.map((m) => !m));
    // The distances and speeds line up on their colons below the LW, as on the laptop screen
    const distanceCells = (
      text: string,
      value: Subscribable<string>,
      valueUnit: string,
      hidden?: Subscribable<boolean>,
    ) => [
      <div class={{ 'oit-perf-ldg-label': true, hidden: hidden ?? false }}>{label(text)}</div>,
      <div class={{ hidden: hidden ?? false }}>
        {this.value(value)}
        {unit(valueUnit)}
      </div>,
    ];
    // Cells in reading order, spanned only: a hidden optional row (OVERWEIGHT LANDING, MORE) then leaves no empty line
    return (
      <div class={{ 'oit-perf-grid': true, 'oit-perf-ldg-results': true, hidden: this.hideResults }}>
        <div
          class={{ hidden: this.tracked(this.results.map((r) => !r?.overweight)) }}
          style="grid-column: span 4; text-align: center;"
        >
          {this.value('OVERWEIGHT LANDING', 'amber')}
        </div>
        {/* The RWY list above the results names the runway of a MULTIPLE RWY COMPUTATION */}
        <div class={{ invisible: this.multiple }}>
          {label('RWY')}
          {this.value(this.resultText((r) => r.runway))}
        </div>
        <div style="grid-column: span 2; text-align: center;">
          <span class="oit-perf-label big" style="width: auto;">
            LW
          </span>
          {this.value(
            this.resultText((r) => formatWeight(r.lw, this.metric)),
            'big',
          )}
          {unit(weightUnit)}
        </div>
        <div>
          {label('MLW(perf)')}
          {this.value(this.resultText((r) => formatWeight(r.mlwPerf, this.metric)))}
          {unit(weightUnit)}
        </div>
        <div style="grid-column: span 3; text-align: center;">
          {label('LIMITATION CODE')}
          {this.value(this.resultText((r) => r.limitation ?? ''))}
        </div>
        {flapsLine(LandingConf.Conf3, '3', true)}
        {distanceCells(
          'LDG DIST:',
          this.resultText((r) => formatLength(r.landingDistance, this.metric)),
          lengthUnit,
        )}
        {flapsLine(LandingConf.Full, 'FULL', false)}
        {distanceCells(
          'STOP MARGIN:',
          this.resultText((r) => formatLength(r.stopMargin, this.metric)),
          lengthUnit,
        )}
        <div>
          {label('VAPP:')}
          <span class="oit-perf-text">VLS+</span>
          {this.value(this.resultText((r) => r.speedIncrement.toFixed(0)))}
          {unit('kt')}
          {this.value(this.resultText((r) => `(${r.vapp.toFixed(0)})`))}
        </div>
        {distanceCells(
          'GA SPEED:',
          this.resultText((r) => r.goAroundSpeed?.toFixed(0) ?? ''),
          'kt',
        )}
        <div>
          <span class={{ hidden: this.tracked(this.results.map((r) => !r?.goAroundConf)) }}>
            {label('GA CONF')}
            {this.value(this.resultText((r) => (r.goAroundConf ? LANDING_GO_AROUND_CONF_LABELS[r.goAroundConf] : '')))}
          </span>
        </div>
        {distanceCells(
          'GA GRADIENT:',
          this.resultText((r) => r.goAroundGradient?.toFixed(3) ?? ''),
          '%',
        )}
        <div />
        {distanceCells(
          'ACTUAL LDG DIST:',
          this.resultText((r) => formatLength(r.actualLandingDistance, this.metric)),
          lengthUnit,
          moreHidden,
        )}
        <div class={{ hidden: moreHidden }}>
          {label('RWY LENGTH:')}
          {this.value(this.resultText((r) => formatLength(r.runwayLength, this.metric)))}
          {unit(lengthUnit)}
        </div>
        <div class={{ hidden: moreHidden }} style="grid-column: span 4; text-align: center;">
          {this.value(
            this.resultText((r) => (r.reverseThrustCredit ? 'REVERSE THRUST CREDIT' : 'NO REVERSE THRUST CREDIT')),
            'white',
          )}
        </div>
        <div style="grid-column: span 4;">{this.value(this.notInComputationText(), 'amber')}</div>
      </div>
    );
  }

  /**
   * The MULTIPLE RWY COMPUTATION panel: the LDA, slope and elevation of each runway.
   * @returns the panel
   */
  private renderMultipleRunwayTable(): VNode {
    const lengthUnit = lengthUnitLabel(this.metric);
    const columns: RunwayTableColumn[] = [
      { label: 'LDA ', unit: lengthUnit, width: 130, value: (rwy) => formatLength(rwy.landingLength, this.metric) },
      { label: 'SLOPE ', unit: '%', width: 110, value: (rwy) => rwy.slope.toFixed(1) },
      { label: 'ELEVN ', unit: 'ft', width: 130, value: (rwy) => rwy.elevation.toFixed(1) },
    ];
    return (
      <div class={{ hidden: this.tracked(this.multiple.map((m) => !m)) }}>
        {this.renderMultipleRunwayPanel(
          this.selection,
          this.state,
          this.state.airportFromSts,
          (icao) => this.session.onLandingAirportEntered(icao),
          columns,
        )}
      </div>
    );
  }

  private renderAirportPanel(): VNode {
    const lengthUnit = lengthUnitLabel(this.metric);
    const runwayText = (pick: (rwy: PerformanceRunway) => string) =>
      this.tracked(this.selection.runway.map((rwy) => (rwy ? pick(rwy) : '')));
    return (
      <div class={{ 'oit-perf-panel': true, hidden: this.multiple }}>
        {this.renderAirportRow(this.selection, this.state.airportFromSts, (icao) =>
          this.session.onLandingAirportEntered(icao),
        )}
        <div class="oit-perf-grid" style="grid-template-columns: repeat(3, 1fr); grid-auto-rows: 30px;">
          <div>
            <span class="oit-perf-text">ELEVN</span>
            <span class="oit-perf-value">{runwayText((rwy) => rwy.elevation.toFixed(0))}</span>
            <span class="oit-perf-unit">ft</span>
          </div>
          <div>
            <span class="oit-perf-text">SLOPE</span>
            <span class="oit-perf-value">{runwayText((rwy) => rwy.slope.toFixed(1))}</span>
            <span class="oit-perf-unit">%</span>
          </div>
          <div>
            <Button
              label="FUNCTIONS"
              onClick={() => {}}
              disabled={Subject.create(true)}
              buttonStyle="height: 28px; padding: 0px 10px;"
            />
          </div>
          <div>
            <span class="oit-perf-text">LENGTH</span>
            <span class="oit-perf-value">{runwayText((rwy) => formatLength(rwy.landingLength, this.metric))}</span>
            <span class="oit-perf-unit">{lengthUnit}</span>
          </div>
        </div>
        <div class="oit-perf-message-box" />
      </div>
    );
  }

  render(): VNode {
    if (this.missingStsFields.length > 0) {
      return this.renderNotStarted('LDG PERF', this.missingStsFields);
    }
    const s = this.state;
    return (
      <div class="oit-perf-page">
        <div class="oit-perf-main">
          <div class="oit-perf-left">
            <div class="oit-perf-panel">
              <div class="oit-perf-panel-title">CONDITIONS &lt;F3&gt;</div>
              {this.row(
                'COMPUTATION',
                null,
                this.list(
                  'computation',
                  LANDING_COMPUTATION_OPTIONS.map((o) => o.label),
                  s.computationType,
                ),
              )}
              {this.row(
                'WIND',
                '°/kt',
                this.windBox(this.selection.windFormat, s.wind, 180),
                <span class="oit-perf-text">{this.selection.crosswindText}</span>,
              )}
              {this.row(
                'OAT',
                '°C',
                this.numberBox(this.selection.oatFormat, s.oat, 90),
                <span class="oit-perf-text">ISA {this.selection.isaText}</span>,
              )}
              {this.row('QNH', 'hPa', this.numberBox(this.selection.qnhFormat, s.qnh, 180))}
              {this.row(
                'RWY COND',
                null,
                this.list(
                  'rwyCond',
                  LANDING_RUNWAY_CONDITIONS.map((c) => c.label),
                  s.runwayCondition,
                ),
              )}
              {this.row(
                'A-ICE',
                null,
                this.list(
                  'antiIce',
                  LANDING_ANTI_ICE_OPTIONS.map((o) => o.label),
                  s.antiIce,
                ),
              )}
              {this.row(
                'LW',
                weightUnitLabel(this.metric),
                this.numberBox(this.lwFormat, s.lw, 180, {
                  yellow: s.lwFromLoadsheet,
                  onModified: (lw) => {
                    s.lwFromLoadsheet.set(false);
                    s.lw.set(lw);
                  },
                }),
                undefined,
                'big',
              )}
              {this.row(
                'LDG CONF',
                null,
                this.list(
                  'conf',
                  LANDING_CONF_OPTIONS.map((o) => o.label),
                  s.conf,
                ),
              )}
              <div class={{ hidden: this.hideGoAroundConf }}>
                {this.row(
                  'GA CONF',
                  null,
                  this.list(
                    'gaConf',
                    LANDING_GO_AROUND_CONF_OPTIONS.map((o) => o.label),
                    s.goAroundConf,
                  ),
                )}
              </div>
              {this.row(
                'AIR COND',
                null,
                this.list(
                  'airCond',
                  LANDING_AIR_COND_OPTIONS.map((o) => o.label),
                  s.airCond,
                ),
              )}
              {this.row(
                'APPR TYPE',
                null,
                this.list(
                  'apprType',
                  LANDING_APPROACH_TYPE_OPTIONS.map((o) => o.label),
                  s.approachType,
                ),
              )}
              {this.row(
                'GA GRADIENT',
                '%',
                this.numberBox(this.goAroundGradientFormat, this.goAroundGradientShown, 120, {
                  onModified: (g) => s.goAroundGradient.set(g === null || g === this.minGoAroundGradient ? null : g),
                }),
              )}
              {this.row(
                'VLS +',
                'kt',
                this.numberBox(this.speedIncrementFormat, this.speedIncrementShown, 90, {
                  onModified: (kt) => s.speedIncrement.set(kt),
                }),
              )}
              {this.row(
                'LDG TECHNIQUE',
                null,
                this.list(
                  'technique',
                  LANDING_TECHNIQUE_OPTIONS.map((o) => o.label),
                  s.technique,
                ),
              )}
              <div class={{ hidden: this.hideGlideSlope }}>
                {this.row('G/S ANGLE', '°', this.numberBox(this.glideSlopeFormat, s.glideSlope, 90))}
              </div>
              {this.row(
                'BRK MODE',
                null,
                this.list(
                  'braking',
                  LANDING_BRAKING_OPTIONS.map((o) => o.label),
                  s.braking,
                  230,
                  this.brakingDisabled,
                ),
              )}
            </div>
            {/* The long CONDITIONS panel leaves room for four lines: the reminder area scrolls, as on the laptop */}
            <div class="oit-perf-panel grow" style="max-height: 118px;">
              {this.renderAircraftStatusReminder()}
            </div>
          </div>
          <div class="oit-perf-right">
            {this.renderRunwayComputationTabs(s)}
            {this.renderAirportPanel()}
            {this.renderMultipleRunwayTable()}
            <div class="oit-perf-panel grow">
              <div class="oit-perf-panel-title">
                {this.tracked(this.hideResults.map((hidden) => (hidden ? 'ERROR' : 'RESULTS')))}
              </div>
              <div
                class={{
                  'oit-perf-row': true,
                  hidden: this.tracked(
                    MappedSubject.create(([multiple, hidden]) => !multiple || hidden, this.multiple, this.hideResults),
                  ),
                }}
              >
                <span class="oit-perf-text">RWY</span>
                {this.renderRunwayResultList('rwyResults', this.runwayItems, this.shownRunway, (ident) =>
                  this.state.showRunwayResults(ident),
                )}
              </div>
              {this.renderResults()}
              <div ref={this.errorListRef} class={{ hidden: this.hideErrors }} />
              <div style="flex: 1 1 auto;" />
              <div class={{ fr: true, jend: true, hidden: this.hideResults }} style="padding: 6px;">
                <Button
                  label="MORE <F10>"
                  onClick={() => this.moreShown.set(!this.moreShown.get())}
                  selected={this.moreShown}
                />
              </div>
            </div>
          </div>
        </div>
        <div class="oit-perf-bottom">
          {this.renderAircraftStatusButtons()}
          <div style="flex: 1 1 auto;" />
          <Button label="COMPUTE <F8>" onClick={() => this.compute()} disabled={this.computeDisabled} />
          <div style="width: 10px;" />
          <Button label="CLEAR <F6>" onClick={() => this.clear()} />
          <div style="flex: 1 1 auto;" />
        </div>
        {this.renderAircraftStatusPanel()}
        {this.renderStoredPopup()}
      </div>
    );
  }
}
