// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, SimVarValueType, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import './MfdAtccomMsgRecord.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomRight } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AtccomFooter } from './MfdAtccomFooter';
import { AtcDatalinkSystem } from '../../ATCCOM/AtcDatalinkSystem';
import { wrapMsgRecordText } from '../../ATCCOM/MsgRecord';

/** The lines of the message: 39 characters, as on the MSG RECORD/LIST page */
const LINE_LENGTH = 39;
const LINES = 19;

/**
 * MSG RECORD/ZOOM page (A380 FCOM DSC-46-10-20-30 P 27): the entire recorded message clicked on the MSG RECORD/LIST
 * page, with its time, origin / destination and status as on the list, RETURN TO LIST and PRINT (FCOM PRO How to
 * store messages). While displayed, the other
 * MFD cannot erase the recorded messages (MSG RECORD USED OFFSIDE).
 */
export class MfdAtccomMsgRecordZoom extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly key = (this.props.mfd.uiService.activeUri.get().extra ?? '').split('_').map(Number);

  private readonly entry = this.props.atcService.msgRecord.map(
    (entries) => entries.find((entry) => entry.uid === this.key[0] && entry.position === this.key[1]) ?? null,
  );

  private readonly lines = this.entry.map((entry) => (entry ? wrapMsgRecordText(entry.text, LINE_LENGTH) : []));

  private readonly status = this.entry.map((entry) => entry?.status ?? '');

  private readonly statusClass = this.status.map((status) =>
    status === 'OPEN' ? 'mfd-msg-record-status amber' : 'mfd-msg-record-status',
  );

  private readonly statusVisible = this.status.map((status) => (status === '' ? 'hidden' : 'inherit'));

  private readonly zoomVar = AtcDatalinkSystem.msgRecordZoomVar(this.props.mfd.uiService.captOrFo);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    SimVar.SetSimVarValue(this.zoomVar, SimVarValueType.Bool, true);
    this.subs.push(this.entry, this.lines, this.status, this.statusClass, this.statusVisible);
  }

  public destroy(): void {
    SimVar.SetSimVarValue(this.zoomVar, SimVarValueType.Bool, false);
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
          <div class="mfd-fcom-canvas mfd-atccom-msg-record">
            {fcomAt(37.2, 9, <span class="mfd-msg-record-header">{this.entry.map((entry) => entry?.time ?? '')}</span>)}
            {fcomAt(
              37.2,
              142,
              <span class="mfd-msg-record-header">
                {this.entry.map((entry) => (entry ? `${entry.direction} ${entry.station} CTL` : ''))}
              </span>,
            )}
            {fcomRight(
              37.2,
              684,
              <span class={this.statusClass} style={{ visibility: this.statusVisible }}>
                {this.status}
              </span>,
            )}
            {Array.from({ length: LINES }, (_, i) =>
              fcomAt(
                77 + i * 34.5,
                9,
                <span class="mfd-msg-record-line">{this.lines.map((lines) => lines[i] ?? '')}</span>,
              ),
            )}
            {fcomAt(
              789.5,
              0,
              <Button
                label={'RETURN\nTO LIST'}
                onClick={() => this.props.mfd.uiService.navigateTo('atccom/msg-record/list')}
                buttonStyle="width: 189px; height: 57px;"
              />,
            )}
            {fcomAt(
              789.5,
              578,
              <Button
                label="PRINT"
                onClick={() => {
                  const entry = this.entry.get();
                  if (entry) {
                    this.props.atcService.printMsgRecordEntry(entry);
                  }
                }}
                buttonStyle="width: 189px; height: 57px;"
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
