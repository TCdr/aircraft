//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ConsumerSubject, EventBus, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitUiService } from '../../OitUiService';
import { OisDomain } from '../../OIT';
import { FmsData } from '@flybywiresim/fbw-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AnsuOps } from '../../System/AnsuOps';
import { OisToolbarMessage } from '../../System/OisMessageToolbar';
import { OitMessageToolbarView } from '../OitMessageToolbarView';

interface OitAvncsHeaderProps {
  readonly bus: EventBus;
  readonly uiService: OitUiService;
  readonly avncsOrFltOps: Subscribable<OisDomain>;
  readonly ansu: AnsuOps;
}

/** The COMPANY COM page that displays a received message */
const COMPANY_COM_INBOX_URI = 'nss-avncs/company-com/inbox';

/*
 * Complete header for the OIS system, both AVNCS and FLT OPS.
 */
export abstract class OitAvncsHeader extends DestroyableComponent<OitAvncsHeaderProps> {
  private readonly sub = this.props.bus.getSubscriber<FmsData>();

  // FIXME maybe this should come from the ATC/ATSU when it's integrated
  private readonly fltNumber = ConsumerSubject.create(this.sub.on('fmsFlightNumber'), null);
  private readonly fltNumberText = this.fltNumber.map((number) => (number ? number : ''));

  /** MAXIMIZE shows the application in full screen; there, MINIMIZE goes back to the normal screen */
  private readonly maximizeLabel = this.props.uiService.fullScreen.map((fullScreen) =>
    fullScreen ? 'MINIMIZE' : 'MAXIMIZE',
  );

  /** No application on the NSS AVNCS Menu page */
  private readonly maximizeDisabled = this.props.uiService.activeUri.map((uri) => !uri.page);

  /**
   * A company message notification selected in the list displays the message in the COMPANY COM Inbox
   * @param message the selected message
   */
  private onMessageSelected(message: OisToolbarMessage): void {
    if (message.aocUid !== null) {
      this.props.ansu.companyCom.display(message.aocUid);
      this.props.uiService.navigateTo(COMPANY_COM_INBOX_URI);
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(this.fltNumber, this.fltNumberText, this.maximizeLabel, this.maximizeDisabled);
  }

  render(): VNode {
    return (
      <div class="oit-header-row">
        <Button
          label={'NSS AVNCS MENU'}
          onClick={() => this.props.uiService.navigateTo('nss-avncs')}
          buttonStyle="width: 250px; font-size: 28px; height: 50px;"
        />
        <Button
          label={this.maximizeLabel}
          disabled={this.maximizeDisabled}
          onClick={() => this.props.uiService.fullScreen.set(!this.props.uiService.fullScreen.get())}
          buttonStyle="width: 125px; font-size: 28px; height: 50px; margin-left: 5px;"
        />
        <OitMessageToolbarView
          toolbar={this.props.ansu.messageToolbar}
          onSelect={(message) => this.onMessageSelected(message)}
          idPrefix={`${this.props.uiService.captOrFo}_OIT_nss_avncs`}
          height={50}
        />
        <div class="oit-avncs-header-flt-nbr">{this.fltNumberText}</div>
      </div>
    );
  }
}
