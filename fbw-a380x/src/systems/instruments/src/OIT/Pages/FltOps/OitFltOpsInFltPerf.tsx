//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { NXUnits } from '@flybywiresim/fbw-sdk';
import { AbstractOitFltOpsPageProps } from '../../OIT';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { A380FmsError } from '../../../MFD/shared/A380FmsError';
import {
  ATMO_MAX_GROSS_WEIGHT_KG,
  ATMO_MIN_GROSS_WEIGHT_KG,
  AtmoComputation,
  AtmoIsaInformation,
  AtmoLimits,
  AtmoSpeedResults,
  AtmoWind,
  atmoIsaDeviation,
  atmoSat,
  computeAtmoLowAltitudeCorrection,
  computeAtmoSpeedConversions,
  computeAtmoTrueAltitude,
  formatAtmoTrueAltitude,
  isDirectionSpeedWind,
} from '../../System/InFltPerfAtmo';
import {
  AtmoAltitudeFormat,
  AtmoNumberFormat,
  AtmoWindFormat,
  atmoEntryErrorText,
} from '../../System/InFltPerfAtmoFormats';
import { AtmoResultsView, NO_ATMO_RESULTS } from '../../System/InFltPerfAtmoSession';

import './OitFltOpsInFltPerf.scss';

interface OitFltOpsInFltPerfProps extends AbstractOitFltOpsPageProps {}

/** The six modules of IN-FLT PERF. Only ATMO is described for the crew: the others stay unavailable. */
const IN_FLT_PERF_MODULES = ['CLB', 'CRZ', 'DES', 'HLD', 'PLAN', 'ATMO'];

const COMPUTATION_TYPES = ['SPEED', 'ALT (STD)'];
const SPEED_TYPES = ['MACH', 'IAS', 'ECON', 'LRC'];
const ALT_TYPES = ['TRUE ALT (STD)', 'LO ALT TEMP CORR'];

type AtmoMode = 'SPEED' | 'TRUE ALT' | 'LO ALT';

/**
 * IN-FLT PERF with its ATMO module: speed conversions, true altitude for high altitude use and low altitude
 * temperature corrections, computed with COMPUTE from the CONDITIONS and SPECIFIC DATA entries.
 */
export class OitFltOpsInFltPerf extends DisplayComponent<OitFltOpsInFltPerfProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  /** The entries and results stay in the laptop session while the page is drawn again at each return to it */
  private readonly session = this.props.container.laptopData.inFltPerf;

  private readonly computationType = this.session.computationType;
  private readonly speedType = this.session.speedType;
  private readonly altType = this.session.altType;

  private readonly mode = MappedSubject.create(
    ([computation, altType]): AtmoMode => (computation !== 1 ? 'SPEED' : altType === 1 ? 'LO ALT' : 'TRUE ALT'),
    this.computationType,
    this.altType,
  );

  private readonly wind = this.session.wind;
  private readonly course = this.session.course;
  private readonly windReformat = Subject.create(false);
  private readonly temperature = this.session.temperature;
  private readonly isaDeviationField = Subject.create<number | null>(null);
  private readonly satField = Subject.create<number | null>(null);
  private readonly grossWeight = this.session.grossWeight;
  private readonly mach = this.session.mach;
  private readonly ias = this.session.ias;
  private readonly indicatedAltitude = this.session.indicatedAltitude;
  private readonly airportElevation = this.session.airportElevation;
  private readonly heightAal = this.session.heightAal;
  private readonly airportTemperature = this.session.airportTemperature;

  private readonly results = this.session.results;

  private readonly entryError = Subject.create<string | null>(null);

  private readonly weightUnit = NXUnits.userWeightUnit() === 'KG' ? 'T' : 'klbs';

  private readonly grossWeightFormat = new AtmoNumberFormat(
    Math.floor(NXUnits.kgToUser(ATMO_MIN_GROSS_WEIGHT_KG) / 100) / 10,
    Math.ceil(NXUnits.kgToUser(ATMO_MAX_GROSS_WEIGHT_KG) / 100) / 10,
    1,
    6,
  );

  private hiddenUnless(visible: (mode: AtmoMode) => boolean): Subscribable<boolean> {
    const hidden = this.mode.map((mode) => !visible(mode));
    this.subs.push(hidden);
    return hidden;
  }

  private resultText(format: (view: AtmoResultsView) => string | null): Subscribable<string> {
    const text = this.results.map((view) => format(view) ?? '');
    this.subs.push(text);
    return text;
  }

  private speedResult(format: (results: AtmoSpeedResults) => string): Subscribable<string> {
    return this.resultText((view) => (view.kind === 'speed' ? format(view.results) : null));
  }

  private isaResult(format: (results: AtmoIsaInformation) => string): Subscribable<string> {
    return this.resultText((view) => (view.kind === 'speed' || view.kind === 'true alt' ? format(view.results) : null));
  }

  private readonly errorHandler = (error: A380FmsError) => this.entryError.set(atmoEntryErrorText(error));

  private onSpeedTypeModified(index: number | null): void {
    if (index === 2 || index === 3) {
      // ECON and LRC speeds come from the aircraft performance data, which the sim does not have
      this.entryError.set(`${SPEED_TYPES[index]} speed not available`);
      return;
    }
    this.speedType.set(index);
  }

  private showComputation<T>(computation: AtmoComputation<T>, view: (results: T) => AtmoResultsView): void {
    this.results.set(
      computation.results !== null ? view(computation.results) : { kind: 'errors', lines: computation.errors },
    );
  }

  private compute(): void {
    this.entryError.set(null);
    const mode = this.mode.get();
    const altitude = this.indicatedAltitude.get();
    const isaDeviation = atmoIsaDeviation(this.temperature.get(), altitude);
    if (mode === 'SPEED') {
      const speedType = this.speedType.get() === 1 ? 'IAS' : 'MACH';
      this.showComputation(
        computeAtmoSpeedConversions({
          wind: this.wind.get(),
          courseDeg: this.course.get(),
          isaDeviationC: isaDeviation,
          speedType,
          speed: speedType === 'MACH' ? this.mach.get() : this.ias.get(),
          indicatedAltitudeFt: altitude,
          airportElevationFt: this.airportElevation.get(),
        }),
        (results) => ({ kind: 'speed', results }),
      );
    } else if (mode === 'TRUE ALT') {
      this.showComputation(computeAtmoTrueAltitude(isaDeviation, altitude, this.airportElevation.get()), (results) => ({
        kind: 'true alt',
        results,
      }));
    } else {
      this.showComputation(
        computeAtmoLowAltitudeCorrection(
          this.heightAal.get(),
          this.airportElevation.get(),
          this.airportTemperature.get(),
        ),
        (results) => ({ kind: 'lo alt', results }),
      );
    }
  }

  private clear(): void {
    this.session.clearEntries();
    this.entryError.set(null);
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.uiService.registerPageShortcuts({
      F6: { run: () => this.clear() },
      F8: { run: () => this.compute() },
    });
    this.subs.push(
      this.mode,
      // The TEMP fields show the entry and its conversion at the indicated altitude
      MappedSubject.create(
        ([temperature, altitude]) => {
          const isaDeviation = atmoIsaDeviation(temperature, altitude);
          const sat = atmoSat(temperature, altitude);
          this.isaDeviationField.set(isaDeviation === null ? null : Math.round(isaDeviation));
          this.satField.set(sat === null ? null : Math.round(sat));
        },
        this.temperature,
        this.indicatedAltitude,
      ),
      this.course.sub(() => this.windReformat.notify()),
    );

    // Design choice: results always match the entries on display, so any change of entry clears them until the next
    // COMPUTE.
    for (const entry of [
      this.computationType,
      this.speedType,
      this.altType,
      this.wind,
      this.course,
      this.temperature,
      this.mach,
      this.ias,
      this.indicatedAltitude,
      this.airportElevation,
      this.heightAal,
      this.airportTemperature,
    ] as Subscribable<unknown>[]) {
      this.subs.push(entry.sub(() => this.results.set(NO_ATMO_RESULTS)));
    }
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }

  private numberField(
    value: Subject<number | null>,
    format: AtmoNumberFormat | AtmoAltitudeFormat,
    width = 260,
  ): VNode {
    return (
      <InputField<number>
        dataEntryFormat={format}
        value={value}
        containerStyle={`width: ${width}px;`}
        alignText="flex-start"
        hEventConsumer={this.props.container.hEventConsumer}
        interactionMode={this.props.container.interactionMode}
        errorHandler={this.errorHandler}
      />
    );
  }

  private dropdown(
    id: string,
    values: string[],
    selectedIndex: Subject<number | null>,
    onModified?: (index: number | null) => void,
  ): VNode {
    return (
      <DropdownMenu
        idPrefix={`${this.props.uiService.captOrFo}_OIT_inFltPerf_${id}`}
        selectedIndex={selectedIndex}
        values={ArraySubject.create(values)}
        freeTextAllowed={false}
        containerStyle="width: 260px;"
        alignLabels="flex-start"
        numberOfDigitsForInputField={12}
        tmpyActive={Subject.create(false)}
        hEventConsumer={this.props.container.hEventConsumer}
        interactionMode={this.props.container.interactionMode}
        onModified={onModified}
      />
    );
  }

  private line(label: string, unit: string, field: VNode, hidden?: Subscribable<boolean>): VNode {
    return (
      <div class={{ 'oit-perf-line': true, hidden: hidden ?? false }}>
        <div class="oit-perf-line-label">
          {label}
          <span class="oit-perf-unit">{unit}</span>
        </div>
        {field}
      </div>
    );
  }

  private resultLine(label: string, value: Subscribable<string>, bold = false): VNode {
    return (
      <div class="oit-perf-result-line">
        <div class={{ 'oit-perf-result-label': true, bold }}>{label}</div>
        <div class={{ 'oit-perf-result-value': true, bold }}>{value}</div>
      </div>
    );
  }

  render(): VNode {
    const hiddenOutsideSpeed = this.hiddenUnless((mode) => mode === 'SPEED');
    const hiddenInSpeed = this.hiddenUnless((mode) => mode !== 'SPEED');
    const hiddenOutsideLoAlt = this.hiddenUnless((mode) => mode === 'LO ALT');
    const hiddenInLoAlt = this.hiddenUnless((mode) => mode !== 'LO ALT');

    const courseHidden = MappedSubject.create(
      ([mode, wind]) => mode !== 'SPEED' || !isDirectionSpeedWind(wind),
      this.mode,
      this.wind,
    );
    const machHidden = MappedSubject.create(
      ([mode, speedType]) => mode !== 'SPEED' || speedType === 1,
      this.mode,
      this.speedType,
    );
    const iasHidden = MappedSubject.create(
      ([mode, speedType]) => mode !== 'SPEED' || speedType !== 1,
      this.mode,
      this.speedType,
    );
    this.subs.push(courseHidden, machHidden, iasHidden);

    const resultsHidden = (kinds: AtmoResultsView['kind'][]) => {
      const hidden = this.results.map((view) => kinds.indexOf(view.kind) < 0);
      this.subs.push(hidden);
      return hidden;
    };
    const errorText = MappedSubject.create(
      ([view, entryError]) => {
        const lines = view.kind === 'errors' ? view.lines.slice() : [];
        if (entryError !== null) {
          lines.push(entryError);
        }
        return lines.map((line) => `*** ${line}`).join('\n');
      },
      this.results,
      this.entryError,
    );
    this.subs.push(errorText);

    return (
      <>
        {/* begin page content */}
        <div class="oit-page-container oit-perf-page oit-in-flt-perf">
          <div class="oit-perf-modules">
            {IN_FLT_PERF_MODULES.map((module) => (
              <Button
                label={module}
                onClick={() => {}}
                disabled={Subject.create(module !== 'ATMO')}
                selected={Subject.create(module === 'ATMO')}
                buttonStyle="font-size: 22px; width: 130px; height: 46px;"
              />
            ))}
          </div>
          <div class="oit-perf-panels">
            <div class="oit-perf-left">
              <div class="oit-perf-panel">
                <div class="oit-perf-panel-title">CONDITIONS &lt;F3&gt;</div>
                {this.line(
                  'WIND',
                  '°/kt',
                  <InputField<AtmoWind>
                    dataEntryFormat={new AtmoWindFormat(this.course, this.windReformat)}
                    value={this.wind}
                    containerStyle="width: 260px;"
                    alignText="flex-start"
                    hEventConsumer={this.props.container.hEventConsumer}
                    interactionMode={this.props.container.interactionMode}
                    errorHandler={this.errorHandler}
                  />,
                  hiddenOutsideSpeed,
                )}
                {this.line('CRS', '°', this.numberField(this.course, new AtmoNumberFormat(0, 360, 0, 3)), courseHidden)}
                {this.line(
                  'TEMP',
                  'ΔISA °C',
                  <div class="fr aic">
                    <InputField<number>
                      dataEntryFormat={
                        new AtmoNumberFormat(-AtmoLimits.maxIsaDeviationC, AtmoLimits.maxIsaDeviationC, 0, 3)
                      }
                      value={this.isaDeviationField}
                      onModified={(isaDeviationC) =>
                        this.temperature.set(isaDeviationC === null ? null : { isaDeviationC })
                      }
                      containerStyle="width: 110px;"
                      alignText="flex-start"
                      hEventConsumer={this.props.container.hEventConsumer}
                      interactionMode={this.props.container.interactionMode}
                      errorHandler={this.errorHandler}
                    />
                    <span class="oit-perf-unit" style="margin: 0 10px;">
                      SAT
                    </span>
                    <InputField<number>
                      dataEntryFormat={new AtmoNumberFormat(AtmoLimits.minSatC, AtmoLimits.maxSatC, 0, 3)}
                      value={this.satField}
                      onModified={(satC) => this.temperature.set(satC === null ? null : { satC })}
                      containerStyle="width: 90px;"
                      alignText="flex-start"
                      hEventConsumer={this.props.container.hEventConsumer}
                      interactionMode={this.props.container.interactionMode}
                      errorHandler={this.errorHandler}
                    />
                  </div>,
                  hiddenInLoAlt,
                )}
                {this.line(
                  'GROSS WGHT',
                  this.weightUnit,
                  this.numberField(this.grossWeight, this.grossWeightFormat),
                  hiddenOutsideSpeed,
                )}
              </div>
              <div class="oit-perf-panel">
                <div class="oit-perf-panel-title">SPECIFIC DATA &lt;F4&gt;</div>
                {this.line(
                  'COMPUTATION TYPE',
                  '',
                  this.dropdown('computationType', COMPUTATION_TYPES, this.computationType),
                )}
                {this.line(
                  'SPD TYPE',
                  '',
                  this.dropdown('speedType', SPEED_TYPES, this.speedType, (index) => this.onSpeedTypeModified(index)),
                  hiddenOutsideSpeed,
                )}
                {this.line('ALT TYPE', '', this.dropdown('altType', ALT_TYPES, this.altType), hiddenInSpeed)}
                {this.line(
                  'MACH',
                  '',
                  this.numberField(this.mach, new AtmoNumberFormat(AtmoLimits.minMach, AtmoLimits.maxMach, 2, 4)),
                  machHidden,
                )}
                {this.line(
                  'IAS',
                  'kt',
                  this.numberField(this.ias, new AtmoNumberFormat(AtmoLimits.minIasKt, AtmoLimits.maxIasKt, 0, 3)),
                  iasHidden,
                )}
                {this.line(
                  'INDICATED ALT',
                  'ft',
                  this.numberField(
                    this.indicatedAltitude,
                    new AtmoAltitudeFormat(AtmoLimits.minAltitudeFt, AtmoLimits.maxAltitudeFt),
                  ),
                  hiddenInLoAlt,
                )}
                {this.line(
                  'HGT AAL',
                  'ft',
                  this.numberField(this.heightAal, new AtmoNumberFormat(0, AtmoLimits.maxHeightAalFt, 0, 5)),
                  hiddenOutsideLoAlt,
                )}
                {this.line(
                  'ARPT ELEVN',
                  'ft',
                  this.numberField(
                    this.airportElevation,
                    new AtmoNumberFormat(AtmoLimits.minElevationFt, AtmoLimits.maxElevationFt, 0, 6),
                  ),
                )}
                {this.line(
                  'ARPT TEMP',
                  '°C',
                  this.numberField(
                    this.airportTemperature,
                    new AtmoNumberFormat(AtmoLimits.minAirportTempC, AtmoLimits.maxAirportTempC, 0, 3),
                  ),
                  hiddenOutsideLoAlt,
                )}
              </div>
              {/* The aircraft status of the sim: no NSC and no CDL item */}
              <div class="oit-perf-panel oit-perf-status">-normal-</div>
            </div>
            <div class="oit-perf-panel oit-perf-results">
              <div class="oit-perf-panel-title">RESULTS</div>
              <div class={{ 'oit-perf-results-content': true, hidden: resultsHidden(['speed', 'true alt']) }}>
                <div class="oit-perf-results-title">ATMOSPHERE INFORMATION</div>
                <div class={{ 'oit-perf-results-section': true, hidden: resultsHidden(['speed']) }}>
                  <div class="oit-perf-results-subtitle">CONVERSIONS</div>
                  {this.resultLine(
                    'IAS',
                    this.speedResult((r) => `${Math.round(r.iasKt).toFixed(0)}kt`),
                  )}
                  {this.resultLine(
                    'MACH',
                    this.speedResult((r) => r.mach.toFixed(2)),
                  )}
                  {this.resultLine(
                    'TAS',
                    this.speedResult((r) => `${Math.round(r.tasKt).toFixed(0)}kt`),
                    true,
                  )}
                  {this.resultLine(
                    'GS',
                    this.speedResult((r) => `${Math.round(r.gsKt).toFixed(0)}kt`),
                  )}
                  {this.resultLine(
                    'True ALT',
                    this.speedResult((r) => formatAtmoTrueAltitude(r.trueAltitudeFt)),
                    true,
                  )}
                </div>
                <div class="oit-perf-results-section">
                  <div class="oit-perf-results-subtitle">ISA INFORMATION</div>
                  <div class={{ hidden: resultsHidden(['true alt']) }}>
                    {this.resultLine(
                      'True ALT',
                      this.isaResult((r) => formatAtmoTrueAltitude(r.trueAltitudeFt)),
                      true,
                    )}
                  </div>
                  {this.resultLine(
                    'Pressure',
                    this.isaResult((r) => `${Math.round(r.pressureHpa).toFixed(0)}hPa`),
                  )}
                  {this.resultLine(
                    'Density Ratio',
                    this.isaResult((r) => r.densityRatio.toFixed(4)),
                  )}
                  {this.resultLine(
                    'SPD of sound',
                    this.isaResult((r) => `${Math.round(r.speedOfSoundKt).toFixed(0)}kt`),
                  )}
                  {this.resultLine(
                    'SAT',
                    this.isaResult((r) => `${Math.round(r.satC).toFixed(0)}C`),
                  )}
                  <div class={{ hidden: resultsHidden(['speed']) }}>
                    {this.resultLine(
                      'TAT',
                      this.speedResult((r) => `${Math.round(r.tatC).toFixed(0)}C`),
                    )}
                  </div>
                </div>
              </div>
              <div class={{ 'oit-perf-results-content': true, hidden: resultsHidden(['lo alt']) }}>
                <div class="oit-perf-results-title">LOW ALTITUDE TEMPERATURE CORRECTIONS</div>
                {this.resultLine(
                  'Correction',
                  this.resultText((view) =>
                    view.kind === 'lo alt' ? `${view.results.correctionFt.toFixed(0)}ft` : null,
                  ),
                )}
                {this.resultLine(
                  'Corrected HGT AAL',
                  this.resultText((view) =>
                    view.kind === 'lo alt' ? `${view.results.correctedHeightAalFt.toFixed(0)}ft` : null,
                  ),
                  true,
                )}
              </div>
              <div style="flex-grow: 1" />
              <div class="oit-perf-errors">{errorText}</div>
            </div>
          </div>
          <div class="oit-perf-bottom-row">
            {/* No NSC or CDL item in the sim */}
            <Button
              label="ACFT STS <F5>"
              onClick={() => {}}
              disabled={Subject.create(true)}
              buttonStyle="font-size: 20px;"
            />
            <div style="flex-grow: 1" />
            <Button label="COMPUTE <F8>" onClick={() => this.compute()} buttonStyle="font-size: 20px;" />
            <Button label="CLEAR <F6>" onClick={() => this.clear()} buttonStyle="font-size: 20px;" />
          </div>
        </div>
        {/* end page content */}
      </>
    );
  }
}
