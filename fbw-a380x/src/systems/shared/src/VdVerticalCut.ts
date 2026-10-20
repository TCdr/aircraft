// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ArmedLateralMode, isArmed, LateralMode } from './autopilot';

/**
 * The vertical cut of the VD runs along the aircraft track in a selected lateral mode (or without a lateral mode), when
 * NAV is not armed; along the active flight plan otherwise.
 * @param activeLateralMode the active lateral mode of the FG (L:A32NX_FMA_LATERAL_MODE)
 * @param armedLateralModes the armed lateral modes bitmask (L:A32NX_FMA_LATERAL_ARMED)
 * @returns whether the cut follows the aircraft track
 */
export function isVdCutAlongTrack(activeLateralMode: number, armedLateralModes: number): boolean {
  return (
    (activeLateralMode === LateralMode.NONE ||
      activeLateralMode === LateralMode.HDG ||
      activeLateralMode === LateralMode.TRACK ||
      activeLateralMode === LateralMode.RWY ||
      activeLateralMode === LateralMode.RWY_TRACK ||
      activeLateralMode === LateralMode.GA_TRACK) &&
    !isArmed(armedLateralModes, ArmedLateralMode.NAV)
  );
}
