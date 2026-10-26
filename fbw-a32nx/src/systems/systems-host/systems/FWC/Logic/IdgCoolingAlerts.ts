// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { FwcAlertItem, awarenessItem } from './FwcAlertItem';

/*
 * FUEL IDG 1(2) COOL FAULT of the A320 FWC: equipment of the fuel recirculation command, which cools the IDG oil with
 * fuel, is failed (flyPad failure, A320Failure 28018/28019). Crew awareness, maintenance action due, no STATUS.
 * Shown in phases 1 and 10 only. The systems WASM (fuel/fuel_recirculation.rs) keeps the fuel return valve closed
 * with the failure, so the IDG oil is no longer cooled with fuel.
 */

export const IdgCoolingAlertKeys = { coolFault: ['2800260', '2800261'] } as const;

const IDG_COOL_FAULT_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 8, 9];

const IDG_COOLING_FAILURES = [A320Failure.Idg1FuelCoolingCommand, A320Failure.Idg2FuelCoolingCommand];

/** The part of the failures consumer the alerts use */
export type IdgCoolingFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

export class IdgCoolingAlerts {
  private readonly coolFault = [Subject.create(false), Subject.create(false)];

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: IdgCoolingFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures, called once by the PseudoFWC init */
  init(): void {
    for (const failure of IDG_COOLING_FAILURES) {
      this.failuresConsumer.register(failure);
    }
  }

  update(): void {
    this.failuresConsumer.update();
    IDG_COOLING_FAILURES.forEach((failure, idg) => this.coolFault[idg].set(this.failuresConsumer.isActive(failure)));
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [IdgCoolingAlertKeys.coolFault[0]]: awarenessItem(
      IdgCoolingAlertKeys.coolFault[0],
      1,
      this.coolFault[0],
      IDG_COOL_FAULT_PHASE_INHIBITION,
    ),
    [IdgCoolingAlertKeys.coolFault[1]]: awarenessItem(
      IdgCoolingAlertKeys.coolFault[1],
      1,
      this.coolFault[1],
      IDG_COOL_FAULT_PHASE_INHIBITION,
    ),
  };
}
