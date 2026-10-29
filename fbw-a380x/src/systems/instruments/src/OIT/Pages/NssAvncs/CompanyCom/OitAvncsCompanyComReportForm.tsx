//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import {
  ReportField,
  ReportForm,
  ReportWeightUnit,
  checkReport,
  entryBoxWidth,
  prefilledEntries,
  reportFormForUrl,
} from '../../../System/CompanyComReportForms';

interface OitAvncsCompanyComReportFormProps extends AbstractOitAvncsPageProps {
  /** The page URL, which gives the form */
  readonly url: string;
}

/** Maximum characters of a station callsign, as on the Free Text page */
const STATION_LENGTH = 8;

/** Entries up to this length share a row with the next short one */
const SHORT_FIELD_LENGTH = 10;

/** The usual widths of the boxes of the short and the long entries, px */
const SHORT_BOX_WIDTH = 200;
const LONG_BOX_WIDTH = 520;

/**
 * @param fields the fields of a form
 * @returns the rows of the page: two short fields side by side, a long one alone
 */
function fieldRows(fields: readonly ReportField[]): ReportField[][] {
  const rows: ReportField[][] = [];
  for (const field of fields) {
    const last = rows[rows.length - 1];
    if (
      field.length <= SHORT_FIELD_LENGTH &&
      last !== undefined &&
      last.length === 1 &&
      last[0].length <= SHORT_FIELD_LENGTH
    ) {
      last.push(field);
    } else {
      rows.push([field]);
    }
  }
  return rows;
}

/**
 * A COMPANY COM report or request form (INIT data, fuel figures, delays, diversion, ETA, flight summary...): a plain
 * form in the Free Text style, pre-filled when it opens, sent to a station through the AOC (CompanyComReportForms).
 */
export class OitAvncsCompanyComReportForm extends DestroyableComponent<OitAvncsCompanyComReportFormProps> {
  private readonly ansu = this.props.container.ansu;

  private readonly reports = this.ansu.companyComReports;

  private readonly form: ReportForm | null = reportFormForUrl(this.props.url);

  /** All the short boxes of the form share one width, so that the second column of the rows stays aligned */
  private readonly shortBoxWidth = Math.max(
    SHORT_BOX_WIDTH,
    ...(this.form?.fields ?? [])
      .filter((field) => field.length <= SHORT_FIELD_LENGTH)
      .map((field) => entryBoxWidth(field.length, field.required === true, SHORT_BOX_WIDTH)),
  );

  private readonly unit: ReportWeightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').get() ? 'KG' : 'LB';

  /** The entries stay while COMPANY COM is open: the page is drawn again at each return to it */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  /** Back on a form with entries: they replace the values pre-filled at the first opening */
  private readonly restored = this.drafts.has(this.props.url);

  private readonly station = this.drafts.field<string | null>(
    this.props.url,
    'station',
    this.reports.lastStation.get(),
  );

  private readonly entries = new Map<string, Subject<string | null>>();

  private readonly correction = Subject.create('');

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    if (this.form && !this.restored) {
      const prefilled = prefilledEntries(
        this.form,
        {
          flightNumber: this.ansu.sci.fltNumber.get(),
          origin: this.ansu.sci.fltOrigin.get(),
          destination: this.ansu.sci.fltDestination.get(),
          outTime: this.ansu.outBlockTime.get(),
          offTime: this.ansu.offBlockTime.get(),
          onTime: this.ansu.onBlockTime.get(),
          inTime: this.ansu.inBlockTime.get(),
          fuelOnBoard: this.ansu.sci.fqmsFuelQuantity.get().valueOr(null),
          outFuel: this.ansu.outBlockFob.get(),
          inFuel: this.ansu.inBlockFob.get(),
          airspeed: this.ansu.sci.airspeed.get().valueOr(null),
        },
        this.unit,
      );
      this.entries.forEach((entry, id) => entry.set(prefilled[id] ?? null));
    }
  }

  private entry(id: string): Subject<string | null> {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = this.drafts.field<string | null>(this.props.url, `field ${id}`, null);
      this.entries.set(id, entry);
    }
    return entry;
  }

  private send(): void {
    if (!this.form) {
      return;
    }
    const values: Record<string, string | null> = {};
    this.entries.forEach((entry, id) => (values[id] = entry.get()));
    const check = checkReport(this.form, this.station.get(), values, this.unit);
    const toCorrect = check.missingStation ? ['STATION', ...check.invalidLabels] : check.invalidLabels;
    this.correction.set(toCorrect.length > 0 ? `CHECK ${toCorrect.join(', ')}` : '');
    this.reports.send(this.props.url, this.form.title, check.message);
  }

  private renderField(field: ReportField): VNode {
    return (
      <div style="display: flex; flex-direction: row; align-items: center; margin-right: 15px;">
        <span class="oit-label" style="width: 190px;">
          {field.label}
        </span>
        <InputField<string>
          dataEntryFormat={new FreeTextFormat(field.length)}
          value={this.entry(field.id)}
          mandatory={field.required === true}
          containerStyle={`width: ${field.length <= SHORT_FIELD_LENGTH ? this.shortBoxWidth : entryBoxWidth(field.length, field.required === true, LONG_BOX_WIDTH)}px;`}
          alignText="flex-start"
          canBeCleared={true}
          hEventConsumer={this.props.container.hEventConsumer}
          interactionMode={this.props.container.interactionMode}
          errorHandler={() => {}}
        />
      </div>
    );
  }

  render(): VNode {
    if (!this.form) {
      return <></>;
    }
    return (
      <>
        <div class="oit-ccom-headline">{this.form.title}</div>
        <div class="oit-labeled-box-container">
          <span class="oit-labeled-box-label">Station</span>
          <div style="display: flex; flex-direction: row; justify-content: flex-start; padding: 5px 15px;">
            <InputField<string>
              dataEntryFormat={new FreeTextFormat(STATION_LENGTH)}
              value={this.station}
              mandatory={true}
              containerStyle={`width: ${entryBoxWidth(STATION_LENGTH, true, 220)}px;`}
              alignText="flex-start"
              canBeCleared={true}
              hEventConsumer={this.props.container.hEventConsumer}
              interactionMode={this.props.container.interactionMode}
              errorHandler={() => {}}
            />
          </div>
        </div>
        <div class="oit-labeled-box-container">
          <span class="oit-labeled-box-label">Report</span>
          <div style="display: flex; flex-direction: column; padding: 5px 15px; gap: 8px;">
            {fieldRows(this.form.fields).map((row) => (
              <div style="display: flex; flex-direction: row; align-items: center;">
                {row.map((field) => this.renderField(field))}
              </div>
            ))}
          </div>
        </div>
        <div style="display: flex; flex-direction: row; justify-content: flex-end; align-items: center; margin: 0px 20px; align-self: stretch;">
          <div class="oit-label amber" style="flex: 1;">
            {this.correction}
          </div>
          <div class="oit-green-text" style="margin-right: 25px;">
            {this.reports.status(this.props.url)}
          </div>
          <Button label="SEND" onClick={() => this.send()} />
        </div>
        <div style="flex-grow: 1" />
      </>
    );
  }
}
