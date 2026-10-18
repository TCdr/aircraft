//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import {
  LogbookDeferralCategory,
  deferralExpiryText,
  deferredItems,
  formatLogbookDate,
  markListViewed,
} from '../../../System/TechLogbook';
import { LogbookClickable, LogbookTable, LogbookTableRow } from './LogbookWidgets';
import { OitAvncsLogbookItemDetail } from './OitAvncsLogbookItemDetail';
import { LOGBOOK_URI } from './LogbookFlows';

interface OitAvncsLogbookDeferredItemsProps extends AbstractOitAvncsPageProps {}

const PANELS: { title: string; category: LogbookDeferralCategory }[] = [
  { title: 'MEL ITEMS', category: 'MEL' },
  { title: 'CDL ITEMS', category: 'CDL' },
  { title: 'OTHER', category: 'OTHER' },
];

/**
 * The DEFERRED ITEMS page: the MEL, CDL and OTHER panels, the first expiry date at the top, and the detailed reports.
 * Deferred items come from the ground maintenance only.
 */
export class OitAvncsLogbookDeferredItems extends DestroyableComponent<OitAvncsLogbookDeferredItemsProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  /** What the crew selected stays until the LOGBOOK application closes */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  private readonly panel = this.drafts.field<number>(LOGBOOK_URI.deferredItems, 'panel', 0);
  private readonly panelSelected = PANELS.map((_, i) => this.panel.map((p) => p === i));
  private readonly panelEmpty = PANELS.map((p) =>
    this.store.state.map((s) => deferredItems(s, p.category).length === 0),
  );
  private readonly panelTitles = PANELS.map((p) =>
    this.store.state.map((s) => `${p.title} (${deferredItems(s, p.category).length})`),
  );
  private readonly otherHidden = this.panel.map((p) => p !== 2);
  private readonly melCdlHidden = this.panel.map((p) => p === 2);

  private readonly items = MappedSubject.create(
    ([state, panel]) => deferredItems(state, PANELS[panel].category),
    this.store.state,
    this.panel,
  );

  private readonly selectedRef = this.drafts.field<string | null>(LOGBOOK_URI.deferredItems, 'selectedRef', null);
  private readonly tableHidden = this.selectedRef.map((r) => r !== null);

  private readonly melCdlRows = this.items.map((items): LogbookTableRow[] =>
    items.map((item) => ({
      cells: [
        item.title,
        item.deferral?.classification ?? '',
        formatLogbookDate(item.openDate),
        deferralExpiryText(item),
      ],
      linkCell: 0,
      onClick: () => this.selectedRef.set(item.ref),
    })),
  );

  private readonly otherRows = this.items.map((items): LogbookTableRow[] =>
    items.map((item) => ({
      cells: [item.title, formatLogbookDate(item.openDate), deferralExpiryText(item)],
      linkCell: 0,
      onClick: () => this.selectedRef.set(item.ref),
    })),
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      ...this.panelSelected,
      ...this.panelEmpty,
      ...this.panelTitles,
      this.otherHidden,
      this.melCdlHidden,
      this.items,
      this.tableHidden,
      this.melCdlRows,
      this.otherRows,
    );
    this.store.change((s) => markListViewed(s, 'deferred'));
  }

  render(): VNode {
    return (
      <>
        <div class={{ 'oit-logbook-frame': true, hidden: this.tableHidden }}>
          <span class="oit-logbook-frame-title">STATUS / DEFERRED ITEMS</span>
          <div class="oit-logbook-tabs">
            {PANELS.map((_, index) => (
              <LogbookClickable
                class={{
                  'oit-logbook-tab': true,
                  selected: this.panelSelected[index],
                  'oit-logbook-grey': this.panelEmpty[index],
                }}
                onClick={() => {
                  if (!this.panelEmpty[index].get()) {
                    this.panel.set(index);
                  }
                }}
              >
                {this.panelTitles[index]}
              </LogbookClickable>
            ))}
          </div>
          <div class="oit-logbook-content">
            <div class={{ hidden: this.melCdlHidden }}>
              <LogbookTable
                columns={[
                  { title: 'REPORT', width: '530px' },
                  { title: 'CLASSIFICATION', width: '200px' },
                  { title: 'OPEN DATE', width: '170px', centered: true },
                  { title: 'EXPIRY DATE ▼', width: '180px', centered: true },
                ]}
                rows={this.melCdlRows}
                rowsPerPage={11}
              />
            </div>
            <div class={{ hidden: this.otherHidden }}>
              <LogbookTable
                columns={[
                  { title: 'REPORT', width: '730px' },
                  { title: 'OPEN DATE', width: '170px', centered: true },
                  { title: 'EXPIRY DATE ▼', width: '180px', centered: true },
                ]}
                rows={this.otherRows}
                rowsPerPage={11}
              />
            </div>
          </div>
          <div class="oit-logbook-bottom-buttons">
            <Button label="STATUS" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)} />
          </div>
        </div>
        <OitAvncsLogbookItemDetail
          container={this.props.container}
          uiService={this.props.uiService}
          variant="deferred"
          title="STATUS / DEFERRED ITEMS / DETAILED REPORT"
          items={this.items}
          selectedRef={this.selectedRef}
        />
      </>
    );
  }
}
