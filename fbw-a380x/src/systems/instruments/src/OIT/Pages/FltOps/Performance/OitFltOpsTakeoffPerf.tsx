//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { Arinc429LocalVarConsumerSubject, NXUnits } from '@flybywiresim/fbw-sdk';
import { FqmsBusEvents } from '@shared/publishers/FqmsBusPublisher';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitPerfEntryFormat } from './OitPerfEntryFormat';
import { OitPerfPageBase } from './OitPerfPageBase';
import { OitPerfRunwaySelection } from './OitPerfRunwaySelection';
import { A380_TAKEOFF_CALCULATOR } from '../../../System/Performance/A380PerformanceCalculators';
import { missingFltOpsStsFields } from '../../../System/Performance/FltOpsPerformanceSession';
import {
  formatLength,
  formatWeight,
  lengthUnitLabel,
  parseWeightEntry,
  weightUnitLabel,
} from '../../../System/Performance/PerformanceEntries';
import { PerformanceRunway } from '../../../System/Performance/PerformanceRunways';
import {
  TAKEOFF_AIR_COND_OPTIONS,
  TAKEOFF_ANTI_ICE_OPTIONS,
  TAKEOFF_CONF_OPTIONS,
  TAKEOFF_ENTRY_ANGLE,
  TAKEOFF_RUNWAY_CONDITIONS,
  TakeoffResults,
  computeTakeoffPerformance,
  missingTakeoffParameters,
  takeoffFlapsLabel,
  takeoffThrustLabel,
  takeoffThrustOptions,
} from '../../../System/Performance/TakeoffPerformance';
import {
  CrosscheckItem,
  TakeoffCrosscheck,
  crosscheckTakeoff,
  fmsTakeoffEntries,
  takeoffCrosscheckAvailable,
} from '../../../System/Performance/TakeoffCrosscheck';
import { readFmsTakeoffSelections } from '../../../System/Performance/FmsTakeoffDataReader';

interface OitFltOpsTakeoffPerfProps extends AbstractOitFltOpsPageProps {}

const CROSSCHECK_ITEMS: CrosscheckItem[] = ['V1', 'VR', 'V2', 'FLAPS', 'TOW', 'THRUST', 'QNH'];

/** The EFIS control panel baro mode of QNH (0 STD, 1 QNH, 2 QFE) */
const BARO_MODE_QNH = 1;

/** T.O PERF: SINGLE RWY COMPUTATION of the takeoff performance, and XCHECK WITH AVNCS of the FMS T.O page */
export class OitFltOpsTakeoffPerf extends OitPerfPageBase<OitFltOpsTakeoffPerfProps, TakeoffResults> {
  protected readonly pageId = 'toPerf';

  private readonly sts = this.props.container.laptopData;

  private readonly state = this.sts.performance.takeoff;

  private readonly calculator = A380_TAKEOFF_CALCULATOR;

  private readonly metric = NXUnits.metricWeight;

  private readonly missingStsFields = missingFltOpsStsFields(
    'T.O PERF',
    this.sts.fltNumber.get(),
    this.sts.fromAirport.get(),
    this.sts.toAirport.get(),
  );

  private readonly thrustOptions = takeoffThrustOptions(this.calculator.derateLevels ?? []);

  private readonly selection = new OitPerfRunwaySelection(this.props.bus, this.state);

  private readonly towFormat = new OitPerfEntryFormat<number>(
    (text) => parseWeightEntry(text, this.metric, this.calculator.structuralMtow),
    (kg) => formatWeight(kg, this.metric),
  );

  protected readonly results = this.state.computation.map((c) => c?.results ?? null);

  private readonly missingParameters = MappedSubject.create(
    () => missingTakeoffParameters(this.currentConditions(), this.selection.runway.get()),
    this.state.wind,
    this.state.oat,
    this.state.qnh,
    this.state.runwayCondition,
    this.state.antiIce,
    this.state.tow,
    this.selection.runway,
  );

  private readonly errorLines = this.errorLinesOf(this.missingParameters, this.state.computation);

  private readonly hideResults = this.results.map((r) => r === null);

  private readonly hideErrors = this.errorLines.map((lines) => lines.length === 0);

  private readonly errorListRef = FSComponent.createRef<HTMLDivElement>();

  private readonly computeDisabled = this.missingParameters.map((m) => m.length > 0);

  private readonly crosscheckDisabled = this.results.map((r) => !takeoffCrosscheckAvailable(r));

  private readonly moreShown = this.state.moreShown;

  private readonly crosscheck = Subject.create<TakeoffCrosscheck | null>(null);

  private crosscheckRunning = false;

  private readonly grossWeight = Arinc429LocalVarConsumerSubject.create(
    this.props.bus.getSubscriber<FqmsBusEvents>().on('fqms_gross_weight'),
  );

  constructor(props: OitFltOpsTakeoffPerfProps) {
    super(props);
    if (this.missingStsFields.length === 0) {
      this.sts.performance.onTakeoffPerfShown(this.sts.fromAirport.get());
    }
  }

  private currentConditions() {
    return this.state.conditions(this.thrustOptions[this.state.thrust.get()].option);
  }

  private compute(): void {
    const runway = this.selection.runway.get();
    if (runway !== null) {
      this.sts.performance.onTakeoffComputed(
        computeTakeoffPerformance(this.calculator, this.currentConditions(), runway),
      );
    }
  }

  /** XCHECK WITH AVNCS: reads the FMS T.O page, the SD gross weight and the captain's EFIS QNH */
  private async runCrosscheck(): Promise<void> {
    const results = this.results.get();
    if (results === null || !takeoffCrosscheckAvailable(results) || this.crosscheckRunning) {
      return;
    }
    this.crosscheckRunning = true;
    const selections = await readFmsTakeoffSelections(this.props.bus);
    const fms = fmsTakeoffEntries(
      SimVar.GetSimVarValue('L:AIRLINER_V1_SPEED', 'knots'),
      SimVar.GetSimVarValue('L:AIRLINER_VR_SPEED', 'knots'),
      SimVar.GetSimVarValue('L:AIRLINER_V2_SPEED', 'knots'),
      SimVar.GetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'number'),
      selections?.flaps ?? null,
      selections?.thrust ?? null,
    );
    const gw = this.grossWeight.get();
    const baroStd = SimVar.GetSimVarValue('L:A32NX_FCU_EFIS_L_DISPLAY_BARO_IS_STD', 'bool') > 0;
    const baroMode = SimVar.GetSimVarValue('L:A32NX_FCU_EFIS_L_DISPLAY_BARO_MODE', 'number');
    this.crosscheck.set(
      crosscheckTakeoff(results, fms, {
        grossWeight: gw.isNormalOperation() ? gw.value : null,
        captainBaroIsQnh: !baroStd && baroMode === BARO_MODE_QNH,
        captainQnh: SimVar.GetSimVarValue('KOHLSMAN SETTING MB:1', 'millibars'),
      }),
    );
    this.crosscheckRunning = false;
  }

  private clear(): void {
    this.state.clearEntries();
    this.state.tow.set(this.calculator.structuralMtow);
    this.moreShown.set(false);
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      ...this.selection.computedSubjects(),
      this.results,
      this.missingParameters,
      this.errorLines,
      this.hideResults,
      this.hideErrors,
      this.computeDisabled,
      this.crosscheckDisabled,
      this.grossWeight,
    );
    if (this.missingStsFields.length > 0) {
      return;
    }

    // Results of other entries than the computed ones are not shown (the computation is deleted)
    const deleteResults = () => this.state.computation.set(null);
    this.subs.push(
      ...this.selection.follow(),
      this.errorLines.sub((lines) => this.showErrorLines(this.errorListRef, lines), true),
      this.state.wind.sub(deleteResults),
      this.state.oat.sub(deleteResults),
      this.state.qnh.sub(deleteResults),
      this.state.runwayCondition.sub(deleteResults),
      this.state.antiIce.sub(deleteResults),
      this.state.tow.sub(deleteResults),
      this.state.conf.sub(deleteResults),
      this.state.airCond.sub(deleteResults),
      this.state.thrust.sub(deleteResults),
      this.state.runwayIdent.sub(deleteResults),
      this.state.computation.sub(() => this.crosscheck.set(null)),
    );
  }

  private renderResults(): VNode {
    const weightUnit = weightUnitLabel(this.metric);
    const lengthUnit = lengthUnitLabel(this.metric);
    const speed = (pick: (r: TakeoffResults) => number | null) => this.resultText((r) => pick(r)?.toFixed(0) ?? '---');
    const label = (text: string) => <span class="oit-perf-text">{text}</span>;
    const unit = (text: string) => <span class="oit-perf-unit">{text}</span>;
    return (
      <div class={{ 'oit-perf-grid': true, hidden: this.hideResults }} style="grid-template-columns: 200px 250px 1fr;">
        <div>
          {label('RWY')}
          {this.value(this.resultText((r) => r.runway))}
        </div>
        <div>
          <span class="oit-perf-label big" style="width: auto;">
            TOW
          </span>
          {this.value(
            this.resultText((r) => formatWeight(r.tow, this.metric)),
            'big',
          )}
          {unit(weightUnit)}
        </div>
        <div>
          {label('MTOW(perf)')}
          {this.value(this.resultText((r) => formatWeight(r.mtowPerf, this.metric)))}
          {unit(weightUnit)}
        </div>
        <div>
          {label('V1')}
          {this.value(speed((r) => r.v1))}
          {unit('kt')}
        </div>
        <div>{this.value(this.resultText((r) => takeoffThrustLabel(r.thrust)))}</div>
        <div>
          {label('STOP MARGIN')}
          {this.value(this.resultText((r) => formatLength(r.stopMargin, this.metric) || '---'))}
          {unit(lengthUnit)}
        </div>
        <div>
          {label('VR')}
          {this.value(speed((r) => r.vr))}
          {unit('kt')}
        </div>
        <div />
        <div />
        <div>
          {label('V2')}
          {this.value(speed((r) => r.v2))}
          {unit('kt')}
        </div>
        <div />
        <div />
        <div>
          {label('FLAPS')}
          {this.value(this.resultText((r) => takeoffFlapsLabel(r.flaps)))}
        </div>
        <div>{label('THS')}</div>
        <div>
          {label('T.O SHIFT')}
          {this.value(this.resultText((r) => formatLength(r.takeoffShift, this.metric)))}
          {unit(lengthUnit)}
        </div>
        <div>{label('THR RED')}</div>
        <div />
        <div>
          {label('EO ACCEL')}
          {this.value(this.resultText((r) => r.engineOutAcceleration.toFixed(0)))}
          {unit('ft')}
        </div>
        <div>{label('ACCEL')}</div>
        <div class={{ hidden: this.tracked(this.moreShown.map((m) => !m)) }} style="grid-column: 2 / span 2;">
          {label('')}
          {this.value(
            this.resultText((r) => (r.reverseThrustCredit ? 'REVERSE THRUST CREDIT' : 'NO REVERSE THRUST CREDIT')),
            'white',
          )}
        </div>
      </div>
    );
  }

  private renderCrosscheckPopup(): VNode {
    return (
      <div class={{ 'oit-perf-popup': true, hidden: this.tracked(this.crosscheck.map((c) => c === null)) }}>
        <div class="oit-perf-popup-title">{this.tracked(this.crosscheck.map((c) => c?.title ?? ''))}</div>
        <div class="fr" style="justify-content: center;">
          {CROSSCHECK_ITEMS.map((item) => {
            const discrepancy = this.tracked(this.crosscheck.map((c) => c?.discrepancies.includes(item) ?? false));
            return (
              <span
                class={{ 'oit-perf-value': true, white: this.tracked(discrepancy.map((d) => !d)), amber: discrepancy }}
                style="padding: 0px 14px;"
              >
                {item}
              </span>
            );
          })}
        </div>
        <div class="oit-perf-text" style="text-align: center; padding: 14px; min-height: 30px;">
          {this.tracked(this.crosscheck.map((c) => c?.thrustMessage ?? ''))}
        </div>
        <Button
          label="CLOSE"
          onClick={() => this.crosscheck.set(null)}
          containerStyle="align-self: center; width: 160px;"
        />
      </div>
    );
  }

  private renderAirportPanel(): VNode {
    const lengthUnit = lengthUnitLabel(this.metric);
    const runwayText = (pick: (rwy: PerformanceRunway) => string) =>
      this.tracked(this.selection.runway.map((rwy) => (rwy ? pick(rwy) : '')));
    const item = (label: string, text: Subscribable<string> | null, unit: string) => (
      <div>
        <span class="oit-perf-text">{label}</span>
        {text !== null && <span class="oit-perf-value">{text}</span>}
        <span class="oit-perf-unit">{unit}</span>
      </div>
    );
    return (
      <div class="oit-perf-panel">
        {this.renderAirportRow(this.selection, this.state.airportFromSts, (icao) =>
          this.sts.performance.onTakeoffAirportEntered(icao),
        )}
        <div class="oit-perf-grid" style="grid-template-columns: 215px 165px 125px 1fr; grid-auto-rows: 30px;">
          {item(
            'ELEVN',
            runwayText((rwy) => rwy.elevation.toFixed(0)),
            'ft',
          )}
          {item(
            'SLOPE',
            runwayText((rwy) => rwy.slope.toFixed(1)),
            '%',
          )}
          <div />
          <div>
            <Button
              label="FUNCTIONS"
              onClick={() => {}}
              disabled={Subject.create(true)}
              buttonStyle="height: 28px; padding: 0px 10px;"
            />
          </div>
          {item(
            'LENGTH',
            runwayText((rwy) => formatLength(rwy.takeoffLength, this.metric)),
            lengthUnit,
          )}
          {item(
            'CWY',
            runwayText(() => '0'),
            lengthUnit,
          )}
          {item(
            'SWY',
            runwayText(() => '0'),
            lengthUnit,
          )}
          {item('OBST:', null, '')}
          {item(
            'ENTRY ANGLE',
            runwayText(() => TAKEOFF_ENTRY_ANGLE.toFixed(0)),
            '°',
          )}
          {item(
            'T.O SHIFT',
            runwayText(() => '0'),
            lengthUnit,
          )}
        </div>
        <div class="oit-perf-message-box" />
      </div>
    );
  }

  render(): VNode {
    if (this.missingStsFields.length > 0) {
      return this.renderNotStarted('T.O PERF', this.missingStsFields);
    }
    const s = this.state;
    return (
      <div class="oit-perf-page">
        <div class="oit-perf-main">
          <div class="oit-perf-left">
            <div class="oit-perf-panel">
              <div class="oit-perf-panel-title">CONDITIONS &lt;F3&gt;</div>
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
                  TAKEOFF_RUNWAY_CONDITIONS.map((c) => c.label),
                  s.runwayCondition,
                ),
              )}
              {this.row(
                'A-ICE',
                null,
                this.list(
                  'antiIce',
                  TAKEOFF_ANTI_ICE_OPTIONS.map((o) => o.label),
                  s.antiIce,
                ),
              )}
              <div style="height: 12px;" />
              {this.row(
                'TOW',
                weightUnitLabel(this.metric),
                this.numberBox(this.towFormat, s.tow, 180, {
                  yellow: s.towFromLoadsheet,
                  onModified: (tow) => {
                    s.towFromLoadsheet.set(false);
                    s.tow.set(tow);
                  },
                }),
                undefined,
                'big',
              )}
              <div style="height: 12px;" />
              {this.row(
                'CONF',
                null,
                this.list(
                  'conf',
                  TAKEOFF_CONF_OPTIONS.map((o) => o.label),
                  s.conf,
                ),
              )}
              {this.row(
                'AIR COND',
                null,
                this.list(
                  'airCond',
                  TAKEOFF_AIR_COND_OPTIONS.map((o) => o.label),
                  s.airCond,
                ),
              )}
              {this.row(
                'THRUST',
                null,
                this.list(
                  'thrust',
                  this.thrustOptions.map((o) => o.label),
                  s.thrust,
                ),
              )}
            </div>
            <div class="oit-perf-panel grow">
              <div class="oit-perf-status-box">NORMAL</div>
            </div>
          </div>
          <div class="oit-perf-right">
            <div class="oit-perf-tabs">
              <div class="oit-perf-tab active">SINGLE RWY COMPUTATION &lt;F2&gt;</div>
              <div class="oit-perf-tab">MULTIPLE RWY COMPUTATION &lt;Ctrl F2&gt;</div>
            </div>
            {this.renderAirportPanel()}
            <div class="oit-perf-panel grow">
              <div class="oit-perf-panel-title">
                {this.tracked(this.hideResults.map((hidden) => (hidden ? 'ERROR' : 'RESULTS')))}
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
          <Button label="ACFT STS <F5>" onClick={() => {}} disabled={Subject.create(true)} />
          <Button label="SYNCHRO LOGBOOK" onClick={() => {}} disabled={Subject.create(true)} />
          <div style="flex: 1 1 auto;" />
          <Button label="COMPUTE <F8>" onClick={() => this.compute()} disabled={this.computeDisabled} />
          <div style="width: 10px;" />
          <Button
            label="XCHECK WITH AVNCS <F7>"
            onClick={() => this.runCrosscheck()}
            disabled={this.crosscheckDisabled}
          />
          <div style="width: 10px;" />
          <Button label="CLEAR <F6>" onClick={() => this.clear()} />
          <div style="flex: 1 1 auto;" />
        </div>
        {this.renderCrosscheckPopup()}
      </div>
    );
  }
}
