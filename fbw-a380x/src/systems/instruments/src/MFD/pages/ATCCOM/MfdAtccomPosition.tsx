// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  DisplayComponent,
  FSComponent,
  NodeReference,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdAtccomRequest.scss';
import './MfdAtccomConnect.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { AtccomFooter } from './MfdAtccomFooter';
import { RequestFieldKind } from '../../ATCCOM/RequestFrames';
import {
  hasPositionReportData,
  ICING_VALUES,
  isPositionReportComplete,
  PositionReportValues,
  TURBULENCE_VALUES,
} from '../../ATCCOM/PositionReport';
import { AtccomTextFormat, parseAtcFreetext, requestFieldFormat } from './AtccomEntryFormats';

type TextKey = {
  [K in keyof PositionReportValues]: PositionReportValues[K] extends string | null ? K : never;
}[keyof PositionReportValues];

type CheckKey = 'deviating' | 'climbing' | 'descending';

/** The freetext frame of the FREETEXT page: 96 characters over two lines */
const FREETEXT_FORMAT = new AtccomTextFormat(48, parseAtcFreetext, true, '-'.repeat(10));

/** The rows of the position fields, from the FCOM figure (page coordinates, y at the centre) */
const POSITION_ROWS: [string, TextKey, TextKey | null, TextKey | null, number][] = [
  ['OVHD', 'ovhd', 'ovhdUtc', 'ovhdAlt', 160.3],
  ['PPOS', 'ppos', 'pposUtc', 'pposAlt', 206],
  ['TO', 'to', 'toUtc', null, 250.4],
  ['NEXT', 'next', null, null, 295.5],
];

/**
 * REPORT/AUTO & MANUAL POSITION page (A380 FCOM DSC-46-10-20-30 P 17-21), laid out on the FCOM figure (page coordinates
 * = display y - 143): the AUTO POSITION REPORT function, and the position report completed with the FMS data (REFRESH
 * DATA) or by the flight crew, with PPOS, its time and altitude mandatory. ADD FREETEXT displays the FREETEXT page: the
 * report data not modifiable, a freetext frame and RETURN TO REPORT.
 */
export class MfdAtccomPosition extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly atc = this.props.atcService;

  private readonly report = this.atc.positionReport;

  /** The FREETEXT page: only the freetext frame can be modified */
  private readonly freetextMode = Subject.create(false);

  private readonly title = this.freetextMode.map((freetext) =>
    freetext ? `${this.props.pageTitle ?? ''}/FREETEXT` : this.props.pageTitle ?? '',
  );

  private readonly reportVisibility = this.freetextMode.map((freetext) => (freetext ? 'hidden' : 'inherit'));

  private readonly freetextVisibility = this.freetextMode.map((freetext) => (freetext ? 'inherit' : 'hidden'));

  private readonly noData = this.report.map((report) => !hasPositionReportData(report));

  private readonly incomplete = this.report.map((report) => !isPositionReportComplete(report));

  private readonly freetextLabel = this.report.map((report) =>
    report.freetext.some((line) => line) ? 'MODIFY\nFREETEXT' : 'ADD\nFREETEXT',
  );

  private readonly autoLabelClass = this.atc.autoPositionReport.map((on) => (on ? 'ads-upper active' : 'ads-upper'));

  private readonly autoOffClass = this.atc.autoPositionReport.map((on) => (on ? 'ads-lower' : 'ads-lower active'));

  /** Plain elements: JSX onClick is not a listener with FSComponent */
  private readonly listeners: [NodeReference<HTMLElement>, () => void][] = [];

  private clickable(handler: () => void): NodeReference<HTMLDivElement> {
    const ref = FSComponent.createRef<HTMLDivElement>();
    this.listeners.push([ref, handler]);
    return ref;
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.listeners.forEach(([ref, handler]) => ref.instance.addEventListener('click', handler));
    this.subs.push(
      this.title,
      this.reportVisibility,
      this.freetextVisibility,
      this.noData,
      this.incomplete,
      this.freetextLabel,
      this.autoLabelClass,
      this.autoOffClass,
    );

    // The fields are completed with the FMS data (FCOM PRO How to use position report)
    if (!hasPositionReportData(this.report.get())) {
      this.atc.refreshPositionReport();
    }
  }

  public destroy(): void {
    this.listeners.forEach(([ref, handler]) => ref.getOrDefault()?.removeEventListener('click', handler));
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  /** A field of the report, not modifiable on the FREETEXT page */
  private field(
    key: TextKey,
    kind: RequestFieldKind,
    width: number,
    mandatory: Subscribable<boolean> | boolean = false,
  ) {
    const value = Subject.create<string | null>(this.report.get()[key] as string | null);
    const mandatorySubject = typeof mandatory === 'boolean' ? Subject.create(mandatory) : mandatory;
    this.subs.push(this.report.sub((report) => value.set(report[key] as string | null)));
    return (
      <InputField<string>
        dataEntryFormat={requestFieldFormat(kind)}
        value={value}
        dataHandlerDuringValidation={async (newValue) => this.atc.setPositionReportValue(key, newValue)}
        mandatory={mandatorySubject}
        inactive={this.freetextMode}
        canBeCleared={Subject.create(true)}
        errorHandler={(e) => this.atc.showAtcErrorMessage(e.type, e.details)}
        containerStyle={`width: ${width}px;`}
        alignText="center"
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />
    );
  }

  private dropdown(key: 'icing' | 'turbulence', values: string[]) {
    const index = this.report.map((report) => Math.max(0, values.indexOf(report[key])));
    this.subs.push(index);
    return (
      <DropdownMenu
        idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_positionReport_${key}`}
        selectedIndex={index}
        values={ArraySubject.create(values.map((v) => (v === '' ? ' ' : v)))}
        freeTextAllowed={false}
        onModified={(i) => this.atc.setPositionReportValue(key, values[i ?? 0] ?? '')}
        containerStyle="width: 212px;"
        alignLabels="center"
        numberOfDigitsForInputField={8}
        tmpyActive={Subject.create(false)}
        inactive={this.freetextMode}
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />
    );
  }

  /** DEVIATING, CLIMBING TO, DESCENDING TO: the box ticked makes the associated field mandatory (FCOM P 20) */
  private check(key: CheckKey, label: string, left: number, kind: RequestFieldKind) {
    const checked = this.report.map((report) => report[key]);
    const fieldVisibility = checked.map((c) => (c ? 'inherit' : 'hidden'));
    this.subs.push(checked, fieldVisibility);
    const valueKey = `${key}Value` as TextKey;
    const toggle = () => {
      if (this.freetextMode.get()) {
        return;
      }
      const on = !this.report.get()[key];
      const report = { ...this.report.get(), [key]: on };
      // CLIMBING TO and DESCENDING TO are exclusive
      if (on && key === 'climbing') {
        report.descending = false;
      } else if (on && key === 'descending') {
        report.climbing = false;
      }
      this.atc.positionReport.set(report);
    };
    return (
      <>
        {fcomAt(
          679.6,
          left,
          <div ref={this.clickable(toggle)} class="mfd-atccom-checkbox">
            <svg width="22" height="22" viewBox="0 0 22 22" style={{ visibility: fieldVisibility }}>
              <polyline points="3,11 9,18 20,3" fill="none" stroke="#00ff00" stroke-width="3" />
            </svg>
          </div>,
        )}
        {fcomAt(679.6, left + 30, <span class="mfd-label">{label}</span>)}
        {fcomAt(
          722,
          left + 30,
          <div style={{ visibility: fieldVisibility }}>{this.field(valueKey, kind, 170, true)}</div>,
        )}
      </>
    );
  }

  render(): VNode {
    const label = (text: string) => <span class="mfd-label">{text}</span>;
    return (
      <>
        <ActivePageTitleBar activePage={this.title} offset={Subject.create('')} />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-request">
            <div style={{ visibility: this.reportVisibility }}>
              {fcomRight(43.4, 434, label('AUTO POSITION REPORT'))}
              <div
                ref={this.clickable(() => this.atc.toggleAutoPositionReport())}
                class="mfd-atccom-ads-slot"
                style="left: 526.6px; top: 4.2px;"
              >
                <div class="mfd-atccom-ads-button" style="width: 117px;">
                  <span class={this.autoLabelClass}>ON</span>
                  <span class={this.autoOffClass}>OFF</span>
                </div>
              </div>
            </div>
            {/* The freetext frame of the FREETEXT page, in place of the AUTO POSITION REPORT function */}
            <div style={{ visibility: this.freetextVisibility }}>
              {[0, 1].map((line) => {
                const value = Subject.create<string | null>(this.report.get().freetext[line]);
                this.subs.push(this.report.sub((report) => value.set(report.freetext[line])));
                return fcomAt(
                  22 + line * 44,
                  11,
                  <InputField<string>
                    dataEntryFormat={FREETEXT_FORMAT}
                    value={value}
                    dataHandlerDuringValidation={async (text) => {
                      const freetext: [string | null, string | null] = [...this.report.get().freetext];
                      freetext[line] = text;
                      this.atc.setPositionReportValue('freetext', freetext);
                    }}
                    canBeCleared={Subject.create(true)}
                    errorHandler={(e) => this.atc.showAtcErrorMessage(e.type, e.details)}
                    containerStyle="width: 744px;"
                    alignText="flex-start"
                    class="mfd-atccom-request-freetext"
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                );
              })}
            </div>
            {fcomLine(88.8, 11, 754)}

            {/* Position */}
            {fcomCentre(121, 493, label('UTC'))}
            {fcomCentre(121, 653, label('ALT'))}
            {POSITION_ROWS.map(([name, position, utc, alt, y]) => {
              const mandatory = name === 'PPOS';
              return (
                <>
                  {fcomRight(y, 59.7, label(name))}
                  {fcomAt(y, 61.6, this.field(position, 'fix', 377, mandatory))}
                  {utc && fcomAt(y, 442.8, this.field(utc, 'time', 106, mandatory))}
                  {alt && fcomAt(y, 552.9, this.field(alt, 'altitude', 214, mandatory))}
                </>
              );
            })}

            {/* Speed and heading */}
            {fcomCentre(349.4, 244.4, label('CAS'))}
            {fcomCentre(349.4, 446.5, label('GROUND'))}
            {fcomCentre(349.4, 645.5, label('VERTICAL'))}
            {fcomRight(388, 124.4, label('SPEED'))}
            {fcomAt(388, 130.6, this.field('cas', 'speed', 229))}
            {fcomAt(388, 364.4, this.field('groundSpeed', 'groundSpeed', 184))}
            {fcomAt(388, 552.9, this.field('verticalSpeed', 'verticalSpeed', 194))}
            {fcomRight(433, 124.4, label('HEADING'))}
            {fcomAt(433, 130.6, this.field('heading', 'degree', 149))}
            {fcomRight(433, 543, label('TRACK'))}
            {fcomAt(433, 549.2, this.field('track', 'degree', 162))}

            {/* Meteo */}
            {fcomRight(499.8, 124.4, label('WIND'))}
            {fcomAt(499.8, 130.6, this.field('wind', 'wind', 229))}
            {fcomRight(499.8, 543, label('SAT'))}
            {fcomAt(499.8, 549.2, this.field('sat', 'sat', 162))}
            {fcomRight(544.7, 124.4, label('ICING'))}
            {fcomAt(544.7, 129.4, this.dropdown('icing', ICING_VALUES))}
            {fcomRight(544.7, 543, label('TURBULENCE'))}
            {fcomAt(544.7, 547.9, this.dropdown('turbulence', TURBULENCE_VALUES))}

            {/* Information */}
            {fcomRight(612.4, 124.4, label('ETA DEST'))}
            {fcomAt(612.4, 130.6, this.field('etaDest', 'time', 149))}
            {fcomRight(612.4, 543, label('ENDURANCE'))}
            {fcomAt(612.4, 549.2, this.field('endurance', 'endurance', 162))}
            {this.check('deviating', 'DEVIATING', 13.7, 'offset')}
            {this.check('climbing', 'CLIMBING TO', 253.7, 'altitude')}
            {this.check('descending', 'DESCENDING TO', 533.6, 'altitude')}

            {/* Buttons */}
            <div style={{ visibility: this.reportVisibility }}>
              {fcomAt(
                784.5,
                0,
                <Button
                  label={'ERASE\nALL FIELDS'}
                  disabled={this.noData}
                  onClick={() => this.atc.erasePositionReport()}
                  buttonStyle="width: 188px; height: 57px;"
                />,
              )}
              {fcomAt(
                784.5,
                191,
                <Button
                  label={'REFRESH\nDATA'}
                  onClick={() => this.atc.refreshPositionReport()}
                  buttonStyle="width: 192px; height: 57px;"
                />,
              )}
              {fcomAt(
                784.5,
                385.6,
                <Button
                  label={this.freetextLabel}
                  onClick={() => this.freetextMode.set(true)}
                  buttonStyle="width: 190px; height: 57px;"
                />,
              )}
            </div>
            <div style={{ visibility: this.freetextVisibility }}>
              {fcomAt(
                784.5,
                385.6,
                <Button
                  label={'RETURN\nTO REPORT'}
                  onClick={() => this.freetextMode.set(false)}
                  buttonStyle="width: 190px; height: 57px;"
                />,
              )}
            </div>
            {fcomAt(
              784.5,
              577.7,
              <Button
                label={'XFR\nTO MAILBOX'}
                disabled={this.incomplete}
                onClick={() => {
                  this.atc.transferPositionReport();
                  this.freetextMode.set(false);
                }}
                buttonStyle="width: 190px; height: 57px;"
              />,
            )}
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}
