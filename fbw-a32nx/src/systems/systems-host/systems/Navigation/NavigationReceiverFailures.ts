// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import {
  GBAS_STATION_FAILED_VAR,
  NavigationReceiverIndex,
  NavigationReceiverKind,
  navigationReceiverFailedVar,
} from '@shared/navigation/NavigationReceivers';

/** The part of the failures consumer this system uses. */
export type NavigationReceiverFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** A failed receiver and the L:var that tells the displays */
interface ReceiverFailure {
  kind: NavigationReceiverKind;
  index: NavigationReceiverIndex;
  failure: number;
  failedVar: string;
  published: boolean | undefined;
}

/**
 * Applies the ATA 34 radio navigation receiver failures (VOR 1/2, DME 1/2, ADF 1/2, ILS 1/2) of the A32NX.
 *
 * - Every receiver: publishes L:A32NX_{VOR,DME,ADF,ILS}_{1,2}_FAILED. The VOR bus of the NDs (VorBusPublisher) then
 *   drops the signal of that receiver: no bearing pointer, no deviation, no DME distance; the VOR/ADF flags come on, as
 *   when a VOR or ADF receiver fails.
 * - GLS 1/2: publishes L:A32NX_GLS_{1,2}_FAILED from the GLS function failure of that receiver, which then sends failure
 *   warning (GlsReceiver in the FBW module). The ILS of the same receiver is not affected, and the other way round.
 * - GBAS ground station: publishes L:A32NX_GBAS_STATION_FAILED: no GLS channel is valid on either side.
 * - The failed ILS receiver sends failure warning on its own ILS bus (FBW module, from L:A32NX_ILS_{1,2}_FAILED) and the
 *   MMR shims of the systems (navigation/ils.rs) drop its data for the PFDs. The sim NAV 3 radio stays on, as the FBW
 *   module builds the ILS buses of both sides from it. The FWC shows NAV ILS 1(2)(1+2) FAULT.
 */
export class NavigationReceiverFailures implements Instrument {
  private readonly receivers: ReceiverFailure[] = (
    [
      ['VOR', 1, A320Failure.Vor1Receiver],
      ['VOR', 2, A320Failure.Vor2Receiver],
      ['DME', 1, A320Failure.Dme1Receiver],
      ['DME', 2, A320Failure.Dme2Receiver],
      ['ADF', 1, A320Failure.Adf1Receiver],
      ['ADF', 2, A320Failure.Adf2Receiver],
      ['ILS', 1, A320Failure.Ils1Receiver],
      ['ILS', 2, A320Failure.Ils2Receiver],
      ['GLS', 1, A320Failure.Gls1Function],
      ['GLS', 2, A320Failure.Gls2Function],
    ] as [NavigationReceiverKind, NavigationReceiverIndex, number][]
  ).map(([kind, index, failure]) => ({
    kind,
    index,
    failure,
    failedVar: navigationReceiverFailedVar(kind, index),
    published: undefined,
  }));

  private groundStationFailurePublished: boolean | undefined;

  /** @param failuresConsumer The failures consumer. */
  constructor(private readonly failuresConsumer: NavigationReceiverFailuresSource = new FailuresConsumer()) {}

  /** @inheritdoc */
  public init(): void {
    for (const receiver of this.receivers) {
      this.failuresConsumer.register(receiver.failure);
    }
    this.failuresConsumer.register(A320Failure.GbasGroundStation);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.failuresConsumer.update();

    for (const receiver of this.receivers) {
      const failed = this.failuresConsumer.isActive(receiver.failure);
      if (failed !== receiver.published) {
        receiver.published = failed;
        SimVar.SetSimVarValue(receiver.failedVar, 'bool', failed);
      }
    }

    const stationFailed = this.failuresConsumer.isActive(A320Failure.GbasGroundStation);
    if (stationFailed !== this.groundStationFailurePublished) {
      this.groundStationFailurePublished = stationFailed;
      SimVar.SetSimVarValue(GBAS_STATION_FAILED_VAR, 'bool', stationFailed);
    }
  }
}
