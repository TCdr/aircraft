// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ConsumerSubject, DisplayComponent, FSComponent, VNode } from '@microsoft/msfs-sdk';
import { ArincEventBus } from '@flybywiresim/fbw-sdk';

import { FlashOneHertz } from '../MsfsAvionicsCommon/FlashingElementUtils';
import { EfisSideDiscrepancyEvents } from '../MsfsAvionicsCommon/EfisSideDiscrepancy';
import { PFD_FLAG_FLASH_SECONDS } from './shared/PfdFlags';

/**
 * CHECK ATT and CHECK HDG (amber) on the PFD, the side 1 / side 2 discrepancy messages; they flash for 9 s, then
 * remain steady. CHECK ALT is drawn by AltitudeIndicatorOfftape from the FWC.
 * Design choice: no documented position, CHECK ATT is drawn at the upper left of the attitude sphere, CHECK HDG above
 * the right half of the heading scale.
 */
export class SideDiscrepancyMessages extends DisplayComponent<{ bus: ArincEventBus }> {
  private readonly sub = this.props.bus.getSubscriber<EfisSideDiscrepancyEvents>();

  private readonly checkAttitude = ConsumerSubject.create(this.sub.on('efis_check_attitude'), false);

  private readonly checkHeading = ConsumerSubject.create(this.sub.on('efis_check_heading'), false);

  render(): VNode {
    return (
      <>
        <FlashOneHertz bus={this.props.bus} flashDuration={PFD_FLAG_FLASH_SECONDS} visible={this.checkAttitude}>
          <text id="CheckAttMessage" class="FontMedium Amber StartAlign" x="34.2" y="70.5">
            CHECK ATT
          </text>
        </FlashOneHertz>
        <FlashOneHertz bus={this.props.bus} flashDuration={PFD_FLAG_FLASH_SECONDS} visible={this.checkHeading}>
          <text id="CheckHdgMessage" class="FontMedium Amber MiddleAlign" x="89.5" y="143.2">
            CHECK HDG
          </text>
        </FlashOneHertz>
      </>
    );
  }
}
