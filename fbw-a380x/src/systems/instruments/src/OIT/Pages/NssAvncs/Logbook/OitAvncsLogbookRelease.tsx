//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { LogbookItem, formatLogbookDate, formatLogbookDateTime } from '../../../System/TechLogbook';
import { LogbookClickable, LogbookTable, LogbookTableRow } from './LogbookWidgets';
import { OitAvncsLogbookItemDetail } from './OitAvncsLogbookItemDetail';
import { LOGBOOK_URI } from './LogbookFlows';

interface OitAvncsLogbookReleaseProps extends AbstractOitAvncsPageProps {}

const PANELS = ['REPORTS', 'PARAMETERS', 'SERVICED'];

/** Design choice: the SERVICED categories (operator customised), one typical category; the sim has no servicing record */
const SERVICED_CATEGORIES = ['ENGINE OIL'];

/**
 * The MAINTENANCE RELEASE REPORT (MORE of the STATUS page): the REPORTS (items closed since the last release),
 * PARAMETERS and SERVICED panels.
 */
export class OitAvncsLogbookRelease extends DestroyableComponent<OitAvncsLogbookReleaseProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  /** What the crew selected stays until the LOGBOOK application closes */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  private readonly panel = this.drafts.field<number>(LOGBOOK_URI.release, 'panel', 0);
  private readonly panelSelected = PANELS.map((_, i) => this.panel.map((p) => p === i));
  private readonly panelHidden = PANELS.map((_, i) => this.panel.map((p) => p !== i));

  private readonly selectedRef = this.drafts.field<string | null>(LOGBOOK_URI.release, 'selectedRef', null);
  private readonly tableHidden = this.selectedRef.map((r) => r !== null);

  private readonly releaseDateText = this.store.state.map(
    (s) => `DATE: ${formatLogbookDateTime(s.release?.date ?? null)}`,
  );
  private readonly expiryText = this.store.state.map(
    (s) => `EXPIRY: ${s.release?.expiryDate ? formatLogbookDate(s.release.expiryDate) : '---'}`,
  );

  private readonly reportItems = this.store.state.map((s): readonly LogbookItem[] => {
    const refs = s.release?.closedItemRefs ?? [];
    return s.items.filter((i) => refs.includes(i.ref)).sort((a, b) => b.openDate - a.openDate);
  });

  private readonly reportRows = this.reportItems.map((items): LogbookTableRow[] =>
    items.map((item) => ({
      cells: [item.title, 'DEFECT', formatLogbookDate(item.openDate), 'CLOSED'],
      linkCell: 0,
      onClick: () => this.selectedRef.set(item.ref),
    })),
  );

  private readonly parameterRows = this.store.state.map((s): LogbookTableRow[] =>
    (s.release?.parameters ?? []).map((p) => ({
      cells: [p.name, p.performed ? '☑ PERFORMED' : '☐', p.comment],
    })),
  );

  private readonly servicedRows = Subject.create<readonly LogbookTableRow[]>([]);

  private readonly servicedCategory = this.drafts.field<number | null>(LOGBOOK_URI.release, 'servicedCategory', 0);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      ...this.panelSelected,
      ...this.panelHidden,
      this.tableHidden,
      this.releaseDateText,
      this.expiryText,
      this.reportItems,
      this.reportRows,
      this.parameterRows,
    );
  }

  render(): VNode {
    return (
      <>
        <div class={{ 'oit-logbook-frame': true, hidden: this.tableHidden }}>
          <span class="oit-logbook-frame-title">STATUS / MAINTENANCE RELEASE REPORT</span>
          <div class="oit-logbook-green">MAINTENANCE RELEASE</div>
          <div style="margin-left: 20px;">{this.releaseDateText}</div>
          <div style="margin-left: 20px;">{this.expiryText}</div>
          <div class="oit-logbook-tabs" style="margin-top: 10px;">
            {PANELS.map((title, index) => (
              <LogbookClickable
                class={{ 'oit-logbook-tab': true, selected: this.panelSelected[index] }}
                onClick={() => this.panel.set(index)}
              >
                {title}
              </LogbookClickable>
            ))}
          </div>
          <div class="oit-logbook-content" style="flex: 0 0 auto; min-height: 420px;">
            <div class={{ hidden: this.panelHidden[0] }}>
              <LogbookTable
                columns={[
                  { title: 'TITLE', width: '590px' },
                  { title: 'TYPE', width: '140px', centered: true },
                  { title: 'OPEN DATE ▼', width: '170px', centered: true },
                  { title: 'STATUS', width: '150px', centered: true },
                ]}
                rows={this.reportRows}
                rowsPerPage={9}
              />
            </div>
            <div class={{ hidden: this.panelHidden[1] }}>
              <LogbookTable
                columns={[
                  { title: 'NAME', width: '260px' },
                  { title: 'VALUE', width: '220px' },
                  { title: 'COMMENTS', width: '570px' },
                ]}
                rows={this.parameterRows}
                rowsPerPage={9}
              />
            </div>
            <div class={{ hidden: this.panelHidden[2] }}>
              <DropdownMenu
                values={ArraySubject.create(SERVICED_CATEGORIES)}
                selectedIndex={this.servicedCategory}
                idPrefix={`${this.props.uiService.captOrFo}_logbook_serviced`}
                freeTextAllowed={false}
                containerStyle="width: 360px; margin-bottom: 10px;"
                hEventConsumer={this.props.container.hEventConsumer}
                interactionMode={this.props.container.interactionMode}
              />
              <LogbookTable
                columns={[
                  { title: 'NAME', width: '260px' },
                  { title: 'VALUE', width: '220px' },
                  { title: 'COMMENTS', width: '570px' },
                ]}
                rows={this.servicedRows}
                rowsPerPage={7}
              />
            </div>
          </div>
          <div style="flex: 1;" />
          <div class="oit-logbook-bottom-buttons">
            <Button label="STATUS" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)} />
          </div>
        </div>
        <OitAvncsLogbookItemDetail
          container={this.props.container}
          uiService={this.props.uiService}
          variant="history"
          title="STATUS / MAINTENANCE RELEASE REPORT / DETAILED REPORT"
          items={this.reportItems}
          selectedRef={this.selectedRef}
        />
      </>
    );
  }
}
