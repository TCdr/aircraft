//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AnsuOps } from '../../../System/AnsuOps';
import { CompanyComDownlink, CompanyComDownlinkStatus, downlinkRecipient } from '../../../System/CompanyComDownlinks';
import { OitAvncsCompanyComMessageLine } from './OitAvncsCompanyComInbox';

interface OitAvncsCompanyComDownlinkFolderProps extends AbstractOitAvncsPageProps {
  /** Outbox: the messages not acknowledged by the ground yet; Sent: the acknowledged ones */
  readonly folder: 'outbox' | 'sent';
}

/** The status line of a downlink in the details area */
const STATUS_TEXTS: Readonly<Record<CompanyComDownlinkStatus, string>> = {
  [CompanyComDownlinkStatus.Sending]: 'Message is being sent',
  [CompanyComDownlinkStatus.NotSent]: 'Message is not sent',
  [CompanyComDownlinkStatus.Sent]: 'Message is sent',
};

/**
 * The COMPANY COM Outbox or Sent folder, in the Inbox layout: the downlinks of this OIT, newest first. Clicking a message
 * displays it; PRINT of the menu bar prints it.
 */
export class OitAvncsCompanyComDownlinkFolder extends DestroyableComponent<OitAvncsCompanyComDownlinkFolderProps> {
  private readonly downlinks = this.props.container.ansu.companyComDownlinks;

  private readonly messages: Subscribable<readonly CompanyComDownlink[]> =
    this.props.folder === 'outbox' ? this.downlinks.outbox : this.downlinks.sent;

  private readonly messageContainerRef = FSComponent.createRef<HTMLDivElement>();

  private readonly selectedId = Subject.create<number | null>(null);

  private lines: { id: number; line: OitAvncsCompanyComMessageLine; selected: Subject<boolean> }[] = [];

  private readonly fromText = this.props.container.ansu.sci.fltNumber.map((fltNumber) =>
    fltNumber ? `From : ${fltNumber}` : 'From : <unknown>',
  );
  private readonly statusText = Subject.create('');
  private readonly toText = Subject.create('');
  private readonly subjectText = Subject.create('');
  private readonly dateText = Subject.create('');
  private readonly messageText = Subject.create('');

  /** Design choice: ZOOM shows the displayed message in larger characters; the next ZOOM goes back */
  private readonly zoomed = Subject.create(false);
  private readonly zoomLabel = this.zoomed.map((zoomed) => (zoomed ? 'UNZOOM' : 'ZOOM'));

  private readonly printable = this.selectedId.map((id) => id !== null);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.uiService.registerPageFunctions({
      print: { run: () => this.printSelected(), available: this.printable },
    });

    this.subscriptions.push(
      this.fromText,
      this.printable,
      this.zoomLabel,
      this.messages.sub(() => this.refresh(), true),
      this.selectedId.sub((selectedId) => {
        this.lines.forEach((l) => l.selected.set(l.id === selectedId));
        this.refreshDetails();
      }),
    );
  }

  destroy(): void {
    this.destroyLines();
    super.destroy();
  }

  private printSelected(): void {
    const id = this.selectedId.get();
    if (id !== null) {
      this.downlinks.printDownlink(id, AnsuOps.formatDateTime);
    }
  }

  private selectedEntry(): CompanyComDownlink | null {
    const id = this.selectedId.get();
    return this.messages.get().find((m) => m.id === id) ?? null;
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

    // The displayed message left the folder (sent, or the mailbox was deleted)
    if (this.selectedId.get() !== null && this.selectedEntry() === null) {
      this.selectedId.set(null);
    }

    for (const message of this.messages.get()) {
      const selected = Subject.create(message.id === this.selectedId.get());
      const node = (
        <OitAvncsCompanyComMessageLine
          date={message.sentAt ?? message.createdAt}
          subject={message.to ? `${message.subject} ${message.to}` : message.subject}
          read={Subject.create(true)}
          selected={selected}
          onClick={() => this.selectedId.set(message.id)}
        />
      );
      FSComponent.render(node, container);
      this.lines.push({ id: message.id, line: node.instance as OitAvncsCompanyComMessageLine, selected });
    }

    this.refreshDetails();
  }

  private refreshDetails(): void {
    const entry = this.selectedEntry();
    if (entry === null) {
      this.statusText.set('');
      this.toText.set('');
      this.subjectText.set('');
      this.dateText.set('');
      this.messageText.set(this.messages.get().length === 0 ? 'No message' : 'Select a message');
      return;
    }
    const time = entry.sentAt ?? entry.createdAt;
    this.statusText.set(STATUS_TEXTS[entry.status]);
    this.toText.set(`To : ${downlinkRecipient(entry)}`);
    this.subjectText.set(`Subject : ${entry.subject}`);
    this.dateText.set(time === null ? '' : AnsuOps.formatDateTime(time));
    this.messageText.set(entry.text);
  }

  private destroyLines(): void {
    this.lines.forEach((l) => l.line.destroy());
    this.lines = [];
  }

  render(): VNode {
    return (
      <>
        <div class="oit-ccom-headline">{this.props.folder === 'outbox' ? 'Outbox' : 'Sent'}</div>
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
        <div class={{ 'oit-ccom-inbox-msg-box': true, zoomed: this.zoomed }}>{this.messageText}</div>
        <div style="display: flex; flex-direction: row; justify-content: flex-end; margin: 5px 10px;">
          <Button label={this.zoomLabel} onClick={() => this.zoomed.set(!this.zoomed.get())} />
        </div>
        <div style="flex-grow: 1" />
      </>
    );
  }
}
