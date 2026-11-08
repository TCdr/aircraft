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
 * Whether the GLS of an MMR is failed: its GLS function or the whole MMR. The FBW module reads the result as
 * L:A32NX_GLS_{1,2}_FAILED and sends no computed GLS data from that MMR.
 * @param isFailureActive whether a flyPad failure is active
 * @param mmr the MMR, 1 or 2
 * @returns whether the GLS of the MMR is failed
 */
export function isGlsFailed(isFailureActive: (failure: number) => boolean, mmr: 1 | 2): boolean {
  return mmr === 1
    ? isFailureActive(A380Failure.Mmr1GlsFunction) || isFailureActive(A380Failure.Mmr1)
    : isFailureActive(A380Failure.Mmr2GlsFunction) || isFailureActive(A380Failure.Mmr2);
}

/**
 * Switches the sim NAV 3 radio off while the ILS receiver of MMR 1 is failed (MMR 1 or ILS 1 receiver failure).
 * NAV 4 (MMR 2) has no sim circuit: with MMR 2 failed, PFD 2 still shows the ident, frequency and DME of NAV 4, but
 * no localiser and glideslope (the Rust MMR 2 shim). Publishes the failures of the GLS (L:A32NX_GLS_{1,2}_FAILED,
 * L:A32NX_GBAS_STATION_FAILED).
 */
export class MmrFailures implements Instrument {
  /** systems.cfg circuit.39 = CIRCUIT_NAV:3 */
  private static readonly NAV_3_MSFS_CIRCUIT = 39;

  /** Time for a circuit toggle to take effect before another one is sent, in milliseconds */
  private static readonly TOGGLE_RETRY_MS = 1000;

  private lastToggleTime = 0;

  private readonly publishedGlsFailed: (boolean | undefined)[] = [undefined, undefined];

  private publishedGbasStationFailed: boolean | undefined;

  constructor(private readonly failuresConsumer: FailuresConsumer) {}

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    this.publishGlsFailures();

    const circuit = MmrFailures.NAV_3_MSFS_CIRCUIT;
    const shouldBeOn = isNav3ReceiverOn((failure) => this.failuresConsumer.isActive(failure));
    const isOn = SimVar.GetSimVarValue(`A:CIRCUIT SWITCH ON:${circuit}`, 'bool') > 0;
    const now = Date.now();
    if (shouldBeOn !== isOn && now - this.lastToggleTime >= MmrFailures.TOGGLE_RETRY_MS) {
      this.lastToggleTime = now;
      SimVar.SetSimVarValue('K:ELECTRICAL_CIRCUIT_TOGGLE', 'number', circuit);
    }
  }

  private publishGlsFailures(): void {
    for (const mmr of [1, 2] as const) {
      const failed = isGlsFailed((failure) => this.failuresConsumer.isActive(failure), mmr);
      if (failed !== this.publishedGlsFailed[mmr - 1]) {
        this.publishedGlsFailed[mmr - 1] = failed;
        SimVar.SetSimVarValue(`L:A32NX_GLS_${mmr}_FAILED`, 'bool', failed);
      }
    }
    const stationFailed = this.failuresConsumer.isActive(A380Failure.GbasGroundStation);
    if (stationFailed !== this.publishedGbasStationFailed) {
      this.publishedGbasStationFailed = stationFailed;
      SimVar.SetSimVarValue('L:A32NX_GBAS_STATION_FAILED', 'bool', stationFailed);
    }
  }
}
