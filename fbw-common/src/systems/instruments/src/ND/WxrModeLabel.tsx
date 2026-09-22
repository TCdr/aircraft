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

const LABELS = ['', 'WX', 'WX+T', 'TURB', 'MAP'];

/** The weather radar mode (WX, WX+T, TURB, MAP) on the right of the map pages (ROSE and ARC), while the radar is on. */
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

  render(): VNode | null {
    return (
      <text x={744} y={590} class="Green FontSmall" text-anchor="end">
        {this.text}
      </text>
    );
  }
}
