// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { TakeoffDerated, TakeoffPowerSetting } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';

/**
 * The DOx derated takeoff the MFD PERF T.O panel gives the FADECs. A380 FCOM DSC-70-20-40 THRUST RATING LIMIT
 * (a380_fcom.txt l.111561-111568): "DOx : Derated takeoff mode. The DOx mode reduces the maximum thrust at takeoff. 6
 * derated takeoff levels are defined: DO4 , DO8 , D12 , D16 , D20 , D24 . Each level reduces the maximum thrust from 4 %
 * up to 24 %. ... The flight crew can select the derated takeoff level via the T.O panel of the FMS ACTIVE/PERF page."
 * The MFD DERATED list (DSC-22-FMS-20-30 l.37652-37655): "The list may have maximum 9 derated levels. The number of
 * available thrust levels depends on the selected engine type": the six of the engine chapter.
 */

/** The labels of the MFD DERATED list, in the order of TakeoffDerated */
export const TAKEOFF_DERATE_LEVELS = ['D04', 'D08', 'D12', 'D16', 'D20', 'D24'];

/** The thrust reduction of one level, in percent (D04 = 4 % ... D24 = 24 %) */
const THRUST_REDUCTION_PERCENT_PER_LEVEL = 4;

/** L:A32NX_AIRLINER_TO_DERATE: the thrust reduction in percent of the selected derate, 0 for no derate */
export const TAKEOFF_DERATE_LVAR = 'L:A32NX_AIRLINER_TO_DERATE';

/**
 * @param powerSetting the takeoff thrust selected on the T.O panel (TOGA, FLEX, DERATED)
 * @param derated the derated level of the T.O panel
 * @returns the thrust reduction in percent the FADECs apply (0 unless DERATED is selected)
 */
export function takeoffDerateThrustReduction(
  powerSetting: TakeoffPowerSetting | null | undefined,
  derated: TakeoffDerated | null | undefined,
): number {
  if (powerSetting !== TakeoffPowerSetting.DERATED || derated === null || derated === undefined) {
    return 0;
  }
  return (derated + 1) * THRUST_REDUCTION_PERCENT_PER_LEVEL;
}

/**
 * @param thrustReduction a thrust reduction in percent (4 for D04 ... 24 for D24)
 * @returns its derated level, or null when it is not one of the levels
 */
export function takeoffDeratedOfThrustReduction(thrustReduction: number | null | undefined): TakeoffDerated | null {
  if (thrustReduction === null || thrustReduction === undefined) {
    return null;
  }
  const level = thrustReduction / THRUST_REDUCTION_PERCENT_PER_LEVEL - 1;
  return Number.isInteger(level) && level >= 0 && level < TAKEOFF_DERATE_LEVELS.length ? level : null;
}

/** Writes the derate of the active flight plan for the FADECs (L:A32NX_AIRLINER_TO_DERATE). */
export function writeTakeoffDerate(
  powerSetting: TakeoffPowerSetting | null | undefined,
  derated: TakeoffDerated | null | undefined,
): void {
  SimVar.SetSimVarValue(TAKEOFF_DERATE_LVAR, 'Number', takeoffDerateThrustReduction(powerSetting, derated));
}

/**
 * Which of the T.O panel thrust options (TOGA, FLEX, DERATED, in that order) are disabled. The crew can select any of
 * the three before takeoff (DERATED included, its level typed in or picked from the list); all three close with the
 * rest of the T.O panel once the takeoff starts.
 * @param toPanelInactive true when the T.O panel no longer accepts entries (takeoff phase or later on the active plan)
 * @returns the disabled state of TOGA, FLEX and DERATED
 */
export function takeoffThrustOptionsDisabled(toPanelInactive: boolean): boolean[] {
  return [toPanelInactive, toPanelInactive, toPanelInactive];
}
