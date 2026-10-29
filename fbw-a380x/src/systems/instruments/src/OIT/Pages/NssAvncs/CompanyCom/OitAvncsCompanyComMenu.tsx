//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { OitFolder, OitFile } from '../OitAvncsFolderNavigator';
import { OitUiService } from '../../../OitUiService';
import { AnsuOps } from '../../../System/AnsuOps';

interface OitAvncsCompanyComMenuProps {
  readonly bus: EventBus;
  readonly uiService: OitUiService;
  readonly ansu: AnsuOps;
}

export class OitAvncsCompanyComMenu extends DestroyableComponent<OitAvncsCompanyComMenuProps> {
  // Make sure to collect all subscriptions in this.subscriptions, otherwise page navigation doesn't work.

  /** Design choice: the Inbox counts the messages not read yet, as the COMPANY MSG memo does */
  private readonly inboxLabel = this.props.ansu.companyCom.unreadCount.map((count) => `Inbox (${count})`);

  /** The Outbox counts the messages waiting there (sending or not sent) */
  private readonly outboxLabel = this.props.ansu.companyComDownlinks.outbox.map(
    (outbox) => `Outbox (${outbox.length})`,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(this.inboxLabel, this.outboxLabel);
  }

  render(): VNode {
    return (
      <>
        <OitFile
          name={this.inboxLabel}
          uiService={this.props.uiService}
          navigationTarget="nss-avncs/company-com/inbox"
        />
        <OitFile
          name={this.outboxLabel}
          uiService={this.props.uiService}
          navigationTarget="nss-avncs/company-com/outbox"
        />
        <OitFile name={'Sent'} uiService={this.props.uiService} navigationTarget="nss-avncs/company-com/sent" />
        <OitFolder name={'Pre-flight'} initExpanded={true} hideFolderOpener={true}>
          <OitFile
            name={'INIT Data'}
            uiService={this.props.uiService}
            navigationTarget="nss-avncs/company-com/pre-flight/init-data"
          />
          {/* The requests and reports go through the AOC; NOTAM stays disabled: the datalink has no NOTAM source */}
          <OitFolder name={'Requests'} initExpanded={false}>
            <OitFile
              name={'Weather'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/weather"
            />
            <OitFile name={'NOTAM'} uiService={this.props.uiService} disabled={true} />
          </OitFolder>
          <OitFolder name={'Reports'} initExpanded={false}>
            <OitFile
              name={'Fuel Figures'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/fuel-figures"
            />
            <OitFile
              name={'Refuelling'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/refuelling"
            />
            <OitFile
              name={'Loadsheet Acceptance'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/loadsheet-acceptance"
            />
            <OitFile
              name={'Departure Delay'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/departure-delay"
            />
            <OitFile
              name={'Take Off Delay'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/take-off-delay"
            />
            <OitFile
              name={'Delay Code'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/delay-code"
            />
            <OitFile
              name={'Free Text'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/free-text"
            />
            <OitFile
              name={'ASR Notification'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/pre-flight/asr-notification"
            />
          </OitFolder>
          <OitFile
            name={'Flight Log'}
            uiService={this.props.uiService}
            navigationTarget="nss-avncs/company-com/pre-flight/flight-log"
          />
        </OitFolder>
        <OitFolder name={'In-flight'} initExpanded={true} hideFolderOpener={true}>
          <OitFolder name={'Requests'} initExpanded={false}>
            <OitFile
              name={'Weather'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/in-flight/weather"
            />
            <OitFile name={'Notam'} uiService={this.props.uiService} disabled={true} />
            <OitFile
              name={'Ramp Service'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/in-flight/ramp-service"
            />
          </OitFolder>
          <OitFolder name={'Reports'} initExpanded={false}>
            <OitFile
              name={'Diversion'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/in-flight/diversion"
            />
            <OitFile
              name={'ETA'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/in-flight/eta"
            />
            <OitFile
              name={'Flight Delay'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/in-flight/flight-delay"
            />
            <OitFile
              name={'Flight Parameters'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/in-flight/flight-parameters"
            />
            <OitFile
              name={'Free Text'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/in-flight/free-text"
            />
          </OitFolder>
          <OitFile
            name={'Flight Log'}
            uiService={this.props.uiService}
            navigationTarget="nss-avncs/company-com/in-flight/flight-log"
          />
        </OitFolder>
        <OitFolder name={'Post-flight'} initExpanded={true} hideFolderOpener={true}>
          <OitFolder name={'Requests'} initExpanded={false}></OitFolder>
          <OitFolder name={'Reports'} initExpanded={false}>
            <OitFile
              name={'ASR Notification'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/post-flight/asr-notification"
            />
            <OitFile
              name={'Flight Summary'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/post-flight/flight-summary"
            />
            <OitFile
              name={'Free Text'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/post-flight/free-text"
            />
            <OitFile
              name={'Gate Delay'}
              uiService={this.props.uiService}
              navigationTarget="nss-avncs/company-com/post-flight/gate-delay"
            />
          </OitFolder>
          <OitFile
            name={'Flight Log'}
            uiService={this.props.uiService}
            navigationTarget="nss-avncs/company-com/post-flight/flight-log"
          />
        </OitFolder>
      </>
    );
  }
}
