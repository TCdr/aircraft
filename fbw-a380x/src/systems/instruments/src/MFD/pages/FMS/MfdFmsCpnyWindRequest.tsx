// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../MFD';
import { FmsFlightPlanPage } from '../common/FmsFlightPlanPage';
import { Footer } from '../common/Footer';
import { freeTextSendControls } from '../common/FreeTextSendControls';
import { CpnyWindButtonStateTracker } from './CpnyWindButtonUtils';
import { isCpnyWindButtonDisabled } from './CpnyWindButtonRule';

interface MfdFmsCpnyWindRequestProps extends AbstractMfdPageProps {}

/**
 * COMPANY WIND DATA REQUEST page (A380 FCOM a380_fcom.txt l.42121-42128, free text option): free text sent with the
 * company wind request of the flight plan the page was opened from, and the SEND WIND REQUEST button (REQUEST
 * PENDING ... while the request is pending). The company ground station is SimBrief, through the AOC datalink: the
 * free text is kept on the page and not sent (SimBrief has no use for it).
 */
export class MfdFmsCpnyWindRequest extends FmsFlightPlanPage<MfdFmsCpnyWindRequestProps> {
  private readonly freeText = Subject.create<string | null>(null);

  private readonly fpIsActiveOrCopyOfActive = Subject.create(false);

  private readonly tracker = new CpnyWindButtonStateTracker(
    this.props.fmcService.master,
    this.loadedFlightPlanIndex,
    this.tmpyActive,
    this.fpIsActiveOrCopyOfActive,
  );

  private readonly pending = this.tracker.state.map((s) => s.cpnyWindUplinkInProgress);

  private readonly sendLabel = this.pending.map((p) => (p ? 'REQUEST<br />PENDING...' : 'SEND WIND<br />REQUEST *'));

  /** No second request while one is pending, nor once winds were received for this plan (INSERT/CLEAR first) */
  private readonly sendDisabled = MappedSubject.create(
    ([state]) => state.cpnyWindUplinkInProgress || state.availableForPlan || isCpnyWindButtonDisabled(state),
    this.tracker.state,
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
    const plans = this.props.fmcService.master.flightPlanInterface;
    const index = this.loadedFlightPlanIndex.get();
    this.fpIsActiveOrCopyOfActive.set(plans.has(index) ? plans.get(index).isActiveOrCopiedFromActive() : false);
  }

  destroy(): void {
    this.tracker.destroy();
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
              onSend: () => this.props.fmcService.master.requestCpnyWind(this.loadedFlightPlanIndex.get()),
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
