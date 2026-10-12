// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, SimVarPublisher, SimVarValueType } from '@microsoft/msfs-sdk';

export interface ReactiveWindshearSimVars {
  /** The reactive windshear warning of the A320 FACs / A380 PRIMs (red WINDSHEAR on the PFDs) */
  reactiveWindshearWarning: boolean;
}

/** The reactive windshear warning (shared ReactiveWindshearDetection, run by each aircraft's systems host). */
export class ReactiveWindshearPublisher extends SimVarPublisher<ReactiveWindshearSimVars> {
  constructor(bus: EventBus) {
    super(
      new Map([
        ['reactiveWindshearWarning', { name: 'L:A32NX_REACTIVE_WINDSHEAR_WARNING', type: SimVarValueType.Bool }],
      ]),
      bus,
    );
  }
}
