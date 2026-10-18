//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { formatLogbookDate, itemsIn } from '../../../System/TechLogbook';
import { LogbookTable, LogbookTableRow } from './LogbookWidgets';
import { OitAvncsLogbookItemDetail } from './OitAvncsLogbookItemDetail';
import { LOGBOOK_URI } from './LogbookFlows';
import { SEND_STATUS_TEXTS } from './OitAvncsLogbookOpenItems';

interface OitAvncsLogbookCabinOpenItemsProps extends AbstractOitAvncsPageProps {}

/** The CABIN OPEN ITEMS page: the cabin defects the flight crew refused (kept in the cabin logbook only) */
export class OitAvncsLogbookCabinOpenItems extends DestroyableComponent<OitAvncsLogbookCabinOpenItemsProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly items = this.store.state.map((s) => itemsIn(s, 'cabin-open'));

  /** The detailed report the crew opened stays until the LOGBOOK application closes */
  private readonly selectedRef = this.props.container.ansu.pageDrafts.field<string | null>(
    LOGBOOK_URI.cabinOpenItems,
    'selectedRef',
    null,
  );
  private readonly tableHidden = this.selectedRef.map((r) => r !== null);

  private readonly rows = this.items.map((items): LogbookTableRow[] =>
    items.map((item) => ({
      cells: [item.title, formatLogbookDate(item.openDate), SEND_STATUS_TEXTS[item.sendStatus]],
      cellClasses: ['', '', 'oit-logbook-link'],
      linkCell: 0,
      onClick: () => this.selectedRef.set(item.ref),
    })),
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(this.items, this.tableHidden, this.rows);
  }

  render(): VNode {
    return (
      <>
        <div class={{ 'oit-logbook-frame': true, hidden: this.tableHidden }}>
          <span class="oit-logbook-frame-title">STATUS / CABIN OPEN ITEMS</span>
          <LogbookTable
            columns={[
              { title: 'REPORT', width: '800px' },
              { title: 'OPEN DATE ▼', width: '170px', centered: true },
              { title: 'STATUS', width: '160px', centered: true },
            ]}
            rows={this.rows}
            rowsPerPage={14}
          />
          <div style="flex: 1;" />
          <div class="oit-logbook-bottom-buttons">
            <Button label="STATUS" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)} />
          </div>
        </div>
        <OitAvncsLogbookItemDetail
          container={this.props.container}
          uiService={this.props.uiService}
          variant="cabin"
          title="STATUS / CABIN OPEN ITEMS / DETAILED REPORT"
          items={this.items}
          selectedRef={this.selectedRef}
        />
      </>
    );
  }
}
