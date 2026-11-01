//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { formatOisDateTime } from '../../../System/OisDateTime';
import { ecamUnitId } from '../../../System/OpsLibrary/OpsLibraryContent';
import { recycleBinIcon } from '../OitFltOpsBoxWidgets';
import { OpsLibraryViewProps } from './OpsLibraryContext';
import './ops-library.scss';

/** The ECAM ALERTS tab: the alerts that appeared during the flight, newest first, in their ECAM colour */
export class OpsLibraryEcamAlertsTab extends DestroyableComponent<OpsLibraryViewProps> {
  private readonly tableRef = FSComponent.createRef<HTMLDivElement>();

  private readonly alerts = this.props.ctx.session.ecamAlerts;

  private readonly restoreDisabled = this.alerts.entries.map(() => !this.alerts.hasHidden());

  private readonly unavailableHidden = this.props.ctx.session.avionicsAvailable;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.restoreDisabled,
      MappedSubject.create(() => this.rebuild(), this.alerts.entries),
    );
  }

  private rebuild(): void {
    const table = this.tableRef.instance;
    while (table.firstChild) {
      table.removeChild(table.firstChild);
    }
    for (const entry of this.alerts.visible()) {
      const row = document.createElement('div');
      row.className = 'oit-ops-table-row';

      const title = document.createElement('div');
      title.className = `oit-ops-cell oit-ops-colour-${entry.colour}`;
      title.style.flex = '1 1 auto';
      title.textContent = entry.title;
      row.appendChild(title);

      const search = document.createElement('div');
      search.className = 'oit-ops-cell oit-ops-link';
      search.style.width = '120px';
      search.textContent = 'SEARCH';
      search.addEventListener('click', () =>
        this.props.ctx.session.consultation.openProcedure(
          ecamUnitId(entry.id),
          this.alerts.lastState(entry.occurrence),
        ),
      );
      row.appendChild(search);

      const time = document.createElement('div');
      time.className = 'oit-ops-cell';
      time.style.width = '200px';
      time.textContent = formatOisDateTime(entry.time);
      row.appendChild(time);

      const bin = document.createElement('div');
      bin.className = 'oit-ops-cell last oit-ops-bin';
      bin.style.width = '80px';
      FSComponent.render(recycleBinIcon(), bin);
      bin.addEventListener('click', () => this.alerts.hide(entry.occurrence));
      row.appendChild(bin);

      table.appendChild(row);
    }
  }

  render(): VNode {
    return (
      <div class="oit-ops-tab">
        <div class="oit-ops-caption">ECAM alerts during FLT:</div>
        <div class={{ 'oit-ops-colour-amber': true, hidden: this.unavailableHidden }}>ECAM ALERTS NOT AVAILABLE</div>
        <div ref={this.tableRef} class="oit-ops-table" />
        <div class="oit-ops-tab-buttons">
          <Button label="RESTORE ALL" disabled={this.restoreDisabled} onClick={() => this.alerts.restoreAll()} />
        </div>
      </div>
    );
  }
}
