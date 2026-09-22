// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { EfisNdMode, EfisSide } from '@flybywiresim/fbw-sdk';

import { GenericWxrEvents } from './types/GenericWxrEvents';

export interface WxrModeLabelProps {
  bus: EventBus;
  side: EfisSide;
  mode: Subscribable<EfisNdMode>;
}

/** The radar's ND indications by the mode value the gauge publishes (see A32NX_WXR_ND_{L,R}_MODE). */
const LABELS = ['', 'WX', 'WX+T', 'TURB', 'MAP', 'WXR OFF'];
/** Mode 5: the radar is switched off, shown in white (A320 FCOM DSC-34-SURV-30-30, "WXR OFF (only in white)"). */
const WXR_OFF_MODE = 5;

/**
 * The weather radar mode (WX, WX+T, TURB, MAP) on the right of the map pages (ROSE and ARC), in green (the
 * colour of the automatic mode) while the radar is on, and "WXR OFF" in white while it is switched off.
 */
export class WxrModeLabel extends DisplayComponent<WxrModeLabelProps> {
  private readonly sub = this.props.bus.getSubscriber<GenericWxrEvents>();

  private readonly radarMode = ConsumerSubject.create(
    this.props.side === 'L' ? this.sub.on('wxrNdModeLeft') : this.sub.on('wxrNdModeRight'),
    0,
  );

  private readonly text = MappedSubject.create(
    ([radarMode, ndMode]) => (ndMode !== EfisNdMode.PLAN ? LABELS[radarMode] ?? '' : ''),
    this.radarMode,
    this.props.mode,
  );

  private readonly colorClass = this.radarMode.map((radarMode) =>
    radarMode === WXR_OFF_MODE ? 'White FontSmall' : 'Green FontSmall',
  );

  render(): VNode | null {
    return (
      <text x={744} y={590} class={this.colorClass} text-anchor="end">
        {this.text}
      </text>
    );
  }
}
