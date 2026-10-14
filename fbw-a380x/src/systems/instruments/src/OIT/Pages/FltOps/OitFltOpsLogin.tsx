//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  EventBus,
  FSComponent,
  SimVarValueType,
  Subscribable,
  SubscribableMapFunctions,
  VNode,
} from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitUiService } from '../../OitUiService';

interface OitFltOpsLoginPageProps {
  readonly bus: EventBus;
  readonly uiService: OitUiService;
  readonly captOrFo: 'CAPT' | 'FO';
  /** The laptop is not connected to the aircraft network (OisLaptop.standalone) */
  readonly standalone: Subscribable<boolean>;
}

export class OitFltOpsLogin extends DestroyableComponent<OitFltOpsLoginPageProps> {
  // Make sure to collect all subscriptions in this.subscriptions, otherwise page navigation doesn't work.

  private readonly hideLoginScreen = this.props.uiService.fltOpsLoginScreenVisible.map(SubscribableMapFunctions.not());

  /**
   * A380 FCOM DSC-46-20-40 LAPTOP START (a380_fcom.txt l.104922): '"STANDALONE" appears on the Login page of the
   * laptop' started before the ARU or not connected to the network
   */
  private readonly hideStandalone = this.props.standalone.map(SubscribableMapFunctions.not());

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(this.hideLoginScreen, this.hideStandalone);
  }

  render(): VNode {
    return (
      <>
        {/* begin page content */}
        <div class={{ 'oit-flt-ops-loading-screen-container': true, hidden: this.hideLoginScreen }}>
          <div class="oit-login-page-heading">FLT OPS Domain</div>
          <div class="oit-login-page-sub-heading">Login Page</div>
          <div class="oit-login-page-sub-sub-heading">
            {this.props.captOrFo === 'CAPT' ? 'CAPTAIN' : 'FIRST OFFICER'}
          </div>
          <div class={{ 'oit-login-page-standalone': true, hidden: this.hideStandalone }}>STANDALONE</div>
          <div class="oit-login-page-button-container">
            <Button label="PILOT" onClick={() => this.props.uiService.fltOpsLoginScreenVisible.set(false)} />
            <Button
              label="MAINTAINER"
              onClick={() => this.props.uiService.fltOpsLoginScreenVisible.set(false)}
              containerStyle="margin-top: 10px;"
              disabled={true}
            />
          </div>
          <div class="oit-login-page-bottom-left-button">
            <Button
              label="SWITCH OFF<br />LAPTOP"
              onClick={() =>
                SimVar.SetSimVarValue(
                  `L:A380X_SWITCH_LAPTOP_POWER_${this.props.captOrFo === 'CAPT' ? 'LEFT' : 'RIGHT'}`,
                  SimVarValueType.Bool,
                  false,
                )
              }
            />
          </div>
        </div>
        {/* end page content */}
      </>
    );
  }
}
