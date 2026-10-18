//  Copyright (c) 2025-2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AnsuOps } from '../../../System/AnsuOps';
import { CompanyComInboxEntry } from '../../../System/CompanyComMailbox';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';

interface OitAvncsCompanyComInboxProps extends AbstractOitAvncsPageProps {}

/**
 * The texts of the message details area for the selected inbox message.
 * @param entry the selected message, null when none is selected
 * @param messageCount the number of messages in the inbox
 * @returns the details texts
 */
function inboxDetailsTexts(
  entry: CompanyComInboxEntry | null,
  messageCount: number,
): { status: string; from: string; subject: string; text: string; receivedAt: number | null } {
  if (entry === null) {
    return {
      status: '',
      from: '',
      subject: '',
      text: messageCount === 0 ? 'No message' : 'Select a message',
      receivedAt: null,
    };
  }
  return {
    status: entry.read ? 'Message is read' : 'Message is not read',
    from: `From : ${entry.from || '<unknown>'}`,
    subject: `Subject : ${entry.subject}`,
    text: entry.text,
    receivedAt: entry.receivedAt,
  };
}

/**
 * The COMPANY COM inbox: the AOC uplink messages, newest first. Clicking a message displays it and marks it read; the
 * COMPANY MSG memo goes when every message is read.
 */
export class OitAvncsCompanyComInbox extends DestroyableComponent<OitAvncsCompanyComInboxProps> {
  private readonly sci = this.props.container.ansu.sci;

  private readonly mailbox = this.props.container.ansu.companyCom;

  private readonly messageContainerRef = FSComponent.createRef<HTMLDivElement>();

  /** The AOC id of the displayed message */
  private readonly selectedUid = Subject.create<number | null>(null);

  private lines: { uid: number; line: OitAvncsCompanyComMessageLine; selected: Subject<boolean> }[] = [];

  private readonly toText = this.sci.fltNumber.map((fltNumber) => (fltNumber ? `To : ${fltNumber}` : 'To : <unknown>'));
  private readonly statusText = Subject.create('');
  private readonly fromText = Subject.create('');
  private readonly subjectText = Subject.create('');
  private readonly dateText = Subject.create('');
  private readonly messageText = Subject.create('');

  /** PRINT needs a displayed message */
  private readonly printDisabled = this.selectedUid.map((uid) => uid === null);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(
      this.toText,
      this.printDisabled,
      this.mailbox.messages.sub(() => this.refresh(), true),
      this.selectedUid.sub((selectedUid) => {
        this.lines.forEach((l) => l.selected.set(l.uid === selectedUid));
        this.refreshDetails();
      }),
    );
  }

  destroy(): void {
    this.destroyLines();
    super.destroy();
  }

  /**
   * Displays a message, which marks it read.
   * @param uid the AOC message id
   */
  private select(uid: number): void {
    this.selectedUid.set(uid);
    this.mailbox.markRead(uid);
  }

  /** PRINT: the displayed message on the pedestal printer (CompanyComMailbox.printMessage) */
  private printSelected(): void {
    const uid = this.selectedUid.get();
    if (uid !== null) {
      this.mailbox.printMessage(uid, AnsuOps.formatDateTime);
    }
  }

  private selectedEntry(): CompanyComInboxEntry | null {
    const uid = this.selectedUid.get();
    return this.mailbox.messages.getArray().find((m) => m.uid === uid) ?? null;
  }

  /** Rebuilds the message list, then the details */
  private refresh(): void {
    const container = this.messageContainerRef.getOrDefault();
    if (!container) {
      return;
    }

    this.destroyLines();
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // The displayed message was deleted by the AOC
    if (this.selectedUid.get() !== null && this.selectedEntry() === null) {
      this.selectedUid.set(null);
    }

    for (const message of this.mailbox.messages.getArray()) {
      const selected = Subject.create(message.uid === this.selectedUid.get());
      const node = (
        <OitAvncsCompanyComMessageLine
          date={message.receivedAt}
          subject={message.subject}
          read={Subject.create(message.read)}
          selected={selected}
          onClick={() => this.select(message.uid)}
        />
      );
      FSComponent.render(node, container);
      this.lines.push({ uid: message.uid, line: node.instance as OitAvncsCompanyComMessageLine, selected });
    }

    this.refreshDetails();
  }

  private refreshDetails(): void {
    const texts = inboxDetailsTexts(this.selectedEntry(), this.mailbox.messages.length);
    this.statusText.set(texts.status);
    this.fromText.set(texts.from);
    this.subjectText.set(texts.subject);
    this.dateText.set(texts.receivedAt === null ? '' : AnsuOps.formatDateTime(texts.receivedAt));
    this.messageText.set(texts.text);
  }

  private destroyLines(): void {
    this.lines.forEach((l) => l.line.destroy());
    this.lines = [];
  }

  render(): VNode {
    return (
      <>
        <div class="oit-ccom-headline">Inbox</div>
        <div class="oit-ccom-inbox-msg-table">
          <div class="fr ass">
            <div class="oit-ccom-inbox-msg-table-header oit-table-ib w5"></div>
            <div class="oit-ccom-inbox-msg-table-header oit-table-ib f1">Subject</div>
            <div class="oit-ccom-inbox-msg-table-header oit-table-ib w15">Date</div>
          </div>
          <div ref={this.messageContainerRef} />
          <div style="flex-grow: 1" />
        </div>
        <div class="oit-ccom-inbox-msg-details">
          <div>{this.statusText}</div>
          <div />
          <div style="text-align: right;">{this.dateText}</div>
          <div>{this.fromText}</div>
          <div>{this.subjectText}</div>
          <div>{this.toText}</div>
        </div>
        <div class="oit-ccom-inbox-msg-box">{this.messageText}</div>
        {/* Manual print of a message (A380 FCOM DSC-46-40-10-20, a380_fcom.txt l.107938-107939). Design choice: below the
            message, the FCOM has no figure of the inbox page */}
        <div class="fr" style="justify-content: flex-end; margin-top: 10px;">
          <Button label="PRINT" disabled={this.printDisabled} onClick={() => this.printSelected()} />
        </div>
        <div style="flex-grow: 1" />
      </>
    );
  }
}

interface OitAvncsCompanyComMessageLineProps {
  readonly read: Subscribable<boolean>;
  readonly subject: string;
  /** The reception time, ms since the epoch (UTC), null when unknown */
  readonly date: number | null;
  readonly selected: Subscribable<boolean>;
  readonly onClick?: () => void;
}

/** One line of the inbox: unread mark, subject, reception time */
export class OitAvncsCompanyComMessageLine extends DestroyableComponent<OitAvncsCompanyComMessageLineProps> {
  private readonly refs = [
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
  ];

  private readonly onClickHandler = () => this.props.onClick?.();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    if (this.props.onClick) {
      for (const ref of this.refs) {
        ref.instance.addEventListener('click', this.onClickHandler);
      }
    }
  }

  destroy(): void {
    for (const ref of this.refs) {
      ref.getOrDefault()?.removeEventListener('click', this.onClickHandler);
    }
    super.destroy();
  }

  render(): VNode {
    return (
      <div class="fr ass">
        <div
          ref={this.refs[0]}
          class={{ 'oit-ccom-inbox-msg-table-line': true, tc: true, w5: true, selected: this.props.selected }}
        >
          {this.props.read.map((read) => (read ? '' : '✉️'))}
        </div>
        <div
          ref={this.refs[1]}
          class={{
            'oit-ccom-inbox-msg-table-line': true,
            'oit-green-text': true,
            f1: true,
            selected: this.props.selected,
          }}
        >
          {this.props.subject}
        </div>
        <div
          ref={this.refs[2]}
          class={{
            'oit-ccom-inbox-msg-table-line': true,
            'oit-green-text': true,
            w15: true,
            selected: this.props.selected,
          }}
        >
          {AnsuOps.formatDateTime(this.props.date)}
        </div>
      </div>
    );
  }
}
