// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, awarenessItem } from './FwcAlertItem';

/*
 * NAV PRED W/S DET FAULT of the A320 FWC: triggers when the predictive function is lost. Crew awareness; STATUS INOP
 * SYS PRED W/S DET.
 *
 * The predictive windshear function (PWS) belongs to the weather radar. The A32NX has no PWS model (no W/S AHEAD
 * alerts): the function is lost by the flyPad failure "Weather radar predictive windshear (PWS)" (34120, TS only).
 * Design choice: the PWS switch OFF is the PRED W/S OFF memo, not a loss, so it gives no fault.
 */

/** The flight phase inhibition: 3, 4, 5, 8 */
export const PRED_WS_DET_FAULT_PHASE_INHIBITION = [3, 4, 5, 8];

/** The alert key of NAV PRED W/S DET FAULT, the first digits of its EwdMessages code */
export const PRED_WS_DET_FAULT_KEY = '3400900';

/** The STATUS code of INOP SYS PRED W/S DET (StatusMessages) */
const PRED_WS_DET_STATUS_CODE = '340300035';

/** The data of the alert */
export interface PredictiveWindshearAlertInputs {
  /** The flyPad failure of the predictive windshear function is active */
  readonly predictiveWindshearFailed: boolean;
}

/**
 * NAV PRED W/S DET FAULT: the predictive windshear function is lost.
 * @param inputs the state of the function
 * @returns whether the alert is active (before its flight phase inhibition)
 */
export function predWsDetFaultAlert(inputs: PredictiveWindshearAlertInputs): boolean {
  return inputs.predictiveWindshearFailed;
}

/** NAV PRED W/S DET FAULT STATUS: INOP SYS PRED W/S DET */
export function predWsDetFaultStatus(): StatusLines {
  return { left: [], inopSys: [PRED_WS_DET_STATUS_CODE] };
}

/** The part of the failures consumer this alert uses */
export type PredictiveWindshearFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** NAV PRED W/S DET FAULT: reads its failure, keeps its state and gives the item the PseudoFWC adds to its alerts */
export class PredictiveWindshearAlerts {
  private readonly predWsDetFault = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: PredictiveWindshearFailuresSource = new FailuresConsumer()) {}

  /** Registers the failure, called once by the PseudoFWC init */
  init(): void {
    this.failuresConsumer.register(A320Failure.WxrPredictiveWindshear);
  }

  update(): void {
    this.failuresConsumer.update();
    this.predWsDetFault.set(
      predWsDetFaultAlert({
        predictiveWindshearFailed: this.failuresConsumer.isActive(A320Failure.WxrPredictiveWindshear),
      }),
    );
  }

  /** The alert item, by key, for the PseudoFWC ewdMessageFailures: crew awareness (level 1), no SD page */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [PRED_WS_DET_FAULT_KEY]: awarenessItem(
      PRED_WS_DET_FAULT_KEY,
      1,
      this.predWsDetFault,
      PRED_WS_DET_FAULT_PHASE_INHIBITION,
      () => [0],
      predWsDetFaultStatus,
    ),
  };
}
