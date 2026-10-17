// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { MsfsComCircuitSwitch } from '@shared/communications/RadioCommunicationLogic';
import {
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
 * - ILS 1: also switches the MSFS NAV 3 circuit (systems.cfg circuit.39, CIRCUIT_NAV:3) off, as the FBW module reads
 *   the localiser and glideslope of NAV 3 directly for PFD 1, the ISIS and the autoflight. ILS 2 (NAV 4, no circuit) is
 *   failed in the MMR 2 shim of the systems (navigation/ils.rs) for PFD 2. The FWC shows NAV ILS 1(2)(1+2) FAULT.
 */
export class NavigationReceiverFailures implements Instrument {
  /** systems.cfg circuit.39 = CIRCUIT_NAV:3, the sim radio of the MMR 1 ILS receiver */
  private static readonly ILS_1_MSFS_CIRCUIT = 39;

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
    ] as [NavigationReceiverKind, NavigationReceiverIndex, number][]
  ).map(([kind, index, failure]) => ({
    kind,
    index,
    failure,
    failedVar: navigationReceiverFailedVar(kind, index),
    published: undefined,
  }));

  private readonly ils1CircuitSwitch = new MsfsComCircuitSwitch();

  /**
   * @param failuresConsumer The failures consumer.
   * @param now The clock used to space the circuit toggles, in milliseconds.
   */
  constructor(
    private readonly failuresConsumer: NavigationReceiverFailuresSource = new FailuresConsumer(),
    private readonly now: () => number = Date.now,
  ) {}

  /** @inheritdoc */
  public init(): void {
    for (const receiver of this.receivers) {
      this.failuresConsumer.register(receiver.failure);
    }
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

    const circuit = NavigationReceiverFailures.ILS_1_MSFS_CIRCUIT;
    const shouldBeOn = !this.failuresConsumer.isActive(A320Failure.Ils1Receiver);
    const isOn = SimVar.GetSimVarValue(`A:CIRCUIT SWITCH ON:${circuit}`, 'bool') > 0;
    if (this.ils1CircuitSwitch.update(shouldBeOn, isOn, this.now())) {
      SimVar.SetSimVarValue('K:ELECTRICAL_CIRCUIT_TOGGLE', 'number', circuit);
    }
  }
}
