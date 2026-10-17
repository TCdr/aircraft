// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The boxed fuel quantity indications of the E/WD and of the SD FUEL page (aircraft with centre tank transfer valves):
 * - The outer tank quantity is boxed amber when both transfer valves of the wing fail to open with the inner tank at
 *   low level; the centre tank quantity is boxed amber when both centre tank transfer valves fail closed.
 * - The FOB (E/WD and SD FUEL page) gets a half amber box when some displayed fuel is not usable: an outer transfer
 *   valve failure, or both centre tank transfer valves failed closed. The centre tank pump and ACT conditions of other
 *   aircraft do not apply: this aircraft has transfer valves, no ACT.
 * Inputs (systems host Fuel/FuelPumpsAndValves): L:A32NX_FUEL_L(R)_OUTER_XFR_CLOSED (both outer transfer valves of a wing
 * still closed with the inner tank at low level, confirmed) and L:A32NX_FUEL_CTR_TK_L(R)_XFR_VALVE_FAILED_CLOSED.
 * Not simulated: the FQI degraded mode, so the two dashes across the last two FOB digits never show.
 */
export interface FuelTransferFailures {
  leftOuterXfrClosed: boolean;
  rightOuterXfrClosed: boolean;
  leftCentreXfrFailedClosed: boolean;
  rightCentreXfrFailedClosed: boolean;
}

/**
 * The FOB is half-boxed amber: some displayed fuel is not usable (E/WD and SD FUEL page). The centre tank part is the
 * condition of the boxed centre tank quantity of the SD FUEL page (FuelPumpValveIndications isCentreTankQuantityBoxed).
 */
export function isFuelOnBoardHalfBoxed(failures: FuelTransferFailures): boolean {
  return (
    failures.leftOuterXfrClosed ||
    failures.rightOuterXfrClosed ||
    (failures.leftCentreXfrFailedClosed && failures.rightCentreXfrFailedClosed)
  );
}

/** The outer tank quantity of a wing is boxed amber (SD FUEL page): its two transfer valves failed to open */
export function isOuterTankQuantityBoxed(outerXfrClosed: boolean): boolean {
  return outerXfrClosed;
}
