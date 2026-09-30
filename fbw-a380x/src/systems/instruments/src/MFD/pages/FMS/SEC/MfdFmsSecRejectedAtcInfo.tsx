// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../../common/FcomLayout';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { secIndexPageUri } from '../../../shared/utils';
import { RejectedAtcElement } from '../../../FMC/AtcRouteClearance';

import './MfdFmsSecRejectedAtcInfo.scss';

/** URI page of the REJECTED ATC INFO page */
export const rejectedAtcInfoPage = 'rejected-atc-info';

/** FCOM figure: 4 rejected elements per page */
const elementsPerPage = 4;

/** FCOM figure: the first row starts below the header line, 145 px per row */
const firstRowTop = 67;
const rowHeight = 145;

/**
 * REJECTED ATC INFO page (A380 FCOM DSC-22-FMS-20-30 P 321-323): the elements of the ATC flight plan inserted in SEC 3
 * that the FMS rejected (LOAD-SEC3 of the ATC mailbox), with their ranking, description and error type, 4 per page.
 * PRINT is inactive.
 */
export class MfdFmsSecRejectedAtcInfo extends FmsPage<AbstractMfdPageProps> {
  private readonly rejected = Subject.create<readonly RejectedAtcElement[]>([]);

  private readonly rejectedCount = this.rejected.map((list) => list.length);

  private readonly headerText = this.rejectedCount.map((n) => `REJECTED DATA (${n})`);

  private readonly firstElement = Subject.create(0);

  private readonly noPrinter = Subject.create(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(
      // The FCOM page title has no flight plan prefix
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('REJECTED ATC INFO'), true),
      this.props.fmcService.master.atcRejectedElements.sub((list) => {
        this.rejected.set(list);
        this.firstElement.set(0);
      }, true),
      this.rejectedCount,
      this.headerText,
    );
  }

  protected onNewData(): void {
    // The rejected elements come from the ATC flight plan upload, not from the flight plan data
  }

  /**
   * A row of the list (FCOM figure): the ranking, the description and the value of the element, the waypoint it follows
   * (AT xxxxx), and the error type
   * @param row the row on the page, 0 to 3
   * @returns the row
   */
  private renderRow(row: number): VNode {
    const element = MappedSubject.create(
      ([list, first]) => list[first + row] ?? null,
      this.rejected,
      this.firstElement,
    );
    const ranking = MappedSubject.create(
      ([list, first]) => (list[first + row] ? `${first + row + 1}/${list.length}` : ''),
      this.rejected,
      this.firstElement,
    );
    const visibility = element.map((e) => (e ? 'inherit' : 'hidden'));
    const atVisibility = element.map((e) => (e?.at ? 'inherit' : 'hidden'));
    const description = element.map((e) => e?.description ?? '');
    const value = element.map((e) => e?.value ?? '');
    const at = element.map((e) => e?.at ?? '');
    const error = element.map((e) => e?.error ?? '');
    this.subs.push(element, ranking, visibility, atVisibility, description, value, at, error);

    const top = firstRowTop + row * rowHeight;
    return (
      <div style={{ visibility }}>
        {fcomAt(top + 19, 7, <span class="mfd-label">{ranking}</span>)}
        {fcomAt(top + 61, 14, <span class="mfd-label green">{description}</span>)}
        {fcomRight(top + 61, 349, <span class="mfd-value bigger">{value}</span>)}
        {fcomAt(
          top + 105,
          14,
          <span style={{ visibility: atVisibility }}>
            <span class="mfd-label green">AT </span>
            <span class="mfd-value bigger">{at}</span>
          </span>,
        )}
        {fcomAt(top + 61, 380, <span class="mfd-label green">{error}</span>)}
      </div>
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 321), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomCentre(39, 175, <span class="mfd-label">{this.headerText}</span>)}
            {fcomCentre(39, 558, <span class="mfd-label">ERROR TYPE</span>)}
            <div class="mfd-rejected-atc-column" />
            {fcomLine(67, 0, 768)}
            {Array.from({ length: elementsPerPage }, (_, i) => fcomLine(212 + i * 145, 0, 768))}
            {Array.from({ length: elementsPerPage }, (_, i) => this.renderRow(i))}
            {fcomAt(
              682,
              317,
              <IconButton
                icon="double-down"
                disabled={this.firstElement.map((f) => f + elementsPerPage >= this.rejectedCount.get())}
                onClick={() => this.firstElement.set(this.firstElement.get() + elementsPerPage)}
                containerStyle="width: 62px; height: 58px;"
              />,
            )}
            {fcomAt(
              682,
              390,
              <IconButton
                icon="double-up"
                disabled={this.firstElement.map((f) => f === 0)}
                onClick={() => this.firstElement.set(Math.max(0, this.firstElement.get() - elementsPerPage))}
                containerStyle="width: 62px; height: 58px;"
              />,
            )}
            {fcomAt(
              788,
              4,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo(`${secIndexPageUri}/3`)}
                buttonStyle="min-width: 124px;"
              />,
            )}
            {fcomAt(
              782,
              636,
              <Button
                label="PRINT *"
                disabled={this.noPrinter}
                onClick={() => {}}
                buttonStyle="min-width: 127px; min-height: 58px;"
              />,
            )}
          </div>
        </div>
        <Footer
          bus={this.props.bus}
          mfd={this.props.mfd}
          fmcService={this.props.fmcService}
          flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
        />
      </>
    );
  }
}
