// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

/**
 * Whether the sim NAV 3 radio (the ILS receiver of MMR 1) must be on: off while MMR 1 or its ILS receiver is failed.
 * The Rust MMR shims fail the MMR_n_* data of both receivers, but the FBW module reads NAV 3 directly for PFD 1 and the
 * autoflight.
 * @param isFailureActive whether a flyPad failure is active
 * @returns whether NAV 3 must be on
 */
export function isNav3ReceiverOn(isFailureActive: (failure: number) => boolean): boolean {
  return !isFailureActive(A380Failure.Mmr1) && !isFailureActive(A380Failure.Ils1Receiver);
}

/**
 * Switches the sim NAV 3 radio off while the ILS receiver of MMR 1 is failed (MMR 1 or ILS 1 receiver failure).
 * NAV 4 (MMR 2) has no sim circuit: with MMR 2 failed, PFD 2 still shows the ident, frequency and DME of NAV 4, but
 * no localiser and glideslope (the Rust MMR 2 shim).
 */
export class MmrFailures implements Instrument {
  /** systems.cfg circuit.39 = CIRCUIT_NAV:3 */
  private static readonly NAV_3_MSFS_CIRCUIT = 39;

  /** Time for a circuit toggle to take effect before another one is sent, in milliseconds */
  private static readonly TOGGLE_RETRY_MS = 1000;

  private lastToggleTime = 0;

  constructor(private readonly failuresConsumer: FailuresConsumer) {}

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    const circuit = MmrFailures.NAV_3_MSFS_CIRCUIT;
    const shouldBeOn = isNav3ReceiverOn((failure) => this.failuresConsumer.isActive(failure));
    const isOn = SimVar.GetSimVarValue(`A:CIRCUIT SWITCH ON:${circuit}`, 'bool') > 0;
    const now = Date.now();
    if (shouldBeOn !== isOn && now - this.lastToggleTime >= MmrFailures.TOGGLE_RETRY_MS) {
      this.lastToggleTime = now;
      SimVar.SetSimVarValue('K:ELECTRICAL_CIRCUIT_TOGGLE', 'number', circuit);
    }
  }
}
