// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FWS engine thrust alerts (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt):
 *
 * - ENG 1(2)(3)(4) THRUST LOSS, l.173378-173408. l.173384: "A loss of thrust is detected following an erroneous but
 *   valid calculation of the THR parameter"; l.173388-173390: "The FADEC detects a loss of thrust if the maximum THR of
 *   the affected engine is 10 % lower than at least two other engines maximum THR." Lines l.173407-173408:
 *   "THR LEVER 1(2)(3)(4) ... IDLE", "ENG 1(2)(3)(4) MASTER ... OFF". FCOM PDF page 5822: amber caution (MASTER CAUT,
 *   SC), shown in phase 3 only (inhibited in 1, 2 and 4 to 12).
 * - ENG T.O THRUST DISAGREE, l.175054-175070. l.175060: "All FADECs do not have the same takeoff mode, derate, flex or
 *   TOGA."; l.175070: "Crew awareness" (no line). FCOM PDF page 5857: amber caution (MASTER CAUT, SC), shown in phases 2
 *   and 11 only.
 *
 * The failures that make them possible (flyPad ATA 73) act on the FADEC models of the fbw WASM (FadecThrustFailures.h),
 * which send each FADEC's maximum THR (L:A32NX_ENGINE_n_FADEC_MAX_THR, percent) and take-off mode
 * (L:A32NX_ENGINE_n_FADEC_TAKEOFF_MODE: 0 TOGA, 1 FLEX). FBW has no derated take-off.
 * Design choice: the FCOM says the FADEC detects the thrust loss from the maximum THR of the other engines; the comparison
 * of the four maximum THR is made here, from the values each FADEC sends.
 */

/** ENG THRUST LOSS flight phase inhibition (FCOM PDF page 5822): shown in phase 3 only */
export const THRUST_LOSS_PHASE_INHIBITION = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** ENG T.O THRUST DISAGREE flight phase inhibition (FCOM PDF page 5857): shown in phases 2 and 11 only */
export const TO_THRUST_DISAGREE_PHASE_INHIBITION = [1, 3, 4, 5, 6, 7, 8, 9, 10, 12];

/** l.173388-173390: "10 % lower": the max THR of the engine is at most 90 % of the max THR of the other engine */
export const THRUST_LOSS_MAX_THR_RATIO = 0.9;

/** l.173390: "at least two other engines" */
const THRUST_LOSS_MIN_OTHER_ENGINES = 2;

/**
 * ENG n THRUST LOSS: the maximum THR of the engine is 10 % lower than the maximum THR of at least two other engines.
 * @param maxThrPercent the maximum THR each FADEC sends, index 0 = engine 1
 * @param engineIndex the engine, 0 = engine 1
 */
export function isThrustLoss(maxThrPercent: readonly number[], engineIndex: number): boolean {
  const ownMaxThr = maxThrPercent[engineIndex];
  const higherEngines = maxThrPercent.filter(
    // a max THR of 0 is a FADEC that has not sent it yet (fbw WASM not started)
    (otherMaxThr, index) =>
      index !== engineIndex && otherMaxThr > 0 && ownMaxThr <= THRUST_LOSS_MAX_THR_RATIO * otherMaxThr,
  );
  return higherEngines.length >= THRUST_LOSS_MIN_OTHER_ENGINES;
}

/**
 * ENG T.O THRUST DISAGREE: the FADECs do not all have the same take-off mode.
 * @param takeoffModes the take-off mode each FADEC sends (0 TOGA, 1 FLEX), index 0 = FADEC 1
 */
export function isTakeoffThrustDisagree(takeoffModes: readonly number[]): boolean {
  return takeoffModes.some((mode) => mode !== takeoffModes[0]);
}

/** The lines of ENG n THRUST LOSS that are done: THR LEVER n at IDLE, ENG n MASTER OFF */
export function thrustLossItemsChecked(thrustLeverIdle: boolean, engineMasterOn: boolean): boolean[] {
  return [thrustLeverIdle, !engineMasterOn];
}
