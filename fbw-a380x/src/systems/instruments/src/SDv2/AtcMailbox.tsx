//  Copyright (c) 2024-2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  NodeReference,
  Subject,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { AtcFmsMessages, FmsAtcMessages } from '@datalink/atc';
import {
  AtsuMailboxMessages,
  AtsuMessageComStatus,
  AtsuMessageDirection,
  AtsuMessageType,
  Conversion,
  CpdlcMessage,
  CpdlcMessageMonitoringState,
  MailboxStatusMessage,
  UplinkMonitor,
} from '@datalink/common';
import { Button } from '../MsfsAvionicsCommon/UiWidgets/Button';
import { MouseCursor } from '../MsfsAvionicsCommon/UiWidgets/MouseCursor';
import {
  buildResponse,
  DUE_TO_REASONS,
  informationText,
  isPreparedResponse,
  MAILBOX_PAGE_LINES,
  MailboxAction,
  MailboxBlock,
  mailboxButtons,
  MailboxLine,
  mailboxLines,
  mailboxMessageStyle,
  mailboxStatus,
  pageCount,
  responseOf,
} from './Mailbox/MailboxLogic';

import './style.scss';

export interface AtcMailboxProps {
  readonly bus: EventBus;
}

/** The ADS status that the MFD CONNECTION STATUS page sets: 0 ARMED, 1 CONNECTED, 2 OFF */
const ADS_STATUS_VAR = 'L:A380X_ATCCOM_ADS_STATUS';

/** The information of the system (e.g. PRINTING) is displayed for 5 s */
const SYSTEM_STATUS_DURATION = 5000;

/** The communication buttons, from the FCOM figure (mailbox coordinates, 768 x 256) */
const BUTTON_TOPS = [3.3, 54.3, 105.2, 156.5, 207.2];

/** The message lines: centres, below the time / origin line (FCOM figure) */
const LINE_Y = [56.4, 92.9, 129.9, 167, 202.2];

/**
 * The ATC mailbox on the lower part of the SD (A380 FCOM DSC-46-10-10-70, DSC-46-10-20-60), laid out on the FCOM
 * figures: the connection indications when no message is displayed; else the displayed message of the mailbox queue with
 * its time, origin / destination and status, its pages, the previous / next message buttons and RECALL on the left, the
 * communication buttons on the right, and the Information Messages Area below. A client of the mailbox of the ATC
 * function (the same mailbox bus as the A32NX DCDU).
 */
export class AtcMailbox extends DisplayComponent<AtcMailboxProps> {
  private readonly subs = [] as Subscription[];

  private readonly topRef = FSComponent.createRef<HTMLDivElement>();

  private readonly mouseCursorRef = FSComponent.createRef<MouseCursor>();

  private readonly publisher = this.props.bus.getPublisher<AtsuMailboxMessages & FmsAtcMessages>();

  /** The requests of the flight crew by transmission id: their time, and whether they are clearance requests */
  private readonly requests = new Map<number, { time: string; clearance: boolean }>();

  /** The justifications of the DUE TO button */
  private readonly dueToMenuOpen = Subject.create(false);

  private readonly sub = this.props.bus.getSubscriber<AtsuMailboxMessages & AtcFmsMessages>();

  /** The mailbox queue, in the order of arrival */
  private readonly blocks = Subject.create<MailboxBlock[]>([]);

  private readonly visibleUid = Subject.create<number | null>(null);

  private arrivals = 0;

  private readonly systemStatus = Subject.create(MailboxStatusMessage.NoMessage);

  private systemStatusTimer: number | null = null;

  private readonly activeAtc = Subject.create('');

  private readonly adsStatus = Subject.create(0);

  private adsPoll: number | null = null;

  private readonly visibleBlock = MappedSubject.create(
    ([blocks, uid]) => blocks.find((block) => block.uid === uid) ?? null,
    this.blocks,
    this.visibleUid,
  );

  private readonly visibleIndex = MappedSubject.create(
    ([blocks, uid]) => blocks.findIndex((block) => block.uid === uid),
    this.blocks,
    this.visibleUid,
  );

  private readonly lines = this.visibleBlock.map((block) => (block ? mailboxLines(block) : []));

  private readonly buttons = this.visibleBlock.map((block) => (block ? mailboxButtons(block) : null));

  private onMouseMove(ev: MouseEvent) {
    this.mouseCursorRef.getOrDefault()?.updatePosition(ev.clientX, ev.clientY - 768);
  }

  private onMouseMoveHandler = this.onMouseMove.bind(this);

  /** Work to do once the elements exist */
  private readonly afterRender: (() => void)[] = [];

  /** The clickable elements and their handlers, attached after rendering */
  private readonly listeners: [NodeReference<HTMLElement>, () => void][] = [];

  private clickable(handler: () => void): NodeReference<HTMLDivElement> {
    const ref = FSComponent.createRef<HTMLDivElement>();
    this.listeners.push([ref, handler]);
    return ref;
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.topRef.instance.addEventListener('mousemove', this.onMouseMoveHandler);
    this.listeners.forEach(([ref, handler]) => ref.instance.addEventListener('click', handler));
    this.afterRender.forEach((work) => work());

    this.subs.push(
      this.visibleBlock,
      this.visibleIndex,
      this.lines,
      this.buttons,
      this.sub.on('resetSystem').handle(() => {
        this.blocks.set([]);
        this.visibleUid.set(null);
        this.setSystemStatus(MailboxStatusMessage.NoMessage);
      }),
      this.sub.on('cpdlcMessages').handle((messages) => this.onMessages(messages)),
      this.sub.on('dclMessages').handle((messages) => this.onMessages(messages)),
      this.sub.on('oclMessages').handle((messages) => this.onMessages(messages)),
      this.sub.on('deleteMessage').handle((uid) => this.removeBlock(uid)),
      this.sub.on('systemStatus').handle((status) => this.setSystemStatus(status)),
      this.sub
        .on('messageStatus')
        .handle((data) => this.updateBlock(data.uid, (block) => (block.status = data.status))),
      this.sub.on('atcStationStatus').handle((status) => this.activeAtc.set(status.current)),
    );

    this.adsPoll = window.setInterval(
      () => this.adsStatus.set(SimVar.GetSimVarValue(ADS_STATUS_VAR, 'number') ?? 0),
      1000,
    );
  }

  destroy(): void {
    this.topRef.getOrDefault()?.removeEventListener('mousemove', this.onMouseMoveHandler);
    this.listeners.forEach(([ref, handler]) => ref.getOrDefault()?.removeEventListener('click', handler));
    this.mouseCursorRef.getOrDefault()?.destroy();
    if (this.adsPoll !== null) {
      window.clearInterval(this.adsPoll);
    }
    if (this.systemStatusTimer !== null) {
      window.clearTimeout(this.systemStatusTimer);
    }
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  private setSystemStatus(status: MailboxStatusMessage): void {
    this.systemStatus.set(status);
    if (this.systemStatusTimer !== null) {
      window.clearTimeout(this.systemStatusTimer);
      this.systemStatusTimer = null;
    }
    if (status !== MailboxStatusMessage.NoMessage) {
      this.systemStatusTimer = window.setTimeout(() => {
        this.systemStatus.set(MailboxStatusMessage.NoMessage);
        this.systemStatusTimer = null;
      }, SYSTEM_STATUS_DURATION);
    }
  }

  private updateBlock(uid: number, update: (block: MailboxBlock) => void): void {
    const blocks = this.blocks.get().map((block) => {
      if (block.uid !== uid) {
        return block;
      }
      const copy = { ...block };
      update(copy);
      return copy;
    });
    this.blocks.set(blocks);
  }

  private show(uid: number | null): void {
    this.visibleUid.set(uid);
    this.publisher.pub('visibleMessage', uid ?? -1, true, false);
    if (uid !== null) {
      this.publisher.pub('readMessage', uid, true, false);
    }
  }

  /**
   * A message of the ATC function for the mailbox: a new message of the queue, or the update of a message
   * @param data the messages shown together, as received on the bus
   */
  private onMessages(data: CpdlcMessage[]): void {
    const messages = data.map((message) => Conversion.messageDataToMessage(message) as CpdlcMessage);
    if (messages.length === 0) {
      return;
    }
    const uid = messages[0].UniqueMessageID;
    const monitoring = messages[0].MessageMonitoring;
    // The requests of the flight crew, for the "(REPLY TO hhmmZ REQ:)" line of their replies
    for (const message of messages) {
      if (message.Direction === AtsuMessageDirection.Downlink && message.CurrentTransmissionId >= 0) {
        this.requests.set(message.CurrentTransmissionId, {
          time: message.Timestamp.mailboxTimestamp(),
          clearance: message.Type === AtsuMessageType.DCL || message.Type === AtsuMessageType.OCL,
        });
      }
    }
    const existing = this.blocks.get().find((block) => block.uid === uid);
    if (existing) {
      this.updateBlock(uid, (block) => {
        block.messages = messages;
        // The response is sent: no response prepared any more
        if (messages[0].Response && messages[0].Response.ComStatus !== undefined && block.response !== -1) {
          if (messages[0].Response.Content[0]?.TypeId === `DM${block.response}`) {
            block.response = -1;
          }
        }
        // The modified message is back from the MFD
        if (block.status === MailboxStatusMessage.FmsDisplayForModification) {
          block.status = MailboxStatusMessage.NoMessage;
        }
        if (monitoring === CpdlcMessageMonitoringState.Monitoring) {
          block.status = MailboxStatusMessage.Monitoring;
        } else if (monitoring === CpdlcMessageMonitoringState.Cancelled) {
          block.status = MailboxStatusMessage.MonitoringCancelled;
        } else if (block.status === MailboxStatusMessage.Monitoring) {
          block.status = MailboxStatusMessage.NoMessage;
        }
      });
    } else {
      const block: MailboxBlock = {
        uid,
        messages,
        arrival: this.arrivals++,
        response: -1,
        status:
          monitoring === CpdlcMessageMonitoringState.Monitoring
            ? MailboxStatusMessage.Monitoring
            : MailboxStatusMessage.NoMessage,
        page: 0,
        lastPageSeen: 0,
        dueTo: null,
        replyTo:
          messages[0].Direction === AtsuMessageDirection.Uplink
            ? this.requests.get(messages[0].PreviousTransmissionId) ?? null
            : null,
      };
      this.blocks.set([...this.blocks.get(), block]);
      // A new message appears when the mailbox shows no message, or when it is urgent (FCOM PRO How to read)
      if (this.visibleUid.get() === null || messages[0].Content[0]?.Urgent) {
        this.show(uid);
      }
    }
  }

  /**
   * Removes a message from the queue and displays the previous, or else the next one
   * @param uid the unique id of the message
   */
  private removeBlock(uid: number): void {
    const blocks = this.blocks.get();
    const index = blocks.findIndex((block) => block.uid === uid);
    if (index === -1) {
      return;
    }
    const remaining = blocks.filter((block) => block.uid !== uid);
    this.blocks.set(remaining);
    if (this.visibleUid.get() === uid) {
      const next = remaining[Math.max(0, index - 1)] ?? null;
      this.show(next ? next.uid : null);
    }
  }

  private showRelative(offset: number): void {
    const blocks = this.blocks.get();
    const index = this.visibleIndex.get() + offset;
    if (index >= 0 && index < blocks.length) {
      this.show(blocks[index].uid);
    }
  }

  private turnPage(offset: number): void {
    const block = this.visibleBlock.get();
    if (!block) {
      return;
    }
    const page = Math.max(0, Math.min(pageCount(block) - 1, block.page + offset));
    this.updateBlock(block.uid, (b) => {
      b.page = page;
      b.lastPageSeen = Math.max(b.lastPageSeen, page);
    });
  }

  private onButton(index: number): void {
    const block = this.visibleBlock.get();
    const button = this.buttons.get()?.[index];
    if (!block || !button || !button.enabled) {
      return;
    }
    const message = block.messages[0];
    const uid = block.uid;
    const monitored = message.Direction === AtsuMessageDirection.Uplink && UplinkMonitor.relevantMessage(message);
    const action: MailboxAction = button.action;
    const responseId = responseOf(action);
    this.dueToMenuOpen.set(false);
    if (responseId !== -1) {
      // WILCO, ROGER, AFFIRM, ACK...: prepares the response, sent with SEND
      this.updateBlock(uid, (b) => {
        b.response = responseId;
        b.dueTo = null;
      });
      if (monitored && (responseId === 0 || responseId === 3 || responseId === 4)) {
        this.publisher.pub('updateMessageMonitoring', uid, true, false);
      }
      return;
    }
    switch (action) {
      case 'SEND':
        if (message.Direction === AtsuMessageDirection.Downlink || message.SemanticResponseRequired) {
          this.publisher.pub('downlinkTransmit', uid, true, false);
        } else if (block.dueTo !== null && block.response !== -1) {
          // The response with its justification: in the message, then sent as it is
          this.updateMessage(message, buildResponse(message, block.response, block.dueTo));
          this.publisher.pub('downlinkTransmit', uid, true, false);
          this.updateBlock(uid, (b) => {
            b.response = -1;
            b.dueTo = null;
          });
        } else if (block.response === -1 && isPreparedResponse(message)) {
          // The response prepared on the MFD (FREETEXT)
          this.publisher.pub('downlinkTransmit', uid, true, false);
        } else {
          this.publisher.pub('uplinkResponse', { uid, responseId: block.response }, true, false);
        }
        break;
      case 'CANCEL':
        if (message.Direction === AtsuMessageDirection.Downlink) {
          // Removes the prepared downlink message from the mailbox
          this.publisher.pub('deleteMessage', uid, true, false);
          this.removeBlock(uid);
        } else {
          if (monitored) {
            this.publisher.pub('stopMessageMonitoring', uid, true, false);
          }
          // Cancels the selected reply, or the reply prepared in the message
          if (isPreparedResponse(message)) {
            this.updateMessage(message, null);
          }
          this.updateBlock(uid, (b) => {
            b.response = -1;
            b.dueTo = null;
          });
        }
        break;
      case 'DUE TO':
        this.dueToMenuOpen.set(true);
        break;
      case 'FREETEXT': {
        // The response goes to the REPORT/MODIFY page of the MFD, where the flight crew adds the freetext (ADD FREETEXT)
        const response =
          block.response !== -1 ? buildResponse(message, block.response, block.dueTo) : message.Response ?? null;
        if (response) {
          this.updateMessage(message, response);
          this.publisher.pub('modifyMessage', uid, true, false);
          this.updateBlock(uid, (b) => {
            b.response = -1;
            b.dueTo = null;
            b.status = MailboxStatusMessage.FmsDisplayForModification;
          });
        }
        break;
      }
      case 'REFRESH':
        // The ATC function updates the FMS data of the response
        this.publisher.pub('updateMessageMonitoring', uid, true, false);
        break;
      case 'MODIFY':
        // The REPORT/MODIFY page of the MFD (MFD FOR MODIF until the modified message comes back)
        this.publisher.pub('modifyMessage', uid, true, false);
        this.updateBlock(uid, (b) => (b.status = MailboxStatusMessage.FmsDisplayForModification));
        break;
      case 'CLOSE':
        // The message goes to the MSG RECORD page
        this.publisher.pub('closeMessage', uid, true, false);
        this.removeBlock(uid);
        break;
      case 'PRINT':
        // No cockpit printer
        this.printNotAvail.set(true);
        window.setTimeout(() => this.printNotAvail.set(false), SYSTEM_STATUS_DURATION);
        break;
      default:
        break;
    }
  }

  /**
   * Gives the ATC function the message with a response prepared by the flight crew, or without response (CANCEL)
   * @param message the uplink message
   * @param response the response, or null
   */
  private updateMessage(message: CpdlcMessage, response: CpdlcMessage | null): void {
    const updated = Conversion.messageDataToMessage(message) as CpdlcMessage;
    // CpdlcMessage.Response is null without a response (its class is not strict and types it without null)
    updated.Response = response as CpdlcMessage;
    this.publisher.pub('atcUpdateMessage', updated, true, false);
  }

  private selectDueTo(reason: string): void {
    this.dueToMenuOpen.set(false);
    const block = this.visibleBlock.get();
    if (block) {
      this.updateBlock(block.uid, (b) => (b.dueTo = reason));
    }
  }

  /** PRINT NOT AVAIL: printing requested from the mailbox while the printer is not available */
  private readonly printNotAvail = Subject.create(false);

  private renderLine(index: number): VNode {
    // The segments are colored spans: the line is filled by hand when it changes
    const ref = FSComponent.createRef<HTMLDivElement>();
    const line = MappedSubject.create(
      ([lines, block]) => ({
        segments: block ? lines[block.page * MAILBOX_PAGE_LINES + index] ?? null : null,
        style: block ? mailboxMessageStyle(block) : 'uplink',
      }),
      this.lines,
      this.visibleBlock,
    );
    this.subs.push(
      line,
      line.sub(({ segments, style }) => this.fillLine(ref, segments, style)),
    );
    this.afterRender.push(() => this.fillLine(ref, line.get().segments, line.get().style));
    return <div ref={ref} class="atc-mailbox-line" style={`top: ${LINE_Y[index]}px;`} />;
  }

  private fillLine(ref: NodeReference<HTMLDivElement>, line: MailboxLine | null, style: string): void {
    const element = ref.getOrDefault();
    if (!element) {
      return;
    }
    element.innerHTML = '';
    element.className = `atc-mailbox-line ${style}`;
    for (const segment of line ?? []) {
      const span = document.createElement('span');
      span.className = segment.kind;
      span.textContent = segment.text;
      element.appendChild(span);
    }
  }

  private renderButton(index: number): VNode {
    const button = this.buttons.map((buttons) => buttons?.[index] ?? null);
    const label = button.map((b) => b?.action ?? '');
    const visibility = button.map((b) => (b ? 'inherit' : 'hidden'));
    const disabled = button.map((b) => !!b && !b.enabled);
    this.subs.push(button, label, visibility, disabled);
    return (
      <div class="atc-mailbox-comm-button" style={{ top: `${BUTTON_TOPS[index]}px`, visibility }}>
        <Button
          label={label}
          disabled={disabled}
          onClick={() => this.onButton(index)}
          buttonStyle="width: 147px; height: 48.5px; justify-content: flex-end; padding: 0 10px;"
        />
      </div>
    );
  }

  render(): VNode | null {
    const noMessage = this.visibleBlock.map((block) => (block ? 'hidden' : 'inherit'));
    const withMessage = this.visibleBlock.map((block) => (block ? 'inherit' : 'hidden'));
    const activeAtcText = this.activeAtc.map((atc) => (atc !== '' ? `ACTIVE ATC : ${atc}` : ''));
    const adsText = this.adsStatus.map((status) => (status === 2 ? 'ADS OFF' : ''));
    const header = this.visibleBlock.map((block) => {
      if (!block) {
        return '';
      }
      const message = block.messages[0];
      const uplink = message.Direction === AtsuMessageDirection.Uplink;
      // The time at which the ATC center sends the message, or the flight crew sends it
      const time =
        uplink || message.ComStatus !== AtsuMessageComStatus.Open ? message.Timestamp.mailboxTimestamp() : '';
      return `${time}  ${uplink ? 'FROM' : 'TO'} ${message.Station} CTL`.trim();
    });
    const status = this.visibleBlock.map((block) => (block ? mailboxStatus(block) : null));
    const statusText = status.map((s) => s?.text ?? '');
    const statusClass = status.map((s) => `atc-mailbox-status ${s?.style ?? ''}`);
    const multipleMessages = this.blocks.map((blocks) => (blocks.length > 1 ? 'inherit' : 'hidden'));
    const messageNumber = MappedSubject.create(
      ([blocks, index]) => `${index + 1}/${blocks.length}`,
      this.blocks,
      this.visibleIndex,
    );
    const pages = this.visibleBlock.map((block) => (block ? pageCount(block) : 1));
    const multiplePages = pages.map((count) => (count > 1 ? 'inherit' : 'hidden'));
    const pageNumber = this.visibleBlock.map((block) => (block ? `${block.page + 1}/${pageCount(block)}` : ''));
    const information = MappedSubject.create(
      ([block, print]) => (print ? 'PRINT NOT AVAIL' : block ? informationText(block.status) : ''),
      this.visibleBlock,
      this.printNotAvail,
    );
    const systemInformation = this.systemStatus.map((s) => informationText(s));
    this.subs.push(
      noMessage,
      withMessage,
      activeAtcText,
      adsText,
      header,
      status,
      statusText,
      statusClass,
      multipleMessages,
      messageNumber,
      pages,
      multiplePages,
      pageNumber,
      information,
      systemInformation,
    );

    return (
      <div ref={this.topRef} class="atc-mailbox-top-layout">
        {/* The separators of the columns and of the Information Messages Area (FCOM figure) */}
        <div class="atc-mailbox-vline" style="left: 100px; top: 0; height: 256px;" />
        <div class="atc-mailbox-vline" style="left: 615px; top: 0; height: 256px;" />
        <div class="atc-mailbox-hline" style="left: 100px; top: 222px; width: 515px;" />
        <div class="atc-mailbox-vline" style="left: 361px; top: 222px; height: 34px;" />

        {/* Connection indications, when no message is displayed */}
        <div style={{ visibility: noMessage }}>
          <div class="atc-mailbox-connection" style="left: 132px; top: 62px;">
            {activeAtcText}
          </div>
          <div class="atc-mailbox-connection right" style="right: 180px; top: 185px;">
            {adsText}
          </div>
        </div>

        {/* The displayed message */}
        <div style={{ visibility: withMessage }}>
          <div class="atc-mailbox-header" style="left: 108px; top: 17px;">
            {header}
          </div>
          <div class={statusClass} style="right: 191px; top: 17px;">
            {statusText}
          </div>
          {LINE_Y.map((_, i) => this.renderLine(i))}
          <div style={{ visibility: multiplePages }}>
            <div
              ref={this.clickable(() => this.turnPage(-1))}
              class="atc-mailbox-page-button"
              style="left: 534px; top: 43.5px;"
            >
              <svg width="40" height="30" viewBox="0 0 40 30">
                <polygon points="20,0 38,13 2,13" fill="white" />
                <polygon points="20,15 38,28 2,28" fill="white" />
              </svg>
            </div>
            <div
              ref={this.clickable(() => this.turnPage(1))}
              class="atc-mailbox-page-button"
              style="left: 534px; top: 90.4px;"
            >
              <svg width="40" height="30" viewBox="0 0 40 30">
                <polygon points="2,2 38,2 20,15" fill="white" />
                <polygon points="2,17 38,17 20,30" fill="white" />
              </svg>
            </div>
            <div class="atc-mailbox-small" style="left: 573px; top: 171px;">
              PGE
            </div>
            <div class="atc-mailbox-small" style="left: 573px; top: 206px;">
              {pageNumber}
            </div>
          </div>
        </div>

        {/* Messages display management */}
        <div style={{ visibility: multipleMessages }}>
          <div ref={this.clickable(() => this.showRelative(-1))} class="atc-mailbox-msg-button" style="top: 3.3px;">
            <svg width="60" height="36" viewBox="0 0 60 36">
              <polygon points="30,2 58,34 2,34" fill="white" />
            </svg>
          </div>
          <div class="atc-mailbox-small" style="left: 48px; top: 90px;">
            MSG
          </div>
          <div class="atc-mailbox-small" style="left: 48px; top: 114px;">
            {messageNumber}
          </div>
          <div ref={this.clickable(() => this.showRelative(1))} class="atc-mailbox-msg-button" style="top: 153.4px;">
            <svg width="60" height="36" viewBox="0 0 60 36">
              <polygon points="2,2 58,2 30,34" fill="white" />
            </svg>
          </div>
        </div>
        <div class="atc-mailbox-recall">
          <Button
            label="RECALL"
            onClick={() => this.publisher.pub('recallMessage', true, true, false)}
            buttonStyle="width: 92px; height: 49.5px; padding: 0 4px;"
          />
        </div>

        {/* Communication buttons */}
        {BUTTON_TOPS.map((_, i) => this.renderButton(i))}

        {/* The justifications of the DUE TO button, on the left of the communication buttons */}
        <div
          class="atc-mailbox-due-to-menu"
          style={{ display: this.dueToMenuOpen.map((open) => (open ? 'block' : 'none')) }}
        >
          {Object.keys(DUE_TO_REASONS).map((reason) => (
            <div ref={this.clickable(() => this.selectDueTo(reason))} class="mfd-dropdown-menu-element">
              {DUE_TO_REASONS[reason].label}
            </div>
          ))}
        </div>

        {/* Information Messages Area */}
        <div class="atc-mailbox-information" style="left: 230.5px;">
          {information}
        </div>
        <div class="atc-mailbox-information" style="left: 488px;">
          {systemInformation}
        </div>

        <MouseCursor side={Subject.create('CAPT')} ref={this.mouseCursorRef} />
      </div>
    );
  }
}
