//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { formatLogbookDate } from '../../../System/TechLogbook';
import { OpsLibraryViewProps } from './OpsLibraryContext';
import { checkStatusText } from '../../../System/OpsLibrary/OpsLibraryCheck';
import { revisionDateText } from '../../../System/OpsLibrary/OpsLibraryContent';
import './ops-library.scss';

/** The LIBRARY tab: the manuals with their revision date and check status, CHECK and ABOUT */
export class OpsLibraryLibraryTab extends DestroyableComponent<OpsLibraryViewProps> {
  private readonly listRef = FSComponent.createRef<HTMLDivElement>();

  private readonly session = this.props.ctx.session;

  private readonly checkItems = this.session.checks.running.map((running): ButtonMenuItem[] =>
    this.session.catalog.manuals().map((manual) => ({
      label: manual.title,
      disabled: running !== null,
      action: () => {
        this.session.checks.start(manual.id, this.props.ctx.now());
      },
    })),
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.checkItems,
      MappedSubject.create(() => this.rebuild(), this.session.checks.running, this.session.userData.version),
    );
  }

  private rebuild(): void {
    const list = this.listRef.instance;
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    const running = this.session.checks.running.get();
    for (const manual of this.session.catalog.manuals()) {
      const row = document.createElement('div');
      row.className = 'oit-ops-library-row';

      const title = document.createElement('div');
      title.className = 'oit-ops-library-title oit-ops-link';
      title.textContent = manual.title;
      title.addEventListener('click', () => this.session.consultation.open(manual.id));
      row.appendChild(title);

      const date = document.createElement('div');
      date.className = 'oit-ops-library-date';
      date.textContent = revisionDateText(manual.revision);
      row.appendChild(date);

      const check = document.createElement('div');
      check.className = 'oit-ops-library-check';
      check.textContent = checkStatusText(
        running !== null && running.manualId === manual.id,
        this.session.userData.checkOf(manual.id),
        formatLogbookDate,
      );
      row.appendChild(check);
      list.appendChild(row);
    }
  }

  render(): VNode {
    return (
      <div class="oit-ops-tab">
        <div class="oit-ops-tab-buttons" style="margin: 0 0 8px 0; padding: 0; align-items: center;">
          <Button
            label="Check"
            idPrefix="ops-check"
            menuItems={this.checkItems}
            onClick={() => {}}
            dropdownMenuRightAligned
            buttonStyle="white-space: nowrap;"
          />
          <Button label="About" onClick={() => this.session.tabIndex.set(5)} buttonStyle="white-space: nowrap;" />
        </div>
        <div class="oit-ops-caption">Manuals</div>
        <div ref={this.listRef} />
      </div>
    );
  }
}
