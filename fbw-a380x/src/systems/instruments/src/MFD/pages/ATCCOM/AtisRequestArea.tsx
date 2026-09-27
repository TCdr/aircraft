// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  ComponentProps,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subject,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { AtisMessage } from '@datalink/common';

import { MfdDisplayInterface } from '../../MFD';
import { AtcDatalinkSystem, AtisArea, AtisStatus } from '../../ATCCOM/AtcDatalinkSystem';
import { fcomAt } from '../common/FcomLayout';
import { AirportFormat } from '../common/DataEntryFormats';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { Button, ButtonMenuItem } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { NewAtisIcon } from './Elements/NewAtisIcon';
import { AutoUpdateIcon } from './Elements/AutoUpdateIcon';
import { AutoPrintIcon } from './Elements/AutoPrintIcon';
import { atisListLines } from './AtisText';

interface AtisRequestAreaProps extends ComponentProps {
  bus: EventBus;
  mfd: MfdDisplayInterface;
  atcService: AtcDatalinkSystem;
  /** The request area, 0 to 2 */
  index: number;
  /** The page y of the top of the area */
  top: number;
}

/** The two-line labels of the message status / FSM button (FCOM DSC-46-10-20-30 P 32) */
const STATUS_LABELS: Record<AtisStatus, string> = {
  '': '',
  SENDING: 'SENDING',
  SENT: 'SENT',
  'USE VOICE': 'USE\nVOICE',
  'SEND AGAIN': 'SEND\nAGAIN',
  'NO AUTO UPDATE': 'NO AUTO\nUPDATE',
  'END OF UPDATE': 'END OF\nUPDATE',
};

/**
 * An ATIS request area of the ATIS/LIST page (A380 FCOM DSC-46-10-20-30 P 30-34), laid out on the FCOM figure: the
 * AIRPORT entry field, the ATIS TYPE list, the ATIS version and time, the NEW ATIS, AUTO UPDATE and AUTO PRINT symbols,
 * the message status / FSM button, OPTIONS (or SEND REQUEST and AUTO UPDATE after a change of the airport or the
 * type), and the 5-line message area.
 */
export class AtisRequestArea extends DisplayComponent<AtisRequestAreaProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly area = this.props.atcService.atisAreas[this.props.index];

  private readonly icao = Subject.create<string | null>(this.area.get().icao);

  private readonly typeIndex = Subject.create<number | null>(this.area.get().type);

  private readonly report = MappedSubject.create(
    () => this.props.atcService.atisReport(this.props.index) ?? null,
    this.area,
    this.props.atcService.atisReportsVersion,
  );

  private readonly text = this.report.map((report: AtisMessage | null) =>
    atisListLines(report ? report.Reports[0].report.toUpperCase() : ''),
  );

  private readonly lines = [0, 1, 2, 3, 4].map((i) => this.text.map((text) => text.lines[i]));

  private readonly version = this.report.map((report) => (report ? report.Information || '-' : ''));

  private readonly time = this.report.map((report) => (report ? report.Timestamp.mailboxTimestamp() : ''));

  private readonly newAtis = MappedSubject.create(
    ([report, area]) => report !== null && report.Information !== area.readVersion,
    this.report,
    this.area,
  );

  private readonly autoUpdate = this.area.map((area) => area.autoUpdate);

  private readonly autoPrint = this.area.map((area) => area.autoPrint);

  private readonly statusLabel = this.area.map((area) => STATUS_LABELS[area.status]);

  private readonly statusVisible = this.area.map((area) => area.status !== '');

  private readonly requestButtonsVisible = this.area.map((area) => area.modified);

  private readonly requestButtonsDisabled = this.area.map((area) => area.icao === null || area.waiting);

  private readonly optionsVisible = this.area.map((area) => area.accepted && !area.modified);

  private readonly readMoreVisible = this.text.map((text) => text.truncated);

  private readonly optionsMenu = this.area.map<ButtonMenuItem[]>((area) => [
    { label: 'UPDATE', action: () => this.props.atcService.requestAtis(this.props.index) },
    {
      label: area.autoUpdate ? 'CANCEL AUTO UPDATE' : 'AUTO UPDATE',
      action: () => this.props.atcService.toggleAtisAutoUpdate(this.props.index),
    },
    { label: 'PRINT', action: () => this.props.atcService.printAtis(this.props.index) },
    {
      label: area.autoPrint ? 'CANCEL AUTO PRINT' : 'AUTO PRINT',
      action: () => this.props.atcService.toggleAtisAutoPrint(this.props.index),
    },
  ]);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.report,
      this.text,
      ...this.lines,
      this.version,
      this.time,
      this.newAtis,
      this.autoUpdate,
      this.autoPrint,
      this.statusLabel,
      this.statusVisible,
      this.requestButtonsVisible,
      this.requestButtonsDisabled,
      this.optionsVisible,
      this.readMoreVisible,
      this.optionsMenu,
      this.area.sub((area: AtisArea) => {
        this.icao.set(area.icao);
        this.typeIndex.set(area.type);
      }),
      // A new ATIS entirely displayed on the list is read: the NEW ATIS symbol goes out (FCOM P 31)
      this.text.sub((text) => {
        if (!text.truncated) {
          this.props.atcService.markAtisRead(this.props.index);
        }
      }, true),
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  render(): VNode {
    const top = this.props.top;
    const row = top + 32;
    const captOrFo = this.props.mfd.uiService.captOrFo;
    return (
      <>
        {fcomAt(
          row,
          5,
          <InputField<string>
            dataEntryFormat={new AirportFormat()}
            value={this.icao}
            dataHandlerDuringValidation={async (icao) => this.props.atcService.setAtisAirport(this.props.index, icao)}
            containerStyle="width: 105px;"
            alignText="center"
            errorHandler={(e) => this.props.atcService.showAtcErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(
          row,
          116,
          <DropdownMenu
            idPrefix={`${captOrFo}_MFD_atisTypeList_${this.props.index}`}
            selectedIndex={this.typeIndex}
            values={ArraySubject.create(['DEP', 'ARR'])}
            freeTextAllowed={false}
            onModified={(index) => {
              if (index === null || !this.props.atcService.setAtisType(this.props.index, index)) {
                this.typeIndex.set(this.area.get().type);
              }
            }}
            containerStyle="width: 106px;"
            alignLabels="center"
            numberOfDigitsForInputField={3}
            tmpyActive={Subject.create(false)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(row, 232, <span class="mfd-atccom-atis-small">{this.version}</span>)}
        {fcomAt(row, 262, <span class="mfd-atccom-atis-small">{this.time}</span>)}
        {fcomAt(row, 343, <NewAtisIcon visible={this.newAtis} />)}
        {fcomAt(row, 388, <AutoUpdateIcon visible={this.autoUpdate} />)}
        {fcomAt(row, 432, <AutoPrintIcon visible={this.autoPrint} />)}
        {fcomAt(
          row,
          472,
          <Button
            label={this.statusLabel}
            visible={this.statusVisible}
            onClick={() => {}}
            buttonStyle="width: 131px; height: 53px;"
          />,
        )}
        {fcomAt(
          row,
          606,
          <Button
            label="OPTIONS"
            visible={this.optionsVisible}
            showArrow={true}
            menuItems={this.optionsMenu}
            idPrefix={`${captOrFo}_MFD_atisOptions_${this.props.index}`}
            dropdownMenuRightAligned={true}
            onClick={() => {}}
            buttonStyle="width: 157px; height: 53px;"
          />,
        )}
        {fcomAt(
          top + 36,
          606,
          <Button
            label={'SEND\nREQUEST'}
            visible={this.requestButtonsVisible}
            disabled={this.requestButtonsDisabled}
            onClick={() => this.props.atcService.requestAtis(this.props.index)}
            buttonStyle="width: 157px; height: 58px;"
          />,
        )}
        {fcomAt(
          top + 97,
          606,
          <Button
            label={'AUTO\nUPDATE'}
            visible={this.requestButtonsVisible}
            disabled={this.requestButtonsDisabled}
            onClick={() => this.props.atcService.toggleAtisAutoUpdate(this.props.index)}
            buttonStyle="width: 157px; height: 57px;"
          />,
        )}
        {this.lines.map((line, i) => fcomAt(top + 75 + i * 33.75, 3, <span class="mfd-atccom-atis-line">{line}</span>))}
        {fcomAt(
          top + 75 + 4 * 33.75,
          657,
          <Button
            label=">>>"
            visible={this.readMoreVisible}
            onClick={() => this.props.mfd.uiService.navigateTo(`atccom/atis/received/${this.props.index}`)}
            buttonStyle="width: 61px; height: 24px; padding: 0;"
          />,
        )}
      </>
    );
  }
}
