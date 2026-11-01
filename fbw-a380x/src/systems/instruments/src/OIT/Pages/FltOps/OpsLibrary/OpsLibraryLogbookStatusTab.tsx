//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { mmelUnitId } from '../../../System/OpsLibrary/OpsLibraryContent';
import { LogbookStatusRow, openItemsText } from '../../../System/OpsLibrary/OpsLibraryLogbookStatus';
import { OpsLibraryViewProps } from './OpsLibraryContext';
import './ops-library.scss';

/**
 * The LOGBOOK STATUS tab: the open items count and the deferred MEL and CDL items the eLogbook pushed to the FLT OPS
 * domain. The proposed item opens the MMEL entry of the item.
 */
export class OpsLibraryLogbookStatusTab extends DestroyableComponent<OpsLibraryViewProps> {
  private readonly melRef = FSComponent.createRef<HTMLDivElement>();

  private readonly cdlRef = FSComponent.createRef<HTMLDivElement>();

  private readonly rows = this.props.ctx.logbookRows;

  private readonly openItems = this.rows.map((rows) => openItemsText(rows.openItems));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.openItems,
      MappedSubject.create(([rows]) => {
        this.fill(this.melRef.instance, rows.mel);
        this.fill(this.cdlRef.instance, rows.cdl);
      }, this.rows),
    );
  }

  private fill(table: HTMLElement, rows: readonly LogbookStatusRow[]): void {
    while (table.firstChild) {
      table.removeChild(table.firstChild);
    }
    const head = document.createElement('div');
    head.className = 'oit-ops-table-row oit-ops-table-head';
    for (const [label, last] of [
      ['REPORT', false],
      ['PROPOSED ITEM', true],
    ] as const) {
      const cell = document.createElement('div');
      cell.className = `oit-ops-cell${last ? ' last' : ''}`;
      cell.style.width = '50%';
      cell.textContent = label;
      head.appendChild(cell);
    }
    table.appendChild(head);

    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'oit-ops-table-row';
      const report = document.createElement('div');
      report.className = 'oit-ops-cell oit-ops-colour-yellow';
      report.style.width = '50%';
      report.textContent = row.report;
      line.appendChild(report);
      const proposed = document.createElement('div');
      proposed.className = `oit-ops-cell last${row.proposedItem !== '' ? ' oit-ops-link' : ''}`;
      proposed.style.width = '50%';
      proposed.textContent = row.proposedItem;
      if (row.proposedItem !== '') {
        proposed.addEventListener('click', () =>
          this.props.ctx.session.consultation.openUnit(mmelUnitId(row.reference)),
        );
      }
      line.appendChild(proposed);
      table.appendChild(line);
    }
  }

  render(): VNode {
    return (
      <div class="oit-ops-tab">
        <div class="oit-ops-caption">{this.openItems}</div>
        <div class="oit-ops-caption">DEFERRED MEL ITEMS:</div>
        <div ref={this.melRef} class="oit-ops-table" />
        <div class="oit-ops-caption">DEFERRED CDL ITEMS:</div>
        <div ref={this.cdlRef} class="oit-ops-table" />
        <div class="oit-ops-tab-buttons">
          <Button label="SYNCHRO LOGBOOK" onClick={() => this.props.ctx.synchroLogbook()} />
        </div>
      </div>
    );
  }
}
