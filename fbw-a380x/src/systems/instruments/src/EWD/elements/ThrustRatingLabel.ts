// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The labels of L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE: 0 none, 1 CLB, 2 MCT, 3 FLX, 4 TOGA, 5 reverse */
const THRUST_LIMIT_TYPE_LABELS = ['', 'CLB', 'MCT', 'FLX', 'TOGA', 'MREV'];

/** L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE of the FLX rating (the FADEC model also uses it for the derated takeoff) */
const FLEX_THRUST_LIMIT_TYPE = 3;

/**
 * The thrust rating mode of the E/WD. A380 FCOM DSC-70-90 THRUST RATING MODE (a380_fcom.txt l.112943-112944): "Derated
 * takeoff thrust rating mode is selected. 6 derated takeoff levels are defined: D04, D08, D12, D16, D20, D24."; DSC-70-20-40
 * MANUAL THRUST ON GROUND (l.111615-111617): "Depending on the selected takeoff thrust ... TOGA , or FLEX , or DERATED, the
 * associated thrust rating mode, T.O , or DOx , or FLEX is displayed". The derated takeoff is the FLX rating of the FADECs
 * with a derate selected (fbw_a380 TakeoffDerate.h).
 * @param thrustLimitType L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE
 * @param takeoffDeratePercent L:A32NX_AIRLINER_TO_DERATE, the thrust reduction of the derate in percent (0 none)
 */
export function thrustRatingModeLabel(thrustLimitType: number, takeoffDeratePercent: number): string {
  if (thrustLimitType === FLEX_THRUST_LIMIT_TYPE && takeoffDeratePercent > 0) {
    return `D${Math.round(takeoffDeratePercent).toString().padStart(2, '0')}`;
  }
  return THRUST_LIMIT_TYPE_LABELS[thrustLimitType] ?? '';
}
