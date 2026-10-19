// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FWS engine thrust alerts:
 *
 * - ENG 1(2)(3)(4) THRUST LOSS: an erroneous but valid THR calculation; the FADEC detects it when the maximum THR of
 *   the engine is 10 % lower than the maximum THR of at least two other engines. Amber caution (MASTER CAUT, SC).
 * - ENG T.O THRUST DISAGREE: the FADECs do not all have the same takeoff mode (derate, flex or TOGA). Amber caution
 *   (MASTER CAUT, SC), crew awareness only (no procedure line).
 *
 * The failures that make them possible (flyPad ATA 73) act on the FADEC models of the fbw WASM (FadecThrustFailures.h),
 * which send each FADEC's maximum THR (L:A32NX_ENGINE_n_FADEC_MAX_THR, percent) and take-off mode
 * (L:A32NX_ENGINE_n_FADEC_TAKEOFF_MODE: 0 TOGA, 1 FLEX). FBW has no derated take-off.
 * Design choice: on the aircraft the FADEC detects the thrust loss from the maximum THR of the other engines; the
 * comparison of the four maximum THR is made here, from the values each FADEC sends.
 */

/** ENG THRUST LOSS: shown in phase 3 only */
export const THRUST_LOSS_PHASE_INHIBITION = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** ENG T.O THRUST DISAGREE: shown in phases 2 and 11 only */
export const TO_THRUST_DISAGREE_PHASE_INHIBITION = [1, 3, 4, 5, 6, 7, 8, 9, 10, 12];

/** 10 % lower: the max THR of the engine is at most 90 % of the max THR of the other engine */
const THRUST_LOSS_MAX_THR_RATIO = 0.9;

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

/**
 * ENG THRUST LOCKED: the thrust is frozen on one or more engines after a failure or an involuntary A/THR disconnection,
 * until the thrust levers move. The failure case: a FADEC that reverts to the DEGRADED (N1) mode keeps the thrust of the
 * reversion (L:A32NX_ENGINE_n_FADEC_THRUST_FROZEN, fbw WASM FadecDegradedMode.h).
 * @param athrThrustLock the A/THR shows THR LK
 * @param fadecThrustFrozen the thrust each FADEC keeps frozen, index 0 = engine 1
 */
export function isEngineThrustLocked(athrThrustLock: boolean, fadecThrustFrozen: readonly boolean[]): boolean {
  return athrThrustLock || fadecThrustFrozen.some((frozen) => frozen);
}
