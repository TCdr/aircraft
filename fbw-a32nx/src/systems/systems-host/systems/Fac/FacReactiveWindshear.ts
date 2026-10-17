// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { ReactiveWindshearComputer } from '@flybywiresim/fbw-sdk';

/**
 * Reactive windshear detection of the FACs: red WINDSHEAR on both PFDs (L:A32NX_REACTIVE_WINDSHEAR_WARNING).
 * The warning stays on both PFDs for at least 15 s. Not simulated yet: the aural WINDSHEAR (no sound asset). The loss
 * of the function is the FWC alert AUTO FLT REAC W/S DET FAULT (FWC/Logic/ReactiveWindshearAlerts).
 */
export class FacReactiveWindshear implements Instrument {
  /** The minimum display time of the warning */
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
