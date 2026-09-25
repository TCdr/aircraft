// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../MFD';
import { FmsPage } from '../common/FmsPage';
import { Footer } from '../common/Footer';
import { freeTextSendControls } from '../common/FreeTextSendControls';
import { CpnyWindButton } from '../../shared/CpnyWindButtonUtils';

interface MfdFmsCpnyWindRequestProps extends AbstractMfdPageProps {}

/**
 * COMPANY WIND DATA REQUEST page (A380 FCOM DSC-22-FMS-20-30 P 42-44): free text sent with the company wind request
 * of the flight plan the page was opened from, and the SEND WIND REQUEST button (REQUEST PENDING ... during the
 * request). The company ground station is SimBrief, through the AOC datalink; the free text is not sent.
 */
export class MfdFmsCpnyWindRequest extends FmsPage<MfdFmsCpnyWindRequestProps> {
  private readonly freeText = Subject.create<string | null>(null);

  private readonly button = new CpnyWindButton(this.props.fmcService.master, this.loadedFlightPlanIndex);

  private readonly pending = this.button.label.map((l) => l.startsWith('REQUEST'));

  private readonly sendLabel = this.pending.map((p) => (p ? 'REQUEST<br />PENDING...' : 'SEND WIND<br />REQUEST *'));

  private readonly sendDisabled = MappedSubject.create(
    ([pending, index]) => pending || !this.props.fmcService.master.isCompanyWindRequestAllowed(index),
    this.pending,
    this.loadedFlightPlanIndex,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      // The FCOM page title has no flight plan prefix
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('COMPANY WIND DATA REQUEST'), true),
      this.pending,
      this.sendLabel,
      this.sendDisabled,
    );
  }

  protected onNewData(): void {
    // The request state is followed through the FMC subscribables
  }

  destroy(): void {
    this.button.destroy();
    super.destroy();
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 42), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {freeTextSendControls({
              freeText: this.freeText,
              sendLabel: this.sendLabel,
              sendDisabled: this.sendDisabled,
              onSend: () => this.props.fmcService.master.requestCompanyWinds(this.loadedFlightPlanIndex.get()),
              onReturn: () => this.props.mfd.uiService.navigateTo('back'),
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
