// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The oxygen bottle pressure thresholds of the A380, shared by the FWS oxygen alerts (systems-host OxygenAlerts.ts) and
 * the SD DOOR/OXY page (instruments SD Doors/elements/OxygenIndication.ts).
 */

/**
 * The cockpit bottle low pressure: "The pressure in the cockpit oxygen bottle is below 350 PSI" (OXY CKPT BOTTLE PRESS
 * LO, a380_fcom.txt l.167517); SD: "Low pressure is detected in the oxygen bottles. This occurs, when the pressure is
 * below 350 PSI." (l.93108-93109)
 */
export const CKPT_BOTTLE_LOW_PRESSURE_PSI = 350;

/**
 * "before one engine starts, the alert triggers, if the pressure in the cabin oxygen bottles is below 800 PSI"
 * (l.167434-167435); SD: "before one engine starts, low pressure is detected in the oxygen bottles, if the pressure is
 * below 800 PSI" (l.93508-93509)
 */
export const CABIN_BOTTLE_LOW_PRESSURE_BEFORE_ENGINE_START_PSI = 800;

/**
 * SD DOOR/OXY cabin OXYGEN PRESSURE VALUE: "On ground only, appears with the amber half-frame, if: The pressure is below
 * 1 600 PSI" (A380 FCOM DSC-35-30-20, l.93480-93481)
 */
export const CABIN_BOTTLE_DISPATCH_MINIMUM_PRESSURE_PSI = 1600;

/**
 * The minimum cabin bottle pressure of the EMERGENCY DESCENT profile (1 min at FL 430, emergency descent from FL 430 to
 * FL 100 at 5 500 ft/min), by number of cabin masks in use: A380 FCOM LIM-35 MINIMUM CABIN OXYGEN PRESSURE (2019 FCOM PDF
 * p.6312). OXY CABIN BOTTLE PRESS LO: "below the minimum pressure that is required in order to fly an emergency
 * descent: From 40 000 ft to 10 000 ft for 5 min ... With the real number of cabin occupants" (l.167425-167430).
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
 * The minimum cabin bottle pressure for the cabin occupants, interpolated in the FCOM table.
 * Design choices: "The real number of cabin occupants is computed by using the number of passengers, provided by the
 * FMS" (l.167431): the occupants are the FMS passengers; below 100 or above 800 occupants the first or last value of
 * the table applies.
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
 * The cabin bottle low pressure threshold: the occupants' emergency descent minimum once one engine runs, 800 PSI before
 * (l.167425-167435, SD l.93494-93509).
 * @param oneEngineRunning at least one engine runs
 * @param fmsPassengers the FMS passenger number
 */
export function cabinBottleLowPressurePsi(oneEngineRunning: boolean, fmsPassengers: number): number {
  return oneEngineRunning
    ? cabinOxygenMinimumPressurePsi(fmsPassengers)
    : CABIN_BOTTLE_LOW_PRESSURE_BEFORE_ENGINE_START_PSI;
}
