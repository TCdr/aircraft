// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, Subject, Subscribable, Subscription, VNode } from '@microsoft/msfs-sdk';

import './MfdAtccomConnect.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomCentre, fcomRight } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { ConfirmationDialog } from '../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import { AtccomFooter } from './MfdAtccomFooter';

/**
 * A two-state button of the ADS status area (FCOM DSC-46-10-20-30 P 7): the upper and lower labels, the active one
 * large (green for the upper label, white for OFF), the other one small and grey.
 */
function adsStateButton(
  upper: Subscribable<string>,
  upperClass: Subscribable<string>,
  lowerClass: Subscribable<string>,
  width: number,
): VNode {
  return (
    <div class="mfd-atccom-ads-button" style={`width: ${width}px;`}>
      <span class={upperClass}>{upper}</span>
      <span class={lowerClass}>OFF</span>
    </div>
  );
}

/**
 * CONNECT/CONNECTION STATUS page (A380 FCOM DSC-46-10-20-30 P 5-8), laid out on the FCOM figure (page coordinates =
 * display y - 143): the active and next ATC centers and DISCONNECT, the ADS and ADS EMERGENCY status, and the ADS
 * connected ground stations. No ADS contract is available through the ATSU: the ADS status stays ARMED or OFF.
 */
export class MfdAtccomConnectionStatus extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly activeAtc = this.props.atcService.stationStatus.map((status) => status.current || '----');

  private readonly activeAtcClass = this.props.atcService.stationStatus.map((status) =>
    status.current ? 'mfd-value green' : 'mfd-value',
  );

  private readonly nextAtc = this.props.atcService.stationStatus.map((status) => status.next || '----');

  private readonly nextAtcClass = this.props.atcService.stationStatus.map((status) =>
    status.next ? 'mfd-value green' : 'mfd-value',
  );

  // Plain elements: JSX onClick is not a listener with FSComponent
  private readonly adsRef = FSComponent.createRef<HTMLDivElement>();

  private readonly adsEmergencyRef = FSComponent.createRef<HTMLDivElement>();

  private readonly adsClickHandler = () => this.onAdsClicked();

  private readonly adsEmergencyClickHandler = () => this.onAdsEmergencyClicked();

  private readonly disconnectDisabled = this.props.atcService.stationStatus.map(
    (status) => status.current === '' && status.next === '',
  );

  private readonly adsLabel = this.props.atcService.adsStatus.map((status) =>
    status === 'CONNECTED' ? 'CONNECTED' : 'ARMED',
  );

  private readonly adsOn = this.props.atcService.adsStatus.map((status) => status !== 'OFF');

  private readonly adsUpperClass = this.adsOn.map((on) => (on ? 'ads-upper active' : 'ads-upper'));

  private readonly adsLowerClass = this.adsOn.map((on) => (on ? 'ads-lower' : 'ads-lower active'));

  private readonly emergencyUpperClass = this.props.atcService.adsEmergency.map((on) =>
    on ? 'ads-upper active' : 'ads-upper',
  );

  private readonly emergencyLowerClass = this.props.atcService.adsEmergency.map((on) =>
    on ? 'ads-lower' : 'ads-lower active',
  );

  private readonly disconnectConfirmationVisible = Subject.create(false);

  private readonly adsOffConfirmationVisible = Subject.create(false);

  private readonly adsEmergencyConfirmationVisible = Subject.create(false);

  private readonly stationsRef = FSComponent.createRef<HTMLDivElement>();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.adsRef.instance.addEventListener('click', this.adsClickHandler);
    this.adsEmergencyRef.instance.addEventListener('click', this.adsEmergencyClickHandler);

    this.subs.push(
      this.activeAtc,
      this.activeAtcClass,
      this.nextAtc,
      this.nextAtcClass,
      this.disconnectDisabled,
      this.adsLabel,
      this.adsOn,
      this.adsUpperClass,
      this.adsLowerClass,
      this.emergencyUpperClass,
      this.emergencyLowerClass,
      this.props.atcService.adsConnectedCenters.sub((_, __, ___, centers) => {
        const list = this.stationsRef.instance;
        list.innerHTML = '';
        centers.forEach((center) => {
          const row = document.createElement('div');
          row.className = 'mfd-atccom-list-row green';
          row.textContent = center;
          list.appendChild(row);
        });
      }, true),
    );
  }

  private onAdsClicked(): void {
    if (this.adsOn.get()) {
      // ARMED or CONNECTED: OFF after a confirmation window
      this.adsOffConfirmationVisible.set(true);
    } else {
      this.props.atcService.adsStatus.set('ARMED');
    }
  }

  private onAdsEmergencyClicked(): void {
    if (this.props.atcService.adsEmergency.get()) {
      this.props.atcService.adsEmergency.set(false);
    } else {
      this.adsEmergencyConfirmationVisible.set(true);
    }
  }

  public destroy(): void {
    this.adsRef.getOrDefault()?.removeEventListener('click', this.adsClickHandler);
    this.adsEmergencyRef.getOrDefault()?.removeEventListener('click', this.adsEmergencyClickHandler);
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
            {fcomRight(66, 262, <span class="mfd-label">ACTIVE ATC :</span>)}
            {fcomAt(66, 307, <span class={this.activeAtcClass}>{this.activeAtc}</span>)}
            {fcomAt(
              114,
              460,
              <Button
                label="DISCONNECT"
                disabled={this.disconnectDisabled}
                onClick={() => this.disconnectConfirmationVisible.set(true)}
                buttonStyle="width: 201px; height: 41px;"
              />,
            )}
            {fcomRight(164, 262, <span class="mfd-label">NEXT ATC :</span>)}
            {fcomAt(164, 307, <span class={this.nextAtcClass}>{this.nextAtc}</span>)}

            {fcomCentre(279, 234, <span class="mfd-label">ADS</span>)}
            <div ref={this.adsRef} class="mfd-atccom-ads-slot" style="left: 133px; top: 297px;">
              {adsStateButton(this.adsLabel, this.adsUpperClass, this.adsLowerClass, 203)}
            </div>
            {fcomCentre(279, 510, <span class="mfd-label">ADS EMERGENCY</span>)}
            <div ref={this.adsEmergencyRef} class="mfd-atccom-ads-slot" style="left: 451px; top: 297px;">
              {adsStateButton(Subject.create('ON'), this.emergencyUpperClass, this.emergencyLowerClass, 117)}
            </div>

            {fcomAt(413, 65, <span class="mfd-label">ADS CONNECTED GROUND STATIONS :</span>)}
            <div class="mfd-atccom-list-box" style="left: 233px; top: 440px; width: 345px; height: 276px;">
              <div ref={this.stationsRef} class="mfd-atccom-list" />
            </div>
            {fcomCentre(
              784,
              662,
              <Button
                label={'NOTIFICATION\nPAGE'}
                onClick={() => this.props.mfd.uiService.navigateTo('atccom/connect/notification')}
                buttonStyle="width: 201px; height: 62px; white-space: pre;"
              />,
            )}

            <div class="mfd-atccom-dialogs">
              <ConfirmationDialog
                visible={this.disconnectConfirmationVisible}
                cancelAction={() => this.disconnectConfirmationVisible.set(false)}
                confirmAction={() => {
                  this.disconnectConfirmationVisible.set(false);
                  this.props.atcService.disconnect();
                }}
                contentContainerStyle="width: 360px; height: 165px; transform: translateX(-50%);"
              >
                DISCONNECT ?
              </ConfirmationDialog>
              <ConfirmationDialog
                visible={this.adsOffConfirmationVisible}
                cancelAction={() => this.adsOffConfirmationVisible.set(false)}
                confirmAction={() => {
                  this.adsOffConfirmationVisible.set(false);
                  this.props.atcService.adsStatus.set('OFF');
                  this.props.atcService.adsConnectedCenters.clear();
                }}
                contentContainerStyle="width: 360px; height: 165px; transform: translateX(-50%);"
              >
                ADS OFF ?
              </ConfirmationDialog>
              <ConfirmationDialog
                visible={this.adsEmergencyConfirmationVisible}
                cancelAction={() => this.adsEmergencyConfirmationVisible.set(false)}
                confirmAction={() => {
                  this.adsEmergencyConfirmationVisible.set(false);
                  this.props.atcService.adsEmergency.set(true);
                }}
                contentContainerStyle="width: 400px; height: 165px; transform: translateX(-50%);"
              >
                ADS EMERGENCY ON ?
              </ConfirmationDialog>
            </div>
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}
