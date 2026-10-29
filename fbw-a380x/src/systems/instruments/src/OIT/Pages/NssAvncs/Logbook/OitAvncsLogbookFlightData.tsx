//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import {
  LogbookEffectivePostFlight,
  LogbookInfoField,
  LogbookPostFlightData,
  LogbookPreFlightData,
  canEditFlightInfo,
  canRecordData,
  effectivePostFlight,
  enterFlightDate,
  enterFlightInfo,
  enterPostFlight,
  enterPreFlight,
  flightInfo,
  formatLogbookDate,
  formatLogbookMinutes,
} from '../../../System/TechLogbook';
import { LogbookClickable, LogbookField, LogbookTickBox, LogbookValueBox } from './LogbookWidgets';
import { LogbookDateFormat, LogbookIntegerFormat, LogbookMinutesFormat } from './LogbookEntryFormats';
import { LOGBOOK_URI } from './LogbookFlows';

interface OitAvncsLogbookFlightDataProps extends AbstractOitAvncsPageProps {}

/** The highest hour of a total time entry */
const TOTAL_TIME_MAX_HOURS = 99_999;

/**
 * The FLIGHT DATA page: the information of the current flight or of a closed one, and the PRE-FLIGHT and POST-FLIGHT
 * panels (typical parameters, operator customised). The POST-FLIGHT times come from the flight log (OFF,
 * ON, flight time) in magenta until the crew enters them; TOTAL TIME B/F comes from the previous flight. Mandatory
 * empty fields are amber.
 */
export class OitAvncsLogbookFlightData extends DestroyableComponent<OitAvncsLogbookFlightDataProps> {
  private readonly store = this.props.container.ansu.techLogbook;
  private readonly ansu = this.props.container.ansu;
  private readonly sci = this.ansu.sci;

  /** The panel the crew selected stays until the LOGBOOK application closes; the entries go into the logbook */
  private readonly panel = this.ansu.pageDrafts.field<number>(LOGBOOK_URI.flightData, 'panel', 0);
  private readonly panelSelected = [0, 1].map((i) => this.panel.map((p) => p === i));
  private readonly panelHidden = [0, 1].map((i) => this.panel.map((p) => p !== i));

  private readonly flight = MappedSubject.create(
    ([state, index]) => state.pastFlights.find((f) => f.index === index) ?? state.flight,
    this.store.state,
    this.store.shownFlightIndex,
  );

  private readonly isCurrent = MappedSubject.create(
    ([flight, state]) => flight.index === state.flight.index,
    this.flight,
    this.store.state,
  );

  private readonly flightOptions = ArraySubject.create<string>([]);
  private readonly flightOptionIndex = Subject.create<number | null>(0);

  private readonly info = MappedSubject.create(
    ([flight]) => flightInfo(flight, this.store.avionicsInfo()),
    this.flight,
    this.sci.fltNumber,
    this.sci.fltOrigin,
    this.sci.fltDestination,
  );

  private readonly currentBlock = MappedSubject.create(
    () => this.store.blockData(),
    this.ansu.outBlockTime,
    this.ansu.offBlockTime,
    this.ansu.onBlockTime,
    this.ansu.inBlockTime,
    this.ansu.outBlockFob,
    this.ansu.inBlockFob,
    this.ansu.flightTime,
  );

  private readonly post = MappedSubject.create(
    ([state, flight, block]) => effectivePostFlight(state, flight, flight.blockData ?? block),
    this.store.state,
    this.flight,
    this.currentBlock,
  );

  private readonly editable = MappedSubject.create(
    ([state, current]) => current && canRecordData(state),
    this.store.state,
    this.isCurrent,
  );
  private readonly readOnly = this.editable.map((e) => !e);

  private readonly registration = this.store.registration();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      ...this.panelSelected,
      ...this.panelHidden,
      this.flight,
      this.isCurrent,
      this.info,
      this.currentBlock,
      this.post,
      this.editable,
      this.readOnly,
      this.store.state.sub((state) => {
        this.flightOptions.set([
          `${flightInfo(state.flight, this.store.avionicsInfo()).flightNumber.value ?? ''} (CURRENT)`,
          ...state.pastFlights.map(
            (f) => `${f.signedInfo?.flightNumber.value ?? ''} (${formatLogbookDate(f.signedInfo?.date ?? f.closedAt)})`,
          ),
        ]);
      }, true),
      this.store.shownFlightIndex.sub((index) => {
        const position = this.store.state.get().pastFlights.findIndex((f) => f.index === index);
        this.flightOptionIndex.set(position + 1);
      }, true),
    );
  }

  /**
   * A subject mapped from the flight data, destroyed with the page
   * @param source the subject
   * @param fn the mapping
   * @returns the mapped subject
   */
  private map<T, U>(source: Subscribable<T>, fn: (value: T) => U): Subscribable<U> {
    return this.track(source.map(fn));
  }

  /**
   * Keeps a subject made while rendering, to destroy it with the page
   * @param subject the subject
   * @returns the same subject
   */
  private track<T extends Subscription>(subject: T): T {
    this.subscriptions.push(subject);
    return subject;
  }

  private selectFlight(option: number | null): void {
    const past = option !== null && option > 0 ? this.store.state.get().pastFlights[option - 1] : undefined;
    this.store.shownFlightIndex.set(past ? past.index : null);
  }

  private label(text: string, width: number): VNode {
    return (
      <div class="oit-logbook-label" style={`width: ${width}px;`}>
        {text}
      </div>
    );
  }

  private infoField(field: LogbookInfoField, width: number): VNode {
    return (
      <LogbookField<string>
        container={this.props.container}
        format={new FreeTextFormat(8)}
        value={this.map(this.info, (i) => i[field].value)}
        fromAvionics={this.map(this.info, (i) => !i[field].byCrew && i[field].value !== null)}
        disabled={this.track(
          MappedSubject.create(
            ([state, current]) => !current || !canEditFlightInfo(state, field),
            this.store.state,
            this.isCurrent,
          ),
        )}
        onModified={(v) => this.store.change((s) => enterFlightInfo(s, field, v))}
        width={width}
      />
    );
  }

  private preFlightField(key: 'receiptNumber' | 'fuelSupplier', width: number): VNode {
    return (
      <LogbookField<string>
        container={this.props.container}
        format={new FreeTextFormat(10)}
        value={this.map(this.flight, (f) => f.preFlight[key])}
        disabled={this.readOnly}
        onModified={(v) => this.store.change((s) => enterPreFlight(s, { [key]: v } as Partial<LogbookPreFlightData>))}
        width={width}
      />
    );
  }

  private postFlightTimeField(
    key: 'totalTimeBroughtForward' | 'flightTime' | 'takeOff' | 'landing',
    maxHours: number,
    mandatory: boolean,
  ): VNode {
    const value = (p: LogbookEffectivePostFlight) => p[key];
    return (
      <LogbookField<number>
        container={this.props.container}
        format={new LogbookMinutesFormat(maxHours)}
        value={this.map(this.post, (p) => value(p).value)}
        fromAvionics={this.map(this.post, (p) => !value(p).byCrew && value(p).value !== null)}
        mandatory={mandatory ? this.editable : false}
        disabled={this.readOnly}
        onModified={(v) => this.store.change((s) => enterPostFlight(s, { [key]: v } as Partial<LogbookPostFlightData>))}
        width={240}
      />
    );
  }

  render(): VNode {
    return (
      <>
        <div class="oit-logbook-row">
          {this.label('FLT NBR', 110)}
          <DropdownMenu
            values={this.flightOptions}
            selectedIndex={this.flightOptionIndex}
            onModified={(index) => this.selectFlight(index)}
            idPrefix={`${this.props.uiService.captOrFo}_logbook_flight_data_flight`}
            freeTextAllowed={false}
            containerStyle="width: 380px;"
            hEventConsumer={this.props.container.hEventConsumer}
            interactionMode={this.props.container.interactionMode}
          />
          <div style="flex: 1;" />
          {this.label('ACFT REGISTRATION', 260)}
          <LogbookValueBox value={this.registration} width="240px" centered textClass="oit-logbook-magenta" />
        </div>
        <div class="oit-logbook-row" style="margin-top: 8px;">
          {this.label('FROM', 110)}
          {this.infoField('from', 160)}
          {this.label('TO', 80)}
          {this.infoField('to', 160)}
          <div style="flex: 1;" />
          {this.label('DATE', 100)}
          <LogbookField<number>
            container={this.props.container}
            format={new LogbookDateFormat()}
            value={this.map(this.info, (i) => i.date)}
            disabled={this.track(
              MappedSubject.create(
                ([state, current]) => !current || !canEditFlightInfo(state, 'date'),
                this.store.state,
                this.isCurrent,
              ),
            )}
            onModified={(v) => this.store.change((s) => enterFlightDate(s, v))}
            width={240}
          />
        </div>
        <div class="oit-logbook-tabs" style="margin-top: 12px;">
          {['PRE-FLIGHT', 'POST-FLIGHT'].map((title, index) => (
            <LogbookClickable
              class={{ 'oit-logbook-tab': true, selected: this.panelSelected[index] }}
              onClick={() => this.panel.set(index)}
            >
              {title}
            </LogbookClickable>
          ))}
        </div>
        <div class="oit-logbook-content">
          <div class={{ 'oit-logbook-column': true, hidden: this.panelHidden[0] }}>
            <div class="oit-logbook-section">
              <span class="oit-logbook-section-title">FUEL</span>
              <div class="oit-logbook-row">
                {this.label('RECEIPT NUMBER', 230)}
                {this.preFlightField('receiptNumber', 240)}
                <div style="flex: 1;" />
                {this.label('TOTAL UPLIFT', 200)}
                <LogbookField<number>
                  container={this.props.container}
                  format={new LogbookIntegerFormat(7)}
                  value={this.map(this.flight, (f) => f.preFlight.totalUplift)}
                  mandatory={this.editable}
                  disabled={this.readOnly}
                  onModified={(v) => this.store.change((s) => enterPreFlight(s, { totalUplift: v }))}
                  width={240}
                />
                <span style="margin-left: 8px; width: 70px;">LTRS</span>
              </div>
              <div class="oit-logbook-row" style="margin-top: 8px;">
                {this.label('FUEL SUPPLIER', 230)}
                {this.preFlightField('fuelSupplier', 240)}
              </div>
            </div>
            <div class="oit-logbook-section">
              <span class="oit-logbook-section-title">ICING</span>
              <div class="oit-logbook-row">
                <LogbookTickBox
                  caption={{ text: 'NIL', width: 230 }}
                  checked={this.map(this.flight, (f) => f.preFlight.noDeIcing)}
                  disabled={this.readOnly}
                  label="NO DE-ICING"
                  labelClass="oit-logbook-cyan"
                  onToggle={() =>
                    this.store.change((s) => enterPreFlight(s, { noDeIcing: !this.flight.get().preFlight.noDeIcing }))
                  }
                />
                <div style="flex: 1;" />
                {this.label('TIME STARTED', 200)}
                <LogbookField<number>
                  container={this.props.container}
                  format={new LogbookMinutesFormat(23)}
                  value={this.map(this.flight, (f) => f.preFlight.deIcingStart)}
                  mandatory={this.track(
                    MappedSubject.create(
                      ([editable, flight]) => editable && !flight.preFlight.noDeIcing,
                      this.editable,
                      this.flight,
                    ),
                  )}
                  disabled={this.readOnly}
                  onModified={(v) => this.store.change((s) => enterPreFlight(s, { deIcingStart: v }))}
                  width={240}
                />
                <span style="margin-left: 8px; width: 70px;">HH:MM</span>
              </div>
            </div>
          </div>
          <div class={{ 'oit-logbook-column': true, hidden: this.panelHidden[1] }}>
            <div class="oit-logbook-section">
              <span class="oit-logbook-section-title">NIL DEFECT</span>
              <div class="oit-logbook-row">
                <LogbookTickBox
                  caption={{ text: 'NIL DEFECT', width: 230 }}
                  checked={this.map(this.post, (p) => p.nilDefect)}
                  disabled={this.readOnly}
                  onToggle={() =>
                    this.store.change((s) => enterPostFlight(s, { nilDefect: !this.flight.get().postFlight.nilDefect }))
                  }
                />
              </div>
            </div>
            <div class="oit-logbook-section">
              <span class="oit-logbook-section-title">TIME</span>
              <div class="oit-logbook-row">
                {this.label('TOTAL TIME B/F', 230)}
                {this.postFlightTimeField('totalTimeBroughtForward', TOTAL_TIME_MAX_HOURS, false)}
                <span style="margin-left: 8px; width: 90px;">HOURS</span>
                <div style="flex: 1;" />
                {this.label('LANDING', 160)}
                {this.postFlightTimeField('landing', 23, true)}
                <span style="margin-left: 8px; width: 50px;">(Z)</span>
              </div>
              <div class="oit-logbook-row" style="margin-top: 8px;">
                {this.label('FLIGHT TIME', 230)}
                {this.postFlightTimeField('flightTime', 99, true)}
                <span style="margin-left: 8px; width: 90px;">HH:MM</span>
                <div style="flex: 1;" />
                {this.label('TAKE OFF', 160)}
                {this.postFlightTimeField('takeOff', 23, true)}
                <span style="margin-left: 8px; width: 50px;">(Z)</span>
              </div>
              <div class="oit-logbook-row" style="margin-top: 8px;">
                {this.label('TOTAL TIME', 230)}
                <LogbookValueBox
                  value={this.map(this.post, (p) => formatLogbookMinutes(p.totalTime))}
                  width="240px"
                  centered
                  textClass="oit-logbook-cyan"
                />
                <span style="margin-left: 8px; width: 90px;">HOURS</span>
              </div>
            </div>
          </div>
          <div style="flex: 1;" />
        </div>
        <div class="oit-logbook-bottom-buttons">
          <Button label="STATUS" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)} />
        </div>
      </>
    );
  }
}
