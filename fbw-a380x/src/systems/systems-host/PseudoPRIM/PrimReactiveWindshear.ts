// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer, ReactiveWindshearComputer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

/**
 * Reactive windshear detection of the PRIMs: red WINDSHEAR on both PFDs (L:A32NX_REACTIVE_WINDSHEAR_WARNING).
 * The message flashes for 9 s, then stays steady as long as the windshear is detected (no minimum duration).
 * Pseudo PRIM part, outside the PRIM model. The loss of the function is the FWS alert SURV REACTIVE W/S DET FAULT.
 * Not simulated yet: the aural WINDSHEAR (no sound asset).
 */
export class PrimReactiveWindshear implements Instrument {
  private readonly computer = new ReactiveWindshearComputer(
    ['L:A32NX_PRIM_1_HEALTHY', 'L:A32NX_PRIM_2_HEALTHY', 'L:A32NX_PRIM_3_HEALTHY'],
    0,
    () => this.failuresConsumer.isActive(A380Failure.ReactiveWindshearDetection),
  );

  constructor(private readonly failuresConsumer: FailuresConsumer) {}

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    this.computer.update();
  }
}
