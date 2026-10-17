// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The oxygen bottle pressure thresholds of the A380, shared by the FWS oxygen alerts (systems-host OxygenAlerts.ts) and
 * the SD DOOR/OXY page (instruments SD Doors/elements/OxygenIndication.ts).
 */

/** The cockpit bottle low pressure (OXY CKPT BOTTLE PRESS LO alert and the SD low pressure indication) */
export const CKPT_BOTTLE_LOW_PRESSURE_PSI = 350;

/** The cabin bottle low pressure before one engine starts (alert and SD indication) */
export const CABIN_BOTTLE_LOW_PRESSURE_BEFORE_ENGINE_START_PSI = 800;

/** On ground only, the SD DOOR/OXY cabin oxygen pressure gets the amber half-frame below this pressure */
export const CABIN_BOTTLE_DISPATCH_MINIMUM_PRESSURE_PSI = 1600;

/**
 * The minimum cabin bottle pressure of the EMERGENCY DESCENT profile (1 min at FL 430, emergency descent from FL 430 to
 * FL 100 at 5 500 ft/min), by number of cabin masks in use. OXY CABIN BOTTLE PRESS LO triggers below the pressure
 * needed for an emergency descent with the real number of cabin occupants.
 */
const EMERGENCY_DESCENT_MINIMUM_PRESSURE: readonly [number, number][] = [
  [100, 286],
  [200, 469],
  [300, 649],
  [400, 827],
  [500, 1003],
  [600, 1178],
  [700, 1352],
  [800, 1526],
];

/**
 * The minimum cabin bottle pressure for the cabin occupants, interpolated in the table above. The aircraft computes
 * the occupants from the FMS passenger number.
 * Design choice: below 100 or above 800 occupants the first or last value of the table applies.
 * @param cabinOccupants the number of passengers of the FMS
 */
export function cabinOxygenMinimumPressurePsi(cabinOccupants: number): number {
  const table = EMERGENCY_DESCENT_MINIMUM_PRESSURE;
  if (cabinOccupants <= table[0][0]) {
    return table[0][1];
  }
  for (let i = 1; i < table.length; i++) {
    const [occupants, pressure] = table[i];
    if (cabinOccupants <= occupants) {
      const [previousOccupants, previousPressure] = table[i - 1];
      const ratio = (cabinOccupants - previousOccupants) / (occupants - previousOccupants);
      return previousPressure + ratio * (pressure - previousPressure);
    }
  }
  return table[table.length - 1][1];
}

/**
 * The cabin bottle low pressure threshold: the occupants' emergency descent minimum once one engine runs, 800 PSI
 * before.
 * @param oneEngineRunning at least one engine runs
 * @param fmsPassengers the FMS passenger number
 */
export function cabinBottleLowPressurePsi(oneEngineRunning: boolean, fmsPassengers: number): number {
  return oneEngineRunning
    ? cabinOxygenMinimumPressurePsi(fmsPassengers)
    : CABIN_BOTTLE_LOW_PRESSURE_BEFORE_ENGINE_START_PSI;
}
