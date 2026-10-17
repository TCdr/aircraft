//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0
import { ClockEvents, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { PageTitle } from '../Generic/PageTitle';
import { SdPageProps } from '../../SD';
import { FormattedFwcText } from '../../../MsfsAvionicsCommon/FormattedFwcText';

import './style.scss';
import { SDSimvars } from '../../SDSimvarPublisher';
import { readStatusColumnCodes, STATUS_PAGE_INDEX_VAR, statusPageView } from '@shared/StatusPaging';

const readNumber = (name: string): number => SimVar.GetSimVarValue(name, 'number');

/**
 * The STATUS page: the lines the FWC computes from the active alerts, information on the left and the inoperative
 * systems on the right; NORMAL when there are none. A page that overflows shows the page the FWC selects (CLR, or STS
 * with one ECAM display) and a green arrow at the bottom of the column separator.
 */
export class StatusPage extends DestroyableComponent<SdPageProps> {
  private readonly sub = this.props.bus.getSubscriber<SDSimvars & ClockEvents>();

  private readonly topSvgDisplay = this.props.visible.map((v) => (v ? 'inline' : 'none'));

  private linesLeft = Subject.create('\r\r              \x1b<3mNORMAL');

  private linesRight = Subject.create('');

  private readonly overflowArrowVisibility = Subject.create('hidden');

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(
      this.topSvgDisplay,
      this.sub
        .on('realTime')
        .atFrequency(2)
        .handle(() => this.updateLines()),
    );
  }

  private updateLines(): void {
    const page = statusPageView(
      readStatusColumnCodes('LEFT', readNumber),
      readStatusColumnCodes('RIGHT', readNumber),
      readNumber(STATUS_PAGE_INDEX_VAR),
    );
    this.linesLeft.set(page.left);
    this.linesRight.set(page.right);
    this.overflowArrowVisibility.set(page.overflow ? 'visible' : 'hidden');
  }

  destroy(): void {
    super.destroy();
  }

  render() {
    return (
      <svg
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox="0 0 768 768"
        style={{ display: this.topSvgDisplay }}
        id="main-status"
      >
        <PageTitle x={316} y={38}>
          STATUS
        </PageTitle>

        <FormattedFwcText bus={this.props.bus} x={8} y={118} message={this.linesLeft}></FormattedFwcText>

        <FormattedFwcText bus={this.props.bus} x={512} y={118} message={this.linesRight}></FormattedFwcText>

        <line class="SW4 Grey LineRound" x1="483" y1="96" x2="483" y2="593" />

        {/* The overflow arrow: green, pointing down, below the column separator, the
        same arrow as the E/WD overflow arrow */}
        <path
          class="Green Fill"
          d="m 480 597 h 6 v 17 h 4 l -7,14 l -7,-14 h 4 v -17"
          visibility={this.overflowArrowVisibility}
        />
      </svg>
    );
  }
}
