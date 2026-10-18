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

interface OitAvncsLogbookHistoryProps extends AbstractOitAvncsPageProps {}

/** The HISTORY page: the items closed by maintenance, the last open item at the top, and their detailed reports */
export class OitAvncsLogbookHistory extends DestroyableComponent<OitAvncsLogbookHistoryProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly items = this.store.state.map((s) => itemsIn(s, 'closed'));

  /** The detailed report the crew opened stays until the LOGBOOK application closes */
  private readonly selectedRef = this.props.container.ansu.pageDrafts.field<string | null>(
    LOGBOOK_URI.history,
    'selectedRef',
    null,
  );
  private readonly tableHidden = this.selectedRef.map((r) => r !== null);

  private readonly rows = this.items.map((items): LogbookTableRow[] =>
    items.map((item) => ({
      cells: [item.title, formatLogbookDate(item.openDate), formatLogbookDate(item.closeDate)],
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
        <div class={{ 'oit-logbook-column': true, hidden: this.tableHidden }} style="flex: 1;">
          <LogbookTable
            columns={[
              { title: 'REPORT', width: '790px' },
              { title: 'OPEN DATE ▼', width: '180px', centered: true },
              { title: 'CLOSE DATE', width: '180px', centered: true },
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
          variant="history"
          title="STATUS / HISTORY / DETAILED REPORT"
          items={this.items}
          selectedRef={this.selectedRef}
        />
      </>
    );
  }
}
