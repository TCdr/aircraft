// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { MsfsComCircuitSwitch, RmpSide, rmpFailedVar } from '@shared/communications/RadioCommunicationLogic';

/** The part of the failures consumer this system uses. */
export type RadioFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** A VHF transceiver and the MSFS COM radio circuit it drives. */
interface VhfTransceiver {
  failure: number;
  /** The systems.cfg CIRCUIT_COM:n circuit index of this transceiver. */
  msfsCircuit: number;
  circuitSwitch: MsfsComCircuitSwitch;
}

/**
 * Applies the ATA 23 radio communication failures (RMP 1/2, VHF 1/2/3) of the A32NX.
 *
 * - RMP 1/2: publishes L:A32NX_RMP_{L,R}_FAILED. The RMP instrument then blanks both frequency displays and stops
 *   reacting to its keys and knobs, the model behaviours switch its green key lights and SEL off (A320 FCOM DSC-23-60
 *   failure cases, a320_fcom.txt:36229-36231). The other RMP can still tune every VHF (FCOM DSC-23-10-20,
 *   a320_fcom.txt:35042 "If one RMP fails, the remaining one controls all the VHF transceivers").
 *   As with an RMP switched off, a NAV key left on still holds the FMGC navaid tuning (NavaidTuner reads the NAV key
 *   only; that code is shared with the A380X).
 * - VHF 1/2/3: switches the MSFS COM 1/2/3 circuit off, so the radio neither receives nor transmits. Its supply stays
 *   with the electrical system (systems.cfg: COM 1 on DC ESS, COM 2 on DC 2, COM 3 on DC 1).
 *
 * RMP 3 (optional, overhead panel) is not modelled in the A32NX cockpit, and the audio control panels/AMU have no
 * simulated audio channel to fail (the MSFS radios have a single listener), so neither has a failure here.
 */
export class RadioCommunicationFailures implements Instrument {
  private readonly rmps: { side: RmpSide; failure: number; failedVar: string; published: boolean | undefined }[] = [
    { side: 'L', failure: A320Failure.RadioManagementPanel1, failedVar: rmpFailedVar('L'), published: undefined },
    { side: 'R', failure: A320Failure.RadioManagementPanel2, failedVar: rmpFailedVar('R'), published: undefined },
  ];

  private readonly vhfs: VhfTransceiver[] = [
    { failure: A320Failure.Vhf1, msfsCircuit: 36, circuitSwitch: new MsfsComCircuitSwitch() },
    { failure: A320Failure.Vhf2, msfsCircuit: 38, circuitSwitch: new MsfsComCircuitSwitch() },
    { failure: A320Failure.Vhf3, msfsCircuit: 40, circuitSwitch: new MsfsComCircuitSwitch() },
  ];

  /**
   * @param failuresConsumer The failures consumer.
   * @param now The clock used to space the circuit toggles, in milliseconds.
   */
  constructor(
    private readonly failuresConsumer: RadioFailuresSource = new FailuresConsumer(),
    private readonly now: () => number = Date.now,
  ) {}

  /** @inheritdoc */
  public init(): void {
    for (const rmp of this.rmps) {
      this.failuresConsumer.register(rmp.failure);
    }
    for (const vhf of this.vhfs) {
      this.failuresConsumer.register(vhf.failure);
    }
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.failuresConsumer.update();

    for (const rmp of this.rmps) {
      const failed = this.failuresConsumer.isActive(rmp.failure);
      if (failed !== rmp.published) {
        rmp.published = failed;
        SimVar.SetSimVarValue(rmp.failedVar, 'bool', failed);
      }
    }

    const nowMs = this.now();
    for (const vhf of this.vhfs) {
      const shouldBeOn = !this.failuresConsumer.isActive(vhf.failure);
      const isOn = SimVar.GetSimVarValue(`A:CIRCUIT SWITCH ON:${vhf.msfsCircuit}`, 'bool') > 0;
      if (vhf.circuitSwitch.update(shouldBeOn, isOn, nowMs)) {
        SimVar.SetSimVarValue('K:ELECTRICAL_CIRCUIT_TOGGLE', 'number', vhf.msfsCircuit);
      }
    }
  }
}
