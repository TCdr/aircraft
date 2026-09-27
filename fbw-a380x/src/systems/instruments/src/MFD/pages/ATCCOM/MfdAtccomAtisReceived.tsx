// Copyright (c) 2025-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, MappedSubject, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';
import { AtisType } from '@datalink/common';

import './MfdAtccomAtis.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AtccomFooter } from './MfdAtccomFooter';
import { atisTime, wrapAtisText } from './AtisText';
import { ATCCOMMessages } from '../../shared/NXSystemMessages';

/** Lines of 44 characters, as on the ATIS/LIST page */
const RECEIVED_LINE_LENGTHS = Array.from({ length: 20 }, () => 44);

/**
 * ATIS/RECEIVED page (A380 FCOM DSC-46-10-20-30 P 34): the whole ATIS message of a request area that the ATIS/LIST
 * page cannot entirely display, and RETURN TO LIST. The request area row and the lines as on the ATIS/LIST page. A new
 * ATIS received while the page is displayed shows NEW ATIS RECEIVED (DSC-46-10-20-40 N).
 */
export class MfdAtccomAtisReceived extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly index = Math.max(0, Math.min(2, Number(this.props.mfd.uiService.activeUri.get().extra) || 0));

  private readonly area = this.props.atcService.atisAreas[this.index];

  private readonly report = MappedSubject.create(
    () => this.props.atcService.atisReport(this.index) ?? null,
    this.area,
    this.props.atcService.atisReportsVersion,
  );

  private readonly lines = this.report.map(
    (report) => wrapAtisText(report ? report.Reports[0].report.toUpperCase() : '', RECEIVED_LINE_LENGTHS).lines,
  );

  private readonly header = MappedSubject.create(
    ([area, report]) =>
      `${area.icao ?? '----'}  ${area.type === AtisType.Departure ? 'DEP' : 'ARR'}  ${report?.Information || '-'} ${
        report ? atisTime(report.Reports.map((r) => r.report).join(' ')) : '----'
      }`,
    this.area,
    this.report,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    let shownVersion = this.report.get()?.Information ?? null;
    this.props.atcService.markAtisRead(this.index);

    this.subs.push(
      this.report,
      this.lines,
      this.header,
      this.report.sub((report) => {
        const version = report?.Information ?? null;
        if (version !== shownVersion) {
          shownVersion = version;
          this.props.atcService.addMessageToQueue(ATCCOMMessages.newAtisReceived);
          this.props.atcService.markAtisRead(this.index);
        }
      }),
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  render(): VNode {
    return (
      <>
        <ActivePageTitleBar activePage={Subject.create(this.props.pageTitle ?? '')} offset={Subject.create('')} />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-atis">
            {fcomAt(29, 5, <span class="mfd-atccom-atis-line cyan">{this.header}</span>)}
            {RECEIVED_LINE_LENGTHS.map((_, i) =>
              fcomAt(
                72 + i * 33.75,
                3,
                <span class="mfd-atccom-atis-line">{this.lines.map((lines) => lines[i])}</span>,
              ),
            )}
            {fcomAt(
              784,
              5,
              <Button
                label={'RETURN\nTO LIST'}
                onClick={() => this.props.mfd.uiService.navigateTo('atccom/atis/list')}
                buttonStyle="width: 187px; height: 57px;"
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
