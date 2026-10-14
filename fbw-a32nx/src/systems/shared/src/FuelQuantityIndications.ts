// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The boxed fuel quantity indications of the E/WD and of the SD FUEL page, A320 FCOM DSC-28-20 (transfer valve
 * variant of the centre tank):
 * - FUEL QUANTITY - BOXED INDICATIONS (a320_fcom.txt l.43219-43223): "The outer indication is boxed amber, if both
 *   transfer valves fail to open when the inner is at low level. The center tank indication is boxed amber, if both
 *   center tank transfer valves fail in the closed position."
 * - E/WD TOTAL FUEL INDICATION (l.43341-43345): "A half amber box appears around FOB, when the displayed quantity is not
 *   all usable (intercell transfer valve failure or both center tank transfer valves fail in the closed position)."
 * - SD FUEL page FOB (l.43275-43278): "The indication is half-boxed in amber, if: Center tank pumps fail, or are switched
 *   OFF. Both transfer valves fail to open, when the inner tank is at low level. Any ACT is not usable." (the pump line
 *   is the centre tank pump variant; this aircraft has transfer valves, no ACT).
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
