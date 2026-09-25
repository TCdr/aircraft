// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { fcomAt, fcomCentre, fcomLine } from '../../common/FcomLayout';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { secIndexPageUri } from '../../../shared/utils';

import './MfdFmsSecRejectedAtcInfo.scss';

/** URI page of the REJECTED ATC INFO page */
export const rejectedAtcInfoPage = 'rejected-atc-info';

/** FCOM figure: 4 rejected elements per page */
const elementsPerPage = 4;

/**
 * REJECTED ATC INFO page (A380 FCOM DSC-22-FMS-20-30 P 321-323): the elements of the ATC flight plan inserted in SEC 3
 * that the FMS rejected, with their ranking, description and error type, 4 per page.
 *
 * No ATC flight plan can be received in the simulation, so the list is empty; PRINT is inactive (no printer).
 */
export class MfdFmsSecRejectedAtcInfo extends FmsPage<AbstractMfdPageProps> {
  private readonly rejectedCount = Subject.create(0);

  private readonly headerText = this.rejectedCount.map((n) => `REJECTED DATA (${n})`);

  private readonly firstElement = Subject.create(0);

  private readonly noPrinter = Subject.create(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(
      // The FCOM page title has no flight plan prefix
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('REJECTED ATC INFO'), true),
      this.headerText,
    );
  }

  protected onNewData(): void {
    // No ATC flight plan uplink: no rejected element
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
