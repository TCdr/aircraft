//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { LogbookSendStatus, formatLogbookDate, itemsIn, markListViewed } from '../../../System/TechLogbook';
import { LogbookTable, LogbookTableRow } from './LogbookWidgets';
import { OitAvncsLogbookItemDetail } from './OitAvncsLogbookItemDetail';
import { LOGBOOK_URI } from './LogbookFlows';

interface OitAvncsLogbookOpenItemsProps extends AbstractOitAvncsPageProps {}

export const SEND_STATUS_TEXTS: Record<LogbookSendStatus, string> = {
  'not-sent': 'NOT SENT',
  sending: 'SENDING...',
  sent: 'SENT',
};

/**
 * The OPEN ITEMS page: the defects recorded and not yet deferred or fixed. SEND sends the ticked items to the ground
 * (all ticked at first, then as the crew left them); the title opens the detailed report, where ADDITIONAL INFO can
 * still be changed.
 */
export class OitAvncsLogbookOpenItems extends DestroyableComponent<OitAvncsLogbookOpenItemsProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly items = this.store.state.map((s) => itemsIn(s, 'open'));

  /** What the crew selected stays until the LOGBOOK application closes */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  /** The items NOT ticked: a new item comes ticked */
  private readonly unticked = this.drafts.field<readonly string[]>(LOGBOOK_URI.openItems, 'unticked', []);

  private readonly selectedRef = this.drafts.field<string | null>(LOGBOOK_URI.openItems, 'selectedRef', null);
  private readonly tableHidden = this.selectedRef.map((r) => r !== null);

  private readonly rows = MappedSubject.create(
    ([items, unticked]): LogbookTableRow[] =>
      items.map((item) => ({
        cells: [item.title, formatLogbookDate(item.openDate), SEND_STATUS_TEXTS[item.sendStatus]],
        cellClasses: ['', '', 'oit-logbook-link'],
        linkCell: 0,
        onClick: () => this.selectedRef.set(item.ref),
        ticked: !unticked.includes(item.ref),
        onTick: () => this.toggle(item.ref),
      })),
    this.items,
    this.unticked,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(this.items, this.tableHidden, this.rows);
    this.store.change((s) => markListViewed(s, 'open'));
  }

  private toggle(ref: string): void {
    const unticked = this.unticked.get();
    this.unticked.set(unticked.includes(ref) ? unticked.filter((r) => r !== ref) : [...unticked, ref]);
  }

  private toggleAll(): void {
    const items = this.items.get();
    this.unticked.set(this.unticked.get().length === 0 ? items.map((i) => i.ref) : []);
  }

  private sendTicked(): void {
    const unticked = this.unticked.get();
    this.store.send(
      this.items
        .get()
        .filter((i) => !unticked.includes(i.ref))
        .map((i) => i.ref),
    );
  }

  render(): VNode {
    return (
      <>
        <div class={{ 'oit-logbook-frame': true, hidden: this.tableHidden }}>
          <span class="oit-logbook-frame-title">STATUS / OPEN ITEMS</span>
          <LogbookTable
            columns={[
              { title: 'REPORT', width: '760px' },
              { title: 'OPEN DATE ▼', width: '170px', centered: true },
              { title: 'STATUS', width: '160px', centered: true },
            ]}
            rows={this.rows}
            rowsPerPage={13}
            onTickAll={() => this.toggleAll()}
            extraButtons={<Button label="SEND" onClick={() => this.sendTicked()} containerStyle="margin-left: 10px;" />}
          />
          <div style="flex: 1;" />
          <div class="oit-logbook-bottom-buttons">
            <Button label="STATUS" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)} />
          </div>
        </div>
        <OitAvncsLogbookItemDetail
          container={this.props.container}
          uiService={this.props.uiService}
          variant="open"
          title="STATUS / OPEN ITEMS / DETAILED REPORT"
          items={this.items}
          selectedRef={this.selectedRef}
          onSend={(ref) => this.store.send([ref])}
        />
      </>
    );
  }
}
