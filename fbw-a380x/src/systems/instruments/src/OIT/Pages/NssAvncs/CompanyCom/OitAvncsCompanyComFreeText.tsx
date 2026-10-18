//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import {
  CompanyComRequestStatus,
  FREE_TEXT_LINES,
  FREE_TEXT_LINE_LENGTH,
  freeTextMessage,
} from '../../../System/CompanyComRequests';

interface OitAvncsCompanyComFreeTextProps extends AbstractOitAvncsPageProps {}

/** Maximum characters of a station callsign */
const STATION_LENGTH = 8;

/**
 * COMPANY COM > Reports > Free Text: a free text to a station, sent through the AOC (the layout is an operator choice,
 * see CompanyComRequests).
 */
export class OitAvncsCompanyComFreeText extends DestroyableComponent<OitAvncsCompanyComFreeTextProps> {
  private readonly requests = this.props.container.ansu.companyComRequests;

  private readonly station = Subject.create<string | null>(null);

  private readonly lines = Array.from({ length: FREE_TEXT_LINES }, () => Subject.create<string | null>(null));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(
      // a sent text leaves the page, ready for the next one
      this.requests.freeTextStatus.sub((status) => {
        if (status === CompanyComRequestStatus.Sent) {
          this.lines.forEach((line) => line.set(null));
        }
      }),
    );
  }

  private send(): void {
    this.requests.sendFreeText(
      freeTextMessage(
        this.station.get(),
        this.lines.map((line) => line.get()),
      ),
    );
  }

  render(): VNode {
    return (
      <>
        <div class="oit-ccom-headline">Free Text</div>
        <div class="oit-labeled-box-container">
          <span class="oit-labeled-box-label">To</span>
          <div style="display: flex; flex-direction: row; justify-content: flex-start; padding: 15px;">
            <InputField<string>
              dataEntryFormat={new FreeTextFormat(STATION_LENGTH)}
              value={this.station}
              containerStyle="width: 220px;"
              alignText="flex-start"
              canBeCleared={true}
              hEventConsumer={this.props.container.hEventConsumer}
              interactionMode={this.props.container.interactionMode}
              errorHandler={() => {}}
            />
          </div>
        </div>
        <div class="oit-labeled-box-container">
          <span class="oit-labeled-box-label">Text</span>
          <div style="display: flex; flex-direction: column; padding: 15px; gap: 8px;">
            {this.lines.map((line) => (
              <InputField<string>
                dataEntryFormat={new FreeTextFormat(FREE_TEXT_LINE_LENGTH)}
                value={line}
                containerStyle="width: 520px;"
                alignText="flex-start"
                canBeCleared={true}
                hEventConsumer={this.props.container.hEventConsumer}
                interactionMode={this.props.container.interactionMode}
                errorHandler={() => {}}
              />
            ))}
          </div>
        </div>
        <div style="display: flex; flex-direction: row; justify-content: flex-end; align-items: center; margin: 0px 20px;">
          <div class="oit-green-text" style="margin-right: 25px;">
            {this.requests.freeTextStatus}
          </div>
          <Button label="SEND" onClick={() => this.send()} />
        </div>
        <div style="flex-grow: 1" />
      </>
    );
  }
}
