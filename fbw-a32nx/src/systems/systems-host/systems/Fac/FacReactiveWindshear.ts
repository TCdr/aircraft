// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { ReactiveWindshearComputer } from '@flybywiresim/fbw-sdk';

/**
 * Reactive windshear detection of the FACs: red WINDSHEAR on both PFDs (L:A32NX_REACTIVE_WINDSHEAR_WARNING).
 * A320 FCOM DSC-22_40-40 Windshear detection function (a320_fcom.txt:34221-34228): "provided by the Flight
 * Augmentation Computer (FAC)", the warning is "displayed on both PFDs for a minimum of 15 s". Not simulated yet: the
 * aural WINDSHEAR (no sound asset) and the AUTO FLT REAC W/S DET FAULT alert.
 */
export class FacReactiveWindshear implements Instrument {
  /** a320_fcom.txt:34228 */
  private static readonly MINIMUM_WARNING_DURATION_S = 15;

  private readonly computer = new ReactiveWindshearComputer(
    ['L:A32NX_FAC_1_HEALTHY', 'L:A32NX_FAC_2_HEALTHY'],
    FacReactiveWindshear.MINIMUM_WARNING_DURATION_S,
  );

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    this.computer.update();
  }
}
