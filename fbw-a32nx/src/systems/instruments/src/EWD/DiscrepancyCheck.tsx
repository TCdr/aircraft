// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, DisplayComponent, FSComponent, MappedSubject, ConsumerSubject, VNode } from '@microsoft/msfs-sdk';
import { EwdSimvars } from './shared/EwdSimvarPublisher';
import { DISCREPANCY_CHECK_TEXT, isDiscrepancyCheckVisible } from './EngineIndicationAccuracy';

interface DiscrepancyCheckProps {
  bus: EventBus;
  engine: 1 | 2;
  parameter: 'N1' | 'N2' | 'Egt' | 'FF';
  /** The center of the text, under the value of the parameter */
  x: number;
  y: number;
}

/** The amber CHECK under an E/WD engine parameter with a FADEC-DMC discrepancy */
export class DiscrepancyCheck extends DisplayComponent<DiscrepancyCheckProps> {
  private readonly sub = this.props.bus.getSubscriber<EwdSimvars>();

  private readonly discrepancy = ConsumerSubject.create(
    this.sub.on(`engine${this.props.engine}${this.props.parameter}Discrepancy`).whenChanged(),
    false,
  );

  private readonly dmcSwitchingKnob = ConsumerSubject.create(this.sub.on('dmcSwitchingKnob').whenChanged(), 1);

  private readonly fadecPowered = ConsumerSubject.create(
    this.sub.on(`engine${this.props.engine}Fadec`).whenChanged(),
    false,
  );

  private readonly visibility = MappedSubject.create(
    ([discrepancy, knob, fadecPowered]) =>
      isDiscrepancyCheckVisible(discrepancy, knob, fadecPowered) ? 'visible' : 'hidden',
    this.discrepancy,
    this.dmcSwitchingKnob,
    this.fadecPowered,
  );

  render(): VNode {
    return (
      <text class="Standard Center Amber" x={this.props.x} y={this.props.y} visibility={this.visibility}>
        {DISCREPANCY_CHECK_TEXT}
      </text>
    );
  }
}
