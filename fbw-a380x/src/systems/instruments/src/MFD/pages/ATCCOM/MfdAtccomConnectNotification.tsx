// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, MappedSubject, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import './MfdAtccomConnect.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomCentre } from '../common/FcomLayout';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AtccomFooter } from './MfdAtccomFooter';
import { AtcCenterFormat } from './AtccomEntryFormats';

/**
 * CONNECT/NOTIFICATION page (A380 FCOM DSC-46-10-20-30 P 2-4), laid out on the FCOM figure (page coordinates =
 * display y - 143): the ATC center to notify (amber boxes while empty), NOTIFY, the notification indication and the
 * NOTIFIED TO CENTERS list (6 centers at most, with the UTC time of the notification).
 */
export class MfdAtccomConnectNotification extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly atcCenter = Subject.create<string | null>(null);

  private readonly listRef = FSComponent.createRef<HTMLDivElement>();

  private readonly indication = this.props.atcService.notificationState.map((state) =>
    state === 'NOTIFYING' ? 'NOTIFYING' : state === 'FAILED' ? 'NOTIFICATION FAILED' : '',
  );

  private readonly indicationClass = this.props.atcService.notificationState.map((state) =>
    state === 'FAILED' ? 'mfd-atccom-indication amber' : 'mfd-atccom-indication',
  );

  private readonly notifyDisabled = MappedSubject.create(
    ([center, state]) => center === null || state === 'NOTIFYING',
    this.atcCenter,
    this.props.atcService.notificationState,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.indication,
      this.indicationClass,
      this.notifyDisabled,
      this.props.atcService.notifiedCenters.sub((_, __, ___, centers) => {
        const list = this.listRef.instance;
        list.innerHTML = '';
        centers.forEach((center) => {
          const row = document.createElement('div');
          row.className = 'mfd-atccom-list-row green';
          row.textContent = `${center.icao} ${center.time}`;
          list.appendChild(row);
        });
      }, true),
    );
  }

  private async notify(): Promise<void> {
    const center = this.atcCenter.get();
    if (center === null) {
      return;
    }
    await this.props.atcService.notify(center);
    if (this.props.atcService.notificationState.get() !== 'FAILED') {
      // The field is blank again after a successful notification (FCOM P 3)
      this.atcCenter.set(null);
    }
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  render(): VNode {
    return (
      <>
        <ActivePageTitleBar activePage={Subject.create(this.props.pageTitle ?? '')} offset={Subject.create('')} />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-connect">
            {fcomAt(115, 43, <span class="mfd-label">ATC CENTER :</span>)}
            {fcomAt(
              115,
              251,
              <InputField<string>
                dataEntryFormat={new AtcCenterFormat()}
                value={this.atcCenter}
                mandatory={Subject.create(true)}
                containerStyle="width: 107px;"
                alignText="center"
                errorHandler={(e) => this.props.atcService.showAtcErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(
              115,
              398,
              <Button
                label="NOTIFY"
                disabled={this.notifyDisabled}
                onClick={() => this.notify()}
                buttonStyle="width: 130px; height: 41px;"
              />,
            )}
            {fcomAt(161, 251, <span class={this.indicationClass}>{this.indication}</span>)}
            {fcomAt(267, 43, <span class="mfd-label">NOTIFIED TO CENTERS :</span>)}
            <div class="mfd-atccom-list-box" style="left: 260px; top: 334px; width: 298px; height: 305px;">
              <div ref={this.listRef} class="mfd-atccom-list" />
            </div>
            {fcomCentre(
              781,
              662,
              <Button
                label={'CONNECTION\nSTATUS PAGE'}
                onClick={() => this.props.mfd.uiService.navigateTo('atccom/connect/connection-status')}
                buttonStyle="width: 201px; height: 62px; white-space: pre;"
              />,
            )}
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}
