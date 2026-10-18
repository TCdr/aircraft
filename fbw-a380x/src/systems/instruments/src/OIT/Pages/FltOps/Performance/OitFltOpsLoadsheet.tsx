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
import { NXUnits, getSimBriefOfp } from '@flybywiresim/fbw-sdk';
import { A380AocPrintEvents } from '@shared/AocPrintout';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitPerfEntryFormat, OitPerfTextFormat } from './OitPerfEntryFormat';
import { OitPerfPageBase } from './OitPerfPageBase';
import {
  A380_CERTIFIED_WEIGHTS,
  A380_TAKEOFF_CALCULATOR,
} from '../../../System/Performance/A380PerformanceCalculators';
import { missingFltOpsStsFields } from '../../../System/Performance/FltOpsPerformanceSession';
import {
  KG_PER_LB,
  formatWeight,
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
  computeLoadsheet,
  loadsheetPrintout,
  loadsheetReportLines,
  ltsEditionAllowed,
  missingLoadsheetParameters,
  predictedFuelDistribution,
  takeoffThsText,
} from '../../../System/Performance/Loadsheet';
import { applicationExportIdentifier } from '../../../System/OisExportBox';

interface OitFltOpsLoadsheetProps extends AbstractOitFltOpsPageProps {}

/** Design choice: the standard taxi fuel when the crew enters none, the FBW A380X FMS taxi fuel default */
const STANDARD_TAXI_FUEL = 1_500;

/** The passenger weight of the LMC when the aircraft has none set, kg */
const DEFAULT_PER_PAX_WEIGHT = 84;

/**
 * LOADSHEET in REDUCED mode: the ZFW/CG and the fuel give the TOW/CG and LW/CG; LTS EDITION writes the loadsheet,
 * which can be printed (also with PRINT of the FUNCTIONS list) or exported: EXPORT puts it in the EXPORT BOX, from
 * where the crew sends it to the ground.
 */
export class OitFltOpsLoadsheet extends OitPerfPageBase<OitFltOpsLoadsheetProps, LoadsheetResults> {
  protected readonly pageId = 'loadsheet';

  private readonly sts = this.props.container.laptopData;

  private readonly session = this.sts.performance;

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

  /** The fuel in each tank, kg, read when the page opens and at each computation */
  private readonly tankFuel = Subject.create<number[]>(this.readTankFuel());

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
      (kg) => Math.round(this.metric ? kg : kg / KG_PER_LB).toFixed(0),
      maxDigits,
    );
  }

  /** The LMC cargo: a change, which may be negative */
  private readonly cargoFormat = this.cargoWeightFormat(/^[+-]?\d{1,5}$/, 6);

  private readonly reportCargoFormat = this.cargoWeightFormat(/^\d{1,6}$/, 7);

  private readonly textFormat = new OitPerfTextFormat(24);

  private readonly notesFormat = new OitPerfTextFormat(40);

  protected readonly results = this.state.computation.map((c) => c?.results ?? null);

  private readonly missingParameters = MappedSubject.create(
    () => missingLoadsheetParameters(this.state.loading(STANDARD_TAXI_FUEL)),
    this.state.zfw,
    this.state.zfcg,
    this.state.fob,
    this.state.tripFuel,
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

  constructor(props: OitFltOpsLoadsheetProps) {
    super(props);
    if (this.missingStsFields.length === 0) {
      this.session.onLoadsheetShown();
      this.state.restoreView();
      this.prefillLoading();
    }
  }

  private readTankFuel(): number[] {
    const kgPerGallon = SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', 'kilograms');
    return LOADSHEET_FUEL_TANKS.map(
      (_, i) => SimVar.GetSimVarValue(`FUELSYSTEM TANK QUANTITY:${i + 1}`, 'gallons') * kgPerGallon,
    );
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

  /** @returns the CONFIGURATION panel */
  private configuration(): LoadsheetConfiguration {
    return {
      mtow: this.state.mtow.get() ?? A380_CERTIFIED_WEIGHTS.mtow,
      mtowFromTakeoffPerf: this.state.mtowFromTakeoffPerf.get(),
      mlw: this.state.mlw.get() ?? A380_CERTIFIED_WEIGHTS.mlw,
      mlwFromLandingPerf: this.state.mlwFromLandingPerf.get(),
    };
  }

  private compute(): void {
    this.tankFuel.set(this.readTankFuel());
    const loading = this.state.loading(STANDARD_TAXI_FUEL);
    const perPaxWeight = SimVar.GetSimVarValue('L:A32NX_WB_PER_PAX_WEIGHT', 'kilograms') || DEFAULT_PER_PAX_WEIGHT;
    this.session.onLoadsheetComputed(
      computeLoadsheet(
        this.configuration(),
        loading,
        predictedFuelDistribution(loading.fob ?? 0, this.tankFuel.get()),
        perPaxWeight,
        (cg, weight) => A380_TAKEOFF_CALCULATOR.isCgWithinLimits(cg, weight),
      ),
    );
  }

  private generate(): void {
    const results = this.results.get();
    if (!ltsEditionAllowed(results)) {
      return;
    }
    const lines = loadsheetReportLines(
      this.state.edition(),
      {
        flightNumber: this.sts.fltNumber.get() ?? '',
        registration: 'F-FBWA',
        from: this.sts.fromAirport.get() ?? '',
        to: this.sts.toAirport.get() ?? '',
      },
      this.configuration(),
      results!,
      new Date(this.simTime.get()),
      this.metric,
    );
    this.state.report.set(lines);
    this.view.set('display');
  }

  /** PRINT: the loadsheet goes to the cockpit printer through the AOC printout route */
  private print(): void {
    const report = this.state.report.get();
    if (report !== null) {
      this.props.bus.getPublisher<A380AocPrintEvents>().pub('aocPrintMessage', loadsheetPrintout(report), true, false);
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
    );
    if (this.missingStsFields.length > 0) {
      return;
    }

    // Results of other entries than the computed ones are not shown (the computation is deleted)
    const deleteResults = () => this.state.computation.set(null);
    const s = this.state;
    this.props.uiService.registerPageFunctions({
      print: { run: () => this.print(), available: this.tracked(s.report.map((lines) => lines !== null)) },
    });
    this.subs.push(
      this.errorLines.sub((lines) => this.showErrorLines(this.errorListRef, lines), true),
      s.report.sub((lines) => this.showReport(lines), true),
      ...[s.mtow, s.mlw, s.zfw, s.zfcg, s.fob, s.tripFuel, s.taxiFuel, s.density, s.lmcPax, s.lmcCargo].map((entry) =>
        (entry as Subscribable<unknown>).sub(deleteResults),
      ),
    );
  }

  private renderConfiguration(): VNode {
    const s = this.state;
    return (
      <div class="oit-perf-panel">
        <div class="oit-perf-panel-title">CONFIGURATION &lt;F3&gt;</div>
        {this.row('CONFIG', null, this.list('config', ['Standard (STD)'], Subject.create(0)))}
        {this.row('ENTRY MODE', null, this.list('entryMode', ['REDUCED'], Subject.create(0)))}
        {this.row('DOW', this.weightUnit, this.value(formatWeight(LOADSHEET_AIRCRAFT.dow, this.metric)))}
        {this.row('DOCG', '%', this.value(LOADSHEET_DOCG.toFixed(1)))}
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
        {this.row('ZFW', this.weightUnit, this.numberBox(this.zfwFormat, s.zfw, 150))}
        {this.row('ZFCG', '%', this.numberBox(this.cgFormat, s.zfcg, 150))}
        <div class="oit-perf-row">{this.value(lmcText)}</div>
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
        {this.row('CARGO', this.metric ? 'kg' : 'lbs', this.numberBox(this.cargoFormat, s.lmcCargo, 120))}
      </div>
    );
  }

  private renderFuelDistribution(): VNode {
    const distribution = this.tracked(
      MappedSubject.create(([fob, tanks]) => predictedFuelDistribution(fob ?? 0, tanks), this.state.fob, this.tankFuel),
    );
    const fobText = this.tracked(this.state.fob.map((fob) => formatWeight(fob, this.metric)));
    const tankText = (index: number) => this.tracked(distribution.map((d) => formatWeight(d[index], this.metric)));
    return (
      <div class={{ fc: true, hidden: this.tracked(this.tab.map((t) => t !== 'fuel')) }} style="padding: 8px;">
        <div class="oit-perf-row">
          <span class="oit-perf-text">FOB</span>
          {this.value(fobText)}
          <span class="oit-perf-unit">{this.weightUnit}</span>
          <span class="oit-perf-text" style="padding-left: 40px;">
            TRIM
          </span>
          {this.value(tankText(TRIM_TANK_INDEX))}
          <span class="oit-perf-unit">{this.weightUnit}</span>
        </div>
        <div class="oit-perf-row">
          {this.list('fuelMode', ['CG TARGETING'], Subject.create(0), 240)}
          <div style="width: 30px;" />
          <Button
            label={this.tracked(this.allTanksShown.map((all) => (all ? 'TRIM TK ONLY' : 'DISPLAY ALL TKS')))}
            onClick={() => this.allTanksShown.set(!this.allTanksShown.get())}
          />
        </div>
        <div
          class={{ 'oit-perf-grid': true, hidden: this.tracked(this.allTanksShown.map((all) => !all)) }}
          style="grid-template-columns: 1fr 1fr; grid-auto-rows: 30px;"
        >
          {LOADSHEET_FUEL_TANKS.map((tank, i) => (
            <div>
              <span class="oit-perf-text" style="display: inline-block; width: 150px;">
                {tank.name}
              </span>
              {this.value(tankText(i))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  private renderResults(): VNode {
    const unit = <span class="oit-perf-unit">{this.weightUnit}</span>;
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
          <span class={valueClass} style="width: 200px;">
            {label}
          </span>
          <span class={valueClass} style="width: 160px; text-align: right;">
            {this.resultText((r) => formatWeight(weight(r), this.metric))}
          </span>
          {unit}
          <span class={valueClass} style="width: 140px; text-align: right;">
            {this.resultText((r) => (cg ? cg(r).toFixed(1) : ''))}
          </span>
          {cg !== null && <span class="oit-perf-unit">%</span>}
        </div>
      );
    };
    return (
      <div class={{ fc: true, hidden: this.hideResults }} style="padding: 6px 10px;">
        {line(
          'DOW/CG',
          (r) => r.dow,
          (r) => r.docg,
          false,
        )}
        {line('PAYLOAD', (r) => r.payload, null, false)}
        {line(
          'ZFW/CG',
          (r) => r.zfw,
          (r) => r.zfcg,
          true,
          (r) => r.zfwOutOfLimits,
        )}
        {line('T.O FUEL', (r) => r.takeoffFuel, null, false)}
        {line(
          'TOW/CG',
          (r) => r.tow,
          (r) => r.towCg,
          true,
          (r) => r.towOutOfLimits,
        )}
        {line('TRIP FUEL', (r) => r.tripFuel, null, false)}
        {line(
          'LW/CG',
          (r) => r.lw,
          (r) => r.lwCg,
          true,
          (r) => r.lwOutOfLimits,
        )}
        <div class="oit-perf-row">
          {this.value(
            this.resultText((r) => takeoffThsText(r)),
            'big',
          )}
        </div>
      </div>
    );
  }

  private renderLoadsheetView(): VNode {
    return (
      <div class={{ fc: true, f1: true, hidden: this.tracked(this.view.map((v) => v !== 'loadsheet')) }}>
        <div class="oit-perf-main">
          <div class="oit-perf-left">
            {this.renderConfiguration()}
            {this.renderLoading()}
            <div class="oit-perf-panel grow">
              <div class="oit-perf-status-box">NORMAL</div>
            </div>
          </div>
          <div class="oit-perf-right">
            <div class="oit-perf-tabs">
              <div
                class={{ 'oit-perf-tab': true, active: this.tracked(this.tab.map((t) => t === 'lmc')) }}
                onClick={() => this.tab.set('lmc')}
              >
                LMC &lt;F2&gt;
              </div>
              <div
                class={{ 'oit-perf-tab': true, active: this.tracked(this.tab.map((t) => t === 'fuel')) }}
                onClick={() => this.tab.set('fuel')}
              >
                FUEL DISTR &lt;Alt F2&gt;
              </div>
              <div class="oit-perf-tab">REFUEL ZF DATA &lt;Ctrl F2&gt;</div>
            </div>
            <div class="oit-perf-panel" style="height: 300px;">
              {this.renderLmc()}
              {this.renderFuelDistribution()}
            </div>
            <div class="oit-perf-panel grow">
              <div class="oit-perf-panel-title">
                {this.tracked(this.hideResults.map((hidden) => (hidden ? 'ERROR' : 'RESULTS including LMC')))}
              </div>
              {this.renderResults()}
              <div ref={this.errorListRef} class={{ hidden: this.hideErrors }} />
              <div style="flex: 1 1 auto;" />
              <div class={{ fr: true, jend: true }} style="padding: 6px;">
                <Button label="MORE <F10>" onClick={() => {}} disabled={Subject.create(true)} />
              </div>
            </div>
          </div>
        </div>
        <div class="oit-perf-bottom">
          <Button label="ACFT STS <F5>" onClick={() => {}} disabled={Subject.create(true)} />
          <Button label="SYNCHRO LOGBOOK" onClick={() => {}} disabled={Subject.create(true)} />
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

  private renderEditionView(): VNode {
    const s = this.state;
    const flight = (airport: string | null) => <span class="oit-perf-value yellow">{airport ?? ''}</span>;
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
              {this.row('CREW', null, this.stringBox(this.textFormat, s.crew, 300))}
              {this.row('PAX PER TYPE', null, this.stringBox(this.textFormat, s.paxPerType, 300))}
              {this.row('PAX PER CLASS', null, this.stringBox(this.textFormat, s.paxPerClass, 300))}
              {this.row('CARGO', this.metric ? 'kg' : 'lbs', this.numberBox(this.reportCargoFormat, s.cargo, 300))}
            </div>
          </div>
          <div class="oit-perf-row" style="justify-content: center; padding-top: 20px;">
            <span class="oit-perf-value">●</span>
            <span class="oit-perf-text">REDUCED LTS</span>
            <span class="oit-perf-text" style="padding-left: 60px;">
              STATUS
            </span>
            {this.list('status', ['Prelim', 'Final'], s.status, 140)}
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
        {this.renderEditionView()}
        {this.renderDisplayView()}
      </div>
    );
  }
}
