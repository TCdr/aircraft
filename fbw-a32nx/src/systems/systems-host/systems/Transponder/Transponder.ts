// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType, Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { isTransponderOperative } from '@shared/TransponderSystem';

/**
 * The two ATC transponders: XPDR 1 on the AC ESS SHED bus, XPDR 2 on AC BUS 2, each with its failure (34050, 34051).
 * Publishes whether each one is failed or unpowered (L:A32NX_XPDR_1_FAILED, L:A32NX_XPDR_2_FAILED). MSFS has one
 * transponder only: the ATC panel behaviour (A32NX_Interior_ATC.xml) drives it as the selected transponder and switches
 * it off (TRANSPONDER STATE off) when the selected one is failed or unpowered; the TCAS goes to standby when both are,
 * the ATC FAIL light comes on when the selected one is, and the FWC raises the NAV ATC/XPDR FAULT alerts.
 */
export class Transponder implements Instrument {
  private readonly failuresConsumer = new FailuresConsumer();

  private readonly acEssShedPowered = RegisteredSimVar.createBoolean('L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED');
  private readonly ac2Powered = RegisteredSimVar.createBoolean('L:A32NX_ELEC_AC_2_BUS_IS_POWERED');

  private readonly xpdr1Failed = Subject.create(false);
  private readonly xpdr2Failed = Subject.create(false);

  /** @inheritdoc */
  init(): void {
    this.failuresConsumer.register(A320Failure.Transponder1);
    this.failuresConsumer.register(A320Failure.Transponder2);

    this.xpdr1Failed.sub((v) => SimVar.SetSimVarValue('L:A32NX_XPDR_1_FAILED', SimVarValueType.Bool, v), true);
    this.xpdr2Failed.sub((v) => SimVar.SetSimVarValue('L:A32NX_XPDR_2_FAILED', SimVarValueType.Bool, v), true);
  }

  /** @inheritdoc */
  onUpdate(): void {
    this.failuresConsumer.update();

    const acEssShed = this.acEssShedPowered.get();
    const ac2 = this.ac2Powered.get();
    const isFailureActive = (failure: number) => this.failuresConsumer.isActive(failure);

    this.xpdr1Failed.set(!isTransponderOperative(1, acEssShed, ac2, isFailureActive));
    this.xpdr2Failed.set(!isTransponderOperative(2, acEssShed, ac2, isFailureActive));
  }
}
