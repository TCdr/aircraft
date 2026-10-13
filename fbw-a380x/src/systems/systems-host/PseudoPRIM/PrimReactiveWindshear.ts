// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { ReactiveWindshearComputer } from '@flybywiresim/fbw-sdk';

/**
 * Reactive windshear detection of the PRIMs: red WINDSHEAR on both PFDs (L:A32NX_REACTIVE_WINDSHEAR_WARNING).
 * A380 FCOM DSC-22-27-20 Reactive windshear detection (a380_fcom.txt:9257-9285): "performed by the PRIMs"; the
 * message "flashes during 9 s, then remains steady, as long as the windshear is detected" (no minimum duration).
 * Pseudo PRIM part, outside the PRIM model. Not simulated yet: the aural WINDSHEAR (no sound asset) and the SURV
 * REACTIVE W/S DET FAULT alert.
 */
export class PrimReactiveWindshear implements Instrument {
  private readonly computer = new ReactiveWindshearComputer(
    ['L:A32NX_PRIM_1_HEALTHY', 'L:A32NX_PRIM_2_HEALTHY', 'L:A32NX_PRIM_3_HEALTHY'],
    0,
  );

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    this.computer.update();
  }
}
