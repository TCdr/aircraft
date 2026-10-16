// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { StatusLines } from './CondStatus';

/*
 * AUTO FLT REAC W/S DET FAULT of the A320 FWC (FCOM PRO-ABN-AUTO_FLT, a320_fcom.txt l.71701-71739): "This alert
 * triggers when the reactive windshear function is lost" (l.71712). Crew awareness; STATUS INOP SYS REAC W/S DET
 * (l.71733-71739).
 *
 * The reactive windshear detection of the FACs (systems-host Fac/FacReactiveWindshear, fbw-common
 * ReactiveWindshearComputer) runs while at least one FAC is healthy, on the data of the first ADIRU that has it valid:
 * true airspeed and angle of attack from the ADRs, ground speed, vertical speed, pitch and roll from the IRs. The
 * function is lost when no FAC is healthy, when the three ADRs are failed or when the three IRs are failed (their FAULT
 * discretes).
 *
 * Design choices:
 * - A loss that another alert already shows with REAC W/S DET in its STATUS gives no REAC W/S DET FAULT: AUTO FLT FAC
 *   1 + 2 FAULT (l.71544) and NAV ADR 1+2+3 FAULT (l.92405). The radio altimeters are left out for the same reason:
 *   their loss is NAV RA 1 AND 2 FAULT (STATUS REAC W/S DET, l.93800) or an ELEC bus alert.
 * - The FWC has no NAV alert for three failed IRs (Logic/AdirsAlerts adirsFaultAlerts): REAC W/S DET FAULT is given then.
 */

/** The flight phase inhibition (FCOM PDF "A320 Neo FCOM_1.pdf", PRO-ABN-AUTO_FLT p 23/42, page 4421): 3, 4, 5, 8 */
export const REAC_WS_DET_FAULT_PHASE_INHIBITION = [3, 4, 5, 8];

/** The E/WD code of AUTO FLT REAC W/S DET FAULT (EwdMessages) */
export const REAC_WS_DET_FAULT_CODE = '220024001';

/** The data of the alert */
export interface ReactiveWindshearAlertInputs {
  /** FAC 1 is healthy, L:A32NX_FAC_1_HEALTHY */
  readonly fac1Healthy: boolean;
  /** FAC 2 is healthy, L:A32NX_FAC_2_HEALTHY */
  readonly fac2Healthy: boolean;
  /** The ADR FAULT discretes of ADR 1, 2, 3 */
  readonly adrFaulty: readonly boolean[];
  /** The IR FAULT discretes of IR 1, 2, 3 */
  readonly irFaulty: readonly boolean[];
  /** AUTO FLT FAC 1+2 FAULT is active */
  readonly fac12FaultAlert: boolean;
  /** NAV ADR 1+2+3 FAULT is active */
  readonly adrTripleFaultAlert: boolean;
}

/**
 * The reactive windshear function is lost: no healthy FAC, or no ADR, or no IR left to give its data.
 * @param inputs the FAC and ADIRS state
 * @returns whether the function is lost
 */
export function reactiveWindshearFunctionLost(inputs: ReactiveWindshearAlertInputs): boolean {
  const allFailed = (units: readonly boolean[]) => units.length > 0 && units.every((failed) => failed);
  return (!inputs.fac1Healthy && !inputs.fac2Healthy) || allFailed(inputs.adrFaulty) || allFailed(inputs.irFaulty);
}

/**
 * AUTO FLT REAC W/S DET FAULT: the function is lost and no other alert already shows the loss (see above).
 * @param inputs the FAC and ADIRS state
 * @returns whether the alert is active (before its flight phase inhibition)
 */
export function reacWsDetFaultAlert(inputs: ReactiveWindshearAlertInputs): boolean {
  return reactiveWindshearFunctionLost(inputs) && !inputs.fac12FaultAlert && !inputs.adrTripleFaultAlert;
}

/** AUTO FLT REAC W/S DET FAULT STATUS (l.71733-71739): INOP SYS REAC W/S DET */
export function reacWsDetFaultStatus(): StatusLines {
  return { left: [], inopSys: ['340300020'] };
}
