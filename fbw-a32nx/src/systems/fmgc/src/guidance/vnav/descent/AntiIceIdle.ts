// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { VnavConfig } from '@fmgc/flightplanning/AircraftConfigTypes';

/**
 * The corrected core speed the FADEC adds to the descent idle for the sensed anti-ice state. The engine and the wing
 * anti-ice bleed air raises the idle, so the descent is flatter than with anti-ice off and the top of descent moves
 * further from the destination.
 *
 * Design choice: the FMS follows the sensed anti-ice state, not a crew entry. The A380X PERF anti-ice setting is a
 * take-off setting that the flight plan predictions do not use, and neither aircraft has a descent anti-ice field.
 */
export function antiIceIdleCn2Increase(
  vnavConfig: Pick<VnavConfig, 'ENGINE_ANTI_ICE_IDLE_CN2_INCREASE' | 'WING_ANTI_ICE_IDLE_CN2_INCREASE'>,
  engineAntiIce: boolean,
  wingAntiIce: boolean,
): number {
  return (
    (engineAntiIce ? vnavConfig.ENGINE_ANTI_ICE_IDLE_CN2_INCREASE : 0) +
    (wingAntiIce ? vnavConfig.WING_ANTI_ICE_IDLE_CN2_INCREASE : 0)
  );
}

/** The engine anti-ice of any engine is on (the A320 has two engines, the A380 four) */
export function readEngineAntiIce(): boolean {
  for (let engine = 1; engine <= 4; engine++) {
    if (SimVar.GetSimVarValue(`ENG ANTI ICE:${engine}`, 'bool') > 0) {
      return true;
    }
  }
  return false;
}

/** The A320 pneumatic system reports the wing anti-ice itself, the A380 has the wing anti-ice switch only */
export function readWingAntiIce(): boolean {
  return (
    SimVar.GetSimVarValue('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON', 'bool') > 0 ||
    SimVar.GetSimVarValue('STRUCTURAL DEICE SWITCH', 'bool') > 0
  );
}

/** The descent profile is frozen in the descent phase, so a change of the anti-ice state has to request a new one */
export function antiIceStateChanged(
  previous: { engineAntiIce: boolean; wingAntiIce: boolean },
  current: { engineAntiIce: boolean; wingAntiIce: boolean },
): boolean {
  return previous.engineAntiIce !== current.engineAntiIce || previous.wingAntiIce !== current.wingAntiIce;
}
