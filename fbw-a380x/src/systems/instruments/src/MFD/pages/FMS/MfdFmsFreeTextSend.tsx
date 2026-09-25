// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../MFD';
import { FmsPage } from '../common/FmsPage';
import { Footer } from '../common/Footer';
import { freeTextSendControls } from '../common/FreeTextSendControls';

/** URI pages of the free text send pages */
export const cpnyFplnReportPage = 'f-pln-cpny-f-pln-report';
export const transferToMailboxPage = 'xfer-to-mailbox';

interface MfdFmsFreeTextSendProps extends AbstractMfdPageProps {
  /** Page title (FCOM: without flight plan prefix) */
  title: string;
  /** Label of the send button */
  sendLabel: string;
  /** Page displayed by RETURN */
  returnUri: () => string;
}

/**
 * The FCOM pages made of a 24 character free text and a send button (A380 FCOM DSC-22-FMS-20-30):
 * - COMPANY F-PLN REPORT (P 25-27): SEND REPORT TO CPNY sends the active flight plan report to the company via ACARS
 * - TRANSFER TO MAILBOX (P 337-339): XFER TO MAILBOX sends a secondary flight plan to the ATC mailbox
 *
 * Neither the company flight plan report nor the ATC mailbox flight plan transfer is modelled: the send button is
 * inactive.
 */
export class MfdFmsFreeTextSend extends FmsPage<MfdFmsFreeTextSendProps> {
  private readonly freeText = Subject.create<string | null>(null);

  private readonly notModelled = Subject.create(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set(this.props.title), true));
  }

  protected onNewData(): void {
    // The page has no flight plan data
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figures (DSC-22-FMS-20-30 P 25 and P 337), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {freeTextSendControls({
              freeText: this.freeText,
              sendLabel: this.props.sendLabel,
              sendDisabled: this.notModelled,
              onSend: () => {},
              onReturn: () => this.props.mfd.uiService.navigateTo(this.props.returnUri()),
              mfd: this.props.mfd,
              fmcService: this.props.fmcService,
            })}
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
