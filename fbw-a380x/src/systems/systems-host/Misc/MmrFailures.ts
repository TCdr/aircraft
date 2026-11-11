// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

/**
 * Whether the ILS of an MMR is failed: its ILS receiver or the whole MMR. The FBW module reads the result as
 * L:A32NX_ILS_{1,2}_FAILED and sends failure warning on the ILS bus of that MMR, so that the flight guidance flies the other one.
 * @param isFailureActive whether a flyPad failure is active
 * @param mmr the MMR, 1 or 2
 * @returns whether the ILS of the MMR is failed
 */
export function isIlsFailed(isFailureActive: (failure: number) => boolean, mmr: 1 | 2): boolean {
  return mmr === 1
    ? isFailureActive(A380Failure.Ils1Receiver) || isFailureActive(A380Failure.Mmr1)
    : isFailureActive(A380Failure.Ils2Receiver) || isFailureActive(A380Failure.Mmr2);
}

/**
 * Whether the GLS of an MMR is failed: its GLS function or the whole MMR. The FBW module reads the result as
 * L:A32NX_GLS_{1,2}_FAILED and sends failure warning on the GLS words of that MMR.
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
 * Whether the FLS of an MMR is failed: the whole MMR. The failure of its FLS function alone only raises its alert and leaves
 * the beam. The FBW module reads the result as L:A32NX_FLS_{1,2}_FAILED and sends failure warning on the FLS words of that
 * MMR, so that the flight guidance flies the other one.
 * @param isFailureActive whether a flyPad failure is active
 * @param mmr the MMR, 1 or 2
 * @returns whether the FLS of the MMR is failed
 */
export function isFlsFailed(isFailureActive: (failure: number) => boolean, mmr: 1 | 2): boolean {
  return isFailureActive(mmr === 1 ? A380Failure.Mmr1 : A380Failure.Mmr2);
}

/**
 * Publishes the failures of the ILS, the GLS and the FLS of each MMR (L:A32NX_ILS_{1,2}_FAILED, L:A32NX_GLS_{1,2}_FAILED,
 * L:A32NX_FLS_{1,2}_FAILED) and of the GBAS ground station (L:A32NX_GBAS_STATION_FAILED). The sim NAV 3 radio stays on
 * with MMR 1 failed: the FBW module builds the ILS buses of both sides from it and marks the bus of the failed MMR
 * itself. The Rust MMR shims fail the MMR_n_* data of the PFDs; the sim keeps decoding the station, so the PFD of the
 * failed side blanks the ident, frequency and DME itself.
 */
export class MmrFailures implements Instrument {
  private readonly publishedIlsFailed: (boolean | undefined)[] = [undefined, undefined];

  private readonly publishedGlsFailed: (boolean | undefined)[] = [undefined, undefined];

  private readonly publishedFlsFailed: (boolean | undefined)[] = [undefined, undefined];

  private publishedGbasStationFailed: boolean | undefined;

  constructor(private readonly failuresConsumer: FailuresConsumer) {}

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    this.publishReceiverFailures();
  }

  private publishReceiverFailures(): void {
    const isActive = (failure: number) => this.failuresConsumer.isActive(failure);
    for (const mmr of [1, 2] as const) {
      const ilsFailed = isIlsFailed(isActive, mmr);
      if (ilsFailed !== this.publishedIlsFailed[mmr - 1]) {
        this.publishedIlsFailed[mmr - 1] = ilsFailed;
        SimVar.SetSimVarValue(`L:A32NX_ILS_${mmr}_FAILED`, 'bool', ilsFailed);
      }
      const glsFailed = isGlsFailed(isActive, mmr);
      if (glsFailed !== this.publishedGlsFailed[mmr - 1]) {
        this.publishedGlsFailed[mmr - 1] = glsFailed;
        SimVar.SetSimVarValue(`L:A32NX_GLS_${mmr}_FAILED`, 'bool', glsFailed);
      }
      const flsFailed = isFlsFailed(isActive, mmr);
      if (flsFailed !== this.publishedFlsFailed[mmr - 1]) {
        this.publishedFlsFailed[mmr - 1] = flsFailed;
        SimVar.SetSimVarValue(`L:A32NX_FLS_${mmr}_FAILED`, 'bool', flsFailed);
      }
    }
    const stationFailed = this.failuresConsumer.isActive(A380Failure.GbasGroundStation);
    if (stationFailed !== this.publishedGbasStationFailed) {
      this.publishedGbasStationFailed = stationFailed;
      SimVar.SetSimVarValue('L:A32NX_GBAS_STATION_FAILED', 'bool', stationFailed);
    }
  }
}
