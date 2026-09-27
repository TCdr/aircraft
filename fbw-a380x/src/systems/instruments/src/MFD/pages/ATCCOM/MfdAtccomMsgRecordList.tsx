// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, MappedSubject, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import './MfdAtccomMsgRecord.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { ConfirmationDialog } from '../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import { AtccomFooter } from './MfdAtccomFooter';
import { MsgRecordEntry, msgRecordListLine } from '../../ATCCOM/MsgRecord';

/** The messages displayed at a time (FCOM figure: 8 message areas) */
const ROWS = 8;
/** The top of the first message area and the height of a message area, from the FCOM figure */
const ROW_TOP = 12.6;
const ROW_HEIGHT = 91.5;
/** The message line: 39 characters of 17.2 px from x = 9 to the scroll bar */
const LINE_LENGTH = 39;
const SCROLL_TOP = 12.3;
const SCROLL_HEIGHT = 738;

/** The page uri of a recorded message on the MSG RECORD/ZOOM page */
export function msgRecordZoomUri(entry: MsgRecordEntry): string {
  return `atccom/msg-record/zoom/${entry.uid}_${entry.position}`;
}

/**
 * MSG RECORD/LIST page (A380 FCOM DSC-46-10-20-30 P 27-29), laid out on the FCOM figure (page coordinates = display
 * y - 143): the messages exchanged with the ATC centers, most recent first, each with its time, origin / destination,
 * status and first line; a click displays the whole message on the MSG RECORD/ZOOM page. NO STORED MSG when empty, the
 * scroll bar and buttons, ERASE ALL (after confirmation) and PRINT ALL.
 */
export class MfdAtccomMsgRecordList extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly firstRow = Subject.create(0);

  private readonly entries = this.props.atcService.msgRecord;

  private readonly maxFirstRow = this.entries.map((entries) => Math.max(0, entries.length - ROWS));

  private readonly rows = Array.from({ length: ROWS }, (_, i) =>
    MappedSubject.create(([entries, first]) => entries[first + i] ?? null, this.entries, this.firstRow),
  );

  private readonly noStoredMsg = this.entries.map((entries) => entries.length === 0);

  private readonly noStoredMsgDisplay = this.noStoredMsg.map((empty) => (empty ? 'inherit' : 'none'));

  private readonly upDisabled = this.firstRow.map((first) => first === 0);

  private readonly downDisabled = MappedSubject.create(([first, max]) => first >= max, this.firstRow, this.maxFirstRow);

  private readonly scrollThumbStyle = MappedSubject.create(
    ([entries, first]) => {
      const total = Math.max(entries.length, ROWS);
      const height = (SCROLL_HEIGHT - 6) * (ROWS / total);
      const top = (SCROLL_HEIGHT - 6) * (first / total);
      return `top: ${top.toFixed(1)}px; height: ${height.toFixed(1)}px;`;
    },
    this.entries,
    this.firstRow,
  );

  private readonly eraseConfirmationVisible = Subject.create(false);

  private readonly rowRefs = Array.from({ length: ROWS }, () => FSComponent.createRef<HTMLDivElement>());

  private readonly rowClickHandlers = this.rows.map((row) => () => {
    const entry = row.get();
    if (entry) {
      this.props.mfd.uiService.navigateTo(msgRecordZoomUri(entry));
    }
  });

  private scroll(rows: number): void {
    this.firstRow.set(Math.max(0, Math.min(this.maxFirstRow.get(), this.firstRow.get() + rows)));
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.maxFirstRow,
      ...this.rows,
      this.noStoredMsg,
      this.noStoredMsgDisplay,
      this.upDisabled,
      this.downDisabled,
      this.scrollThumbStyle,
      // Keep the scroll position within the list when messages are erased
      this.maxFirstRow.sub((max) => this.firstRow.set(Math.min(this.firstRow.get(), max))),
    );
    this.rowRefs.forEach((ref, i) => ref.instance.addEventListener('click', this.rowClickHandlers[i]));
  }

  public destroy(): void {
    this.rowRefs.forEach((ref, i) => ref.getOrDefault()?.removeEventListener('click', this.rowClickHandlers[i]));
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  private renderRow(i: number): VNode {
    const row = this.rows[i];
    const top = ROW_TOP + i * ROW_HEIGHT;
    const visible = row.map((entry) => (entry ? 'inherit' : 'hidden'));
    const status = row.map((entry) => entry?.status ?? '');
    const statusClass = status.map((s) => (s === 'OPEN' ? 'mfd-msg-record-status amber' : 'mfd-msg-record-status'));
    const statusVisible = status.map((s) => (s === '' ? 'hidden' : 'inherit'));
    this.subs.push(visible, status, statusClass, statusVisible);
    return (
      <div
        ref={this.rowRefs[i]}
        class="mfd-msg-record-row"
        style={{ top: `${top}px`, height: `${ROW_HEIGHT}px`, visibility: visible }}
      >
        {fcomAt(24.6, 9, <span class="mfd-msg-record-header">{row.map((entry) => entry?.time ?? '')}</span>)}
        {fcomAt(
          24.6,
          142,
          <span class="mfd-msg-record-header">
            {row.map((entry) => (entry ? `${entry.direction} ${entry.station} CTL` : ''))}
          </span>,
        )}
        {fcomRight(
          24.6,
          684,
          <span class={statusClass} style={{ visibility: statusVisible }}>
            {status}
          </span>,
        )}
        {fcomAt(
          64.4,
          9,
          <span class="mfd-msg-record-line">
            {row.map((entry) => (entry ? msgRecordListLine(entry.text, LINE_LENGTH) : ''))}
          </span>,
        )}
      </div>
    );
  }

  render(): VNode {
    const captOrFo = this.props.mfd.uiService.captOrFo;
    return (
      <>
        <ActivePageTitleBar activePage={Subject.create(this.props.pageTitle ?? '')} offset={Subject.create('')} />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-msg-record">
            {Array.from({ length: ROWS }, (_, i) => this.renderRow(i))}
            {Array.from({ length: ROWS }, (_, i) => fcomLine(ROW_TOP + (i + 1) * ROW_HEIGHT, 2.5, 687.5))}
            {fcomCentre(
              ROW_TOP + 4.5 * ROW_HEIGHT,
              344,
              <span class="mfd-msg-record-line white" style={{ display: this.noStoredMsgDisplay }}>
                NO STORED MSG
              </span>,
            )}
            <div class="mfd-msg-record-scrollbar" style={`top: ${SCROLL_TOP}px; height: ${SCROLL_HEIGHT}px;`}>
              <div class="mfd-msg-record-scrollbar-thumb" style={this.scrollThumbStyle} />
            </div>
            {fcomAt(
              39.8,
              714,
              <IconButton
                icon="double-up"
                disabled={this.upDisabled}
                onClick={() => this.scroll(-ROWS)}
                containerStyle="width: 43px; height: 43px; padding: 6px;"
              />,
            )}
            {fcomAt(
              85.3,
              714,
              <IconButton
                icon="single-up"
                disabled={this.upDisabled}
                onClick={() => this.scroll(-1)}
                containerStyle="width: 43px; height: 43px; padding: 10px;"
              />,
            )}
            {fcomAt(
              130.2,
              714,
              <IconButton
                icon="single-down"
                disabled={this.downDisabled}
                onClick={() => this.scroll(1)}
                containerStyle="width: 43px; height: 43px; padding: 10px;"
              />,
            )}
            {fcomAt(
              175.1,
              714,
              <IconButton
                icon="double-down"
                disabled={this.downDisabled}
                onClick={() => this.scroll(ROWS)}
                containerStyle="width: 43px; height: 43px; padding: 6px;"
              />,
            )}
            {fcomAt(
              789.5,
              0,
              <Button
                label="ERASE ALL"
                disabled={this.noStoredMsg}
                onClick={() => {
                  if (this.props.atcService.canEraseMsgRecord(captOrFo)) {
                    this.eraseConfirmationVisible.set(true);
                  }
                }}
                buttonStyle="width: 189px; height: 57px;"
              />,
            )}
            {fcomAt(
              789.5,
              578,
              <Button
                label="PRINT ALL"
                disabled={this.noStoredMsg}
                onClick={() => this.props.atcService.print()}
                buttonStyle="width: 189px; height: 57px;"
              />,
            )}
            <div class="mfd-atccom-dialogs">
              <ConfirmationDialog
                visible={this.eraseConfirmationVisible}
                cancelAction={() => this.eraseConfirmationVisible.set(false)}
                confirmAction={() => {
                  this.eraseConfirmationVisible.set(false);
                  if (this.props.atcService.canEraseMsgRecord(captOrFo)) {
                    this.props.atcService.eraseMsgRecord();
                  }
                }}
                contentContainerStyle="width: 360px; height: 165px; transform: translateX(-50%);"
              >
                ERASE ALL ?
              </ConfirmationDialog>
            </div>
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}
