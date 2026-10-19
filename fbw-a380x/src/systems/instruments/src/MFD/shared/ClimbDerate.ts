// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ClimbDerated } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';

// The derated climb the MFD PERF CLB panel gives the FADECs. The MFD DERATED CLB list holds NONE and up to five levels,
// those the engine defines: this engine has three, DCL1 to DCL3. The FADECs apply the level at the CL detent and cancel
// it when the thrust levers leave the CL detent (L:A32NX_FADEC_DERATED_CLIMB_LEVEL).

/** The labels of the MFD DERATED CLB list, in the order of ClimbDerated */
export const CLIMB_DERATE_LEVELS = ['NONE', '01', '02', '03'];

/** L:A32NX_AIRLINER_CLIMB_DERATE: the derated climb level 1 to 3 of the active flight plan, 0 for NONE */
export const CLIMB_DERATE_LVAR = 'L:A32NX_AIRLINER_CLIMB_DERATE';

/**
 * @param derated the DERATED CLB entry of the flight plan
 * @returns the level the FADECs receive, 0 for NONE (also for no entry or a level the engine does not have)
 */
export function climbDerateLevel(derated: ClimbDerated | null | undefined): number {
  if (derated === null || derated === undefined || derated < 0 || derated >= CLIMB_DERATE_LEVELS.length) {
    return 0;
  }
  return derated;
}

/** Writes the DERATED CLB entry of the active flight plan for the FADECs when it changes. */
export class ClimbDerateOutput {
  private writtenLevel: number | null = null;

  public write(derated: ClimbDerated | null | undefined): void {
    const level = climbDerateLevel(derated);
    if (level !== this.writtenLevel) {
      SimVar.SetSimVarValue(CLIMB_DERATE_LVAR, 'Number', level);
      this.writtenLevel = level;
    }
  }
}
