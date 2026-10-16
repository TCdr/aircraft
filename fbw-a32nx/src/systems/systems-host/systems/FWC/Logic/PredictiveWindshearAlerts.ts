// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, alertCodes } from './FwcAlertItem';

/*
 * NAV PRED W/S DET FAULT of the A320 FWC (FCOM PRO-ABN-NAV, a320_fcom.txt l.93716-93740): "This alert triggers when the
 * predictive function is lost" (l.93726). Crew awareness (l.93732); STATUS INOP SYS PRED W/S DET (l.93736-93740).
 *
 * The predictive windshear function (PWS) belongs to the weather radar. The A32NX has no PWS model (no W/S AHEAD
 * alerts): the function is lost by the flyPad failure "Weather radar predictive windshear (PWS)" (34120, TS only).
 * Design choice: the PWS switch OFF is the PRED W/S OFF memo, not a loss, so it gives no fault.
 */

/**
 * The flight phase inhibition, from the figure of the FCOM PDF ("A320 Neo FCOM_1.pdf", PRO-ABN-NAV P 139/154,
 * page 5673): 3, 4, 5, 8.
 */
export const PRED_WS_DET_FAULT_PHASE_INHIBITION = [3, 4, 5, 8];

/** The alert key of NAV PRED W/S DET FAULT, the first digits of its EwdMessages code */
export const PRED_WS_DET_FAULT_KEY = '3400900';

/** The STATUS code of INOP SYS PRED W/S DET (StatusMessages) */
export const PRED_WS_DET_STATUS_CODE = '340300035';

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

/** NAV PRED W/S DET FAULT STATUS (l.93736-93740): INOP SYS PRED W/S DET */
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
    [PRED_WS_DET_FAULT_KEY]: {
      flightPhaseInhib: PRED_WS_DET_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.predWsDetFault,
      whichCodeToReturn: () => [0],
      codesToReturn: alertCodes(PRED_WS_DET_FAULT_KEY, 1),
      memoInhibit: () => false,
      failure: 1,
      sysPage: EcamSysPage.NONE,
      side: 'LEFT',
      inopSys: () => predWsDetFaultStatus().inopSys,
      statusInfo: () => predWsDetFaultStatus().left,
    },
  };
}
