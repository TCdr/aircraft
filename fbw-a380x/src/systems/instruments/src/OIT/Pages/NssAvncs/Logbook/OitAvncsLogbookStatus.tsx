//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, MappedSubscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import {
  LogbookInfoField,
  LogbookItemCounts,
  canEditFlightInfo,
  enterFlightDate,
  enterFlightInfo,
  flightInfo,
  formatLogbookDateTime,
  hasValidRelease,
  itemCounts,
} from '../../../System/TechLogbook';
import { LogbookField, LogbookValueBox } from './LogbookWidgets';
import { LogbookDateFormat } from './LogbookEntryFormats';
import { LOGBOOK_URI, startAcceptance, startFlightClosure } from './LogbookFlows';

interface OitAvncsLogbookStatusProps extends AbstractOitAvncsPageProps {}

/** An entry field of the information area: its value, colour and whether it can be changed */
interface LogbookInfoFieldSubjects {
  readonly value: MappedSubscribable<string | null>;
  readonly fromAvionics: MappedSubscribable<boolean>;
  readonly disabled: MappedSubscribable<boolean>;
}

/**
 * The STATUS page: logbook control, aircraft and flight information, technical and cabin items, and the acceptance
 * (maintenance release, PIC ACCEPT, CLOSE FLIGHT).
 */
export class OitAvncsLogbookStatus extends DestroyableComponent<OitAvncsLogbookStatusProps> {
  private readonly store = this.props.container.ansu.techLogbook;
  private readonly sci = this.props.container.ansu.sci;
  private readonly state = this.store.state;

  private readonly onBoard = this.state.map((s) => s.control === 'on-board');
  private readonly onGround = this.state.map((s) => s.control !== 'on-board');
  private readonly lastUpdateText = this.state.map((s) => `LAST UPDATE : ${formatLogbookDateTime(s.lastSync)}`);

  private readonly info = MappedSubject.create(
    ([state]) => flightInfo(state.flight, this.store.avionicsInfo()),
    this.state,
    this.sci.fltNumber,
    this.sci.fltOrigin,
    this.sci.fltDestination,
  );

  private readonly registration = this.store.registration();

  private readonly counts = this.state.map((s) => itemCounts(s));

  private readonly releaseValid = this.state.map((s) => hasValidRelease(s, this.sci.zuluTime.get()));
  private readonly releaseInvalid = this.releaseValid.map((v) => !v);
  private readonly releaseDateText = this.state.map((s) => `DATE: ${formatLogbookDateTime(s.release?.date ?? null)}`);
  private readonly moreDisabled = this.state.map((s) => s.release === null);

  private readonly accepted = this.state.map((s) => s.flight.acceptance === 'accepted');
  private readonly notAccepted = this.accepted.map((a) => !a);
  private readonly picAcceptDisabled = this.state.map((s) => s.flight.acceptance !== 'not-accepted');

  private field(field: LogbookInfoField): LogbookInfoFieldSubjects {
    return {
      value: this.info.map((i) => i[field].value),
      fromAvionics: this.info.map((i) => !i[field].byCrew && i[field].value !== null),
      disabled: this.state.map((s) => !canEditFlightInfo(s, field)),
    };
  }

  private readonly flightNumber = this.field('flightNumber');
  private readonly from = this.field('from');
  private readonly to = this.field('to');
  private readonly date = this.info.map((i) => i.date);
  private readonly dateDisabled = this.state.map((s) => !canEditFlightInfo(s, 'date'));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.onBoard,
      this.onGround,
      this.lastUpdateText,
      this.info,
      this.counts,
      this.releaseValid,
      this.releaseInvalid,
      this.releaseDateText,
      this.moreDisabled,
      this.accepted,
      this.notAccepted,
      this.picAcceptDisabled,
      this.date,
      this.dateDisabled,
    );
    for (const f of [this.flightNumber, this.from, this.to]) {
      this.subscriptions.push(f.value, f.fromAvionics, f.disabled);
    }
  }

  /**
   * A button of the items area: greyed when its list is empty
   * @param label the list name
   * @param count the count of the list
   * @param uri the list page
   * @returns the button
   */
  private countButton(label: string, count: (c: LogbookItemCounts) => number, uri: string): VNode {
    const value = this.counts.map((c) => count(c));
    const text = value.map((v) => v.toFixed(0));
    const empty = value.map((v) => v === 0);
    this.subscriptions.push(value, text, empty);
    return (
      <Button
        label={
          <div class="oit-logbook-count-button">
            <span>{label}</span>
            <span>{text}</span>
          </div>
        }
        disabled={empty}
        onClick={() => this.props.uiService.navigateTo(uri)}
        containerStyle="margin-top: 12px;"
      />
    );
  }

  private infoField(
    label: string,
    field: LogbookInfoFieldSubjects,
    enter: (v: string | null) => void,
    width: number,
  ): VNode {
    return (
      <>
        <div class="oit-logbook-label">{label}</div>
        <LogbookField<string>
          container={this.props.container}
          format={new FreeTextFormat(8)}
          value={field.value}
          fromAvionics={field.fromAvionics}
          disabled={field.disabled}
          onModified={enter}
          width={width}
        />
      </>
    );
  }

  private enter(field: LogbookInfoField, value: string | null): void {
    this.store.change((s) => enterFlightInfo(s, field, value));
  }

  render(): VNode {
    return (
      <>
        <div class="oit-logbook-row">
          <div class={{ 'oit-logbook-row': true, hidden: this.onGround }}>
            <span class="oit-logbook-green" style="margin-right: 10px;">
              LOGBOOK ON BOARD
            </span>
            <Button label="GIVE BACK TO GROUND" onClick={() => this.store.startGiveBack()} />
          </div>
          <div class={{ 'oit-logbook-row': true, hidden: this.onBoard }}>
            <span class="oit-logbook-amber" style="margin-right: 10px;">
              LOGBOOK ON GROUND
            </span>
            <span style="margin-right: 10px;">{this.lastUpdateText}</span>
            <Button
              label="UPDATE"
              onClick={() =>
                this.store.dialog.set({
                  kind: 'Information',
                  lines: ['Update Logbook?'],
                  buttons: [{ label: 'OK', action: () => this.store.startUpdate() }, { label: 'CANCEL' }],
                })
              }
            />
          </div>
        </div>
        <div class="oit-logbook-separator" />
        <div style="display: grid; grid-template-columns: 330px 230px 60px 230px; grid-row-gap: 8px; align-items: center; margin-left: 60px;">
          <div class="oit-logbook-label">ACFT REGISTRATION</div>
          <div style="grid-column: 2 / 5;">
            <LogbookValueBox value={this.registration} centered textClass="oit-logbook-magenta" />
          </div>
          <div class="oit-logbook-label">FLT NBR</div>
          <div style="grid-column: 2 / 5;">
            <LogbookField<string>
              container={this.props.container}
              format={new FreeTextFormat(8)}
              value={this.flightNumber.value}
              fromAvionics={this.flightNumber.fromAvionics}
              disabled={this.flightNumber.disabled}
              onModified={(v) => this.enter('flightNumber', v)}
              width={520}
            />
          </div>
          {this.infoField('FROM', this.from, (v) => this.enter('from', v), 230)}
          {this.infoField('TO', this.to, (v) => this.enter('to', v), 230)}
          <div class="oit-logbook-label">DATE</div>
          <LogbookField<number>
            container={this.props.container}
            format={new LogbookDateFormat()}
            value={this.date}
            disabled={this.dateDisabled}
            onModified={(v) => this.store.change((s) => enterFlightDate(s, v))}
            width={230}
          />
          <div style="padding-left: 10px; grid-column: 3 / 5;">ddmmyy</div>
        </div>
        <div class="oit-logbook-separator" />
        <div class="oit-logbook-row" style="align-items: stretch; flex: 1;">
          <div class="oit-logbook-column" style="width: 300px;">
            <div class="oit-logbook-section">
              <span class="oit-logbook-section-title">TECHNICAL CONDITION</span>
              {this.countButton('OPEN ITEMS', (c) => c.open, LOGBOOK_URI.openItems)}
              {this.countButton('DEFERRED ITEMS', (c) => c.deferred, LOGBOOK_URI.deferredItems)}
              {this.countButton('TEMPORARY ITEMS', (c) => c.temporary, LOGBOOK_URI.temporaryItems)}
            </div>
            <div class="oit-logbook-section">
              <span class="oit-logbook-section-title">CABIN LOGBOOK</span>
              {this.countButton('OPEN ITEMS', (c) => c.cabinOpen, LOGBOOK_URI.cabinOpenItems)}
            </div>
          </div>
          <div
            class="oit-logbook-column"
            style="flex: 1; align-items: center; margin-left: 40px; border-left: 1px solid #c4c6cf;"
          >
            <div class="oit-logbook-section" style="width: 440px; margin-top: 20px;">
              <div class={{ 'oit-logbook-green': true, hidden: this.releaseInvalid }}>MAINTENANCE RELEASE</div>
              <div class={{ 'oit-logbook-amber': true, hidden: this.releaseValid }}>NO VALID MAINTENANCE RELEASE</div>
              <div class="oit-logbook-row" style="margin-top: 10px; justify-content: space-between;">
                <span>{this.releaseDateText}</span>
                <Button
                  label="MORE"
                  disabled={this.moreDisabled}
                  onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.release)}
                />
              </div>
            </div>
            <div style="flex: 1; border-left: 2px solid #ffffff; min-height: 40px;" />
            <div class={{ 'oit-logbook-column': true, hidden: this.accepted }} style="align-items: center;">
              <Button
                label="PIC ACCEPT"
                disabled={this.picAcceptDisabled}
                onClick={() => startAcceptance(this.store, this.props.uiService)}
              />
            </div>
            <div class={{ 'oit-logbook-column': true, hidden: this.notAccepted }} style="align-items: center;">
              <span class="oit-logbook-green">AIRCRAFT ACCEPTED</span>
              <Button
                label="CLOSE FLIGHT"
                onClick={() => startFlightClosure(this.store, this.props.uiService)}
                containerStyle="margin-top: 12px;"
              />
            </div>
          </div>
        </div>
      </>
    );
  }
}
