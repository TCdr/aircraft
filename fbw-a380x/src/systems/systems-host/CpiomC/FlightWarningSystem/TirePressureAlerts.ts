// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isTirePressureAbnormal, TIRE_COUNT } from '@shared/TirePressures';

/*
 * WHEEL TIRE PRESS LO of the A380 FWS: a tire pressure below the minimum, or two tires of one axle at different
 * pressures, with the thresholds of the TPIS (shared/TirePressures isTirePressureAbnormal, the rule the SD WHEEL page
 * uses for its amber pressures). Crew awareness: no procedure line.
 * Indications: single chime, MASTER CAUT, WHEEL SD page; flight phases 3 to 7 and 10 inhibited.
 *
 * The pressures are the TPIS measurements (systems-host Misc/Tpis.ts, L:A380X_TPIS_TIRE_n_PRESSURE). Design choice: all
 * 22 pressures at 0 PSI is no TPIS data yet (the L:vars before the first TPIS update), not 22 flat tires.
 */

export const WHEEL_TIRE_PRESS_LO_ALERT = 320800063;

export const WHEEL_TIRE_PRESS_LO_LEVEL = 2;

export const WHEEL_TIRE_PRESS_LO_PHASE_INHIBITION = [3, 4, 5, 6, 7, 10];

/**
 * @param pressuresPsi the TPIS pressures of tires 1 to 22 (index 0 = tire 1)
 * @param flightPhase the FWS flight phase
 * @returns whether WHEEL TIRE PRESS LO is triggered
 */
export function isWheelTirePressLo(pressuresPsi: readonly number[], flightPhase: number): boolean {
  if (pressuresPsi.every((pressure) => pressure === 0)) {
    return false;
  }
  for (let tire = 1; tire <= TIRE_COUNT; tire++) {
    if (isTirePressureAbnormal(pressuresPsi, tire, flightPhase)) {
      return true;
    }
  }
  return false;
}
