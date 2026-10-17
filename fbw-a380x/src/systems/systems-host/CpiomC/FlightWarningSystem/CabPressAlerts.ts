// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * CAB PRESS alerts and the RAM AIR memo of the A380X FWS, from the CPIOM B CPCS discrete word (cpiom_b.rs: bit 15
 * EXCESS NEGATIVE DIFF PRESS, bit 16 DIFF PRESS HI, bit 17 DIFF PRESS LO), the FMS landing elevation words and the
 * RAM AIR pb.
 */

/**
 * CAB PRESS EXCESS NEGATIVE DIFF PRESS ends when the cabin differential pressure goes above -0.32 PSI. It triggers
 * below -0.72 PSI, the CPCS bit (cpiom_b.rs FWC_EXCESSIVE_NEGATIVE_DIFF_PRESSURE).
 */
const EXCESS_NEGATIVE_DIFF_PRESS_RESET_PSI = -0.32;

/** The RAM air inlets open only below this differential pressure */
const RAM_AIR_INLETS_MAX_DIFF_PRESS_PSI = 1;

/** The CAB PRESS EXCESS NEGATIVE DIFF PRESS warning: set by the CPCS bit, held until -0.32 PSI is passed. */
export class ExcessNegativeDiffPressMonitor {
  private active = false;

  /**
   * @param cpcsBit the EXCESS NEGATIVE DIFF PRESS bit of the CPCS discrete word (below -0.72 PSI)
   * @param diffPressurePsi the cabin differential pressure, null without a valid value
   * @returns whether the warning is active
   */
  public update(cpcsBit: boolean, diffPressurePsi: number | null): boolean {
    if (cpcsBit) {
      this.active = true;
    } else if (diffPressurePsi === null || diffPressurePsi > EXCESS_NEGATIVE_DIFF_PRESS_RESET_PSI) {
      // Without a valid differential pressure the FWS cannot hold the warning: it ends with the CPCS bit
      this.active = false;
    }
    return this.active;
  }
}

/**
 * CAB PRESS DIFF PRESS HI: in automatic mode, the cabin differential pressure is between 8.92 and 9.2 PSI. The CPCS bit
 * holds the pressure band; the FWS adds the automatic mode.
 * @param cpcsBit the DIFF PRESS HI bit of the CPCS discrete word
 * @param manCabinAltMode the CABIN ALT MODE pb is set to MAN
 * @returns whether the alert condition is true
 */
export function isDiffPressHi(cpcsBit: boolean, manCabinAltMode: boolean): boolean {
  return cpcsBit && !manCabinAltMode;
}

/**
 * The lines of CAB PRESS DIFF PRESS HI: CABIN ALT MODE ... MAN and CABIN ALT TRGT ... AS RQRD when the manual
 * pressurization system is available, EXPECT HI CAB RATE when it is not.
 * @param manualPressAvailable the manual pressurization system is available
 * @returns which of the 3 lines are shown
 */
export function diffPressHiItemsToShow(manualPressAvailable: boolean): boolean[] {
  return [manualPressAvailable, manualPressAvailable, !manualPressAvailable];
}

/**
 * CAB PRESS LDG ELEVN FAULT: the outflow valve controllers get no landing field elevation from the FMS. Both FMS
 * landing elevation words (L:A32NX_FM1/FM2_LANDING_ELEVATION) have no normal value: no destination in the FMS, or no
 * FMS.
 * @param fm1LandingElevationNormal the FM1 landing elevation word is in normal operation
 * @param fm2LandingElevationNormal the FM2 landing elevation word is in normal operation
 * @returns whether the alert condition is true
 */
export function isLdgElevnFault(fm1LandingElevationNormal: boolean, fm2LandingElevationNormal: boolean): boolean {
  return !fm1LandingElevationNormal && !fm2LandingElevationNormal;
}

/**
 * The lines of CAB PRESS LDG ELEVN FAULT: IN DES : CAB ALT REGULATED TO 7000 FT, BELOW 7000 FT : CAB ALT = ACFT ALT,
 * BELOW 7000 FT : AVOID HI DES V/S, when the manual pressurization system is not available. With the manual system
 * available the crew uses the deferred procedure instead (AT TOP OF DESCENT: CABIN ALT MODE MAN, CABIN ALT TRGT LDG
 * ELEVN).
 * @param manualPressAvailable the manual pressurization system is available
 * @returns which of the 3 lines are shown
 */
export function ldgElevnFaultItemsToShow(manualPressAvailable: boolean): boolean[] {
  return [!manualPressAvailable, !manualPressAvailable, !manualPressAvailable];
}

/**
 * The emergency RAM air inlets are open: the RAM AIR pb is ON and the differential pressure is below 1 PSI. Without a
 * valid differential pressure, the pb alone.
 * @param ramAirPbOn the RAM AIR pb is ON
 * @param diffPressurePsi the cabin differential pressure, null without a valid value
 * @returns whether the RAM air inlets are open
 */
export function areRamAirInletsOpen(ramAirPbOn: boolean, diffPressurePsi: number | null): boolean {
  return ramAirPbOn && (diffPressurePsi === null || diffPressurePsi < RAM_AIR_INLETS_MAX_DIFF_PRESS_PSI);
}

/**
 * The RAM AIR memo has two cases: the RAM air inlets open on ground with no engine running, and every other case.
 * Design choice (no colours given for it): as the other two-case memos (ELEC EXT PWR, RAT OUT), the ground case is
 * green and the other cases amber.
 * @param onGround the aircraft is on ground
 * @param anyEngineRunning at least one engine is running
 * @returns 0 for the green memo, 1 for the amber memo
 */
export function ramAirMemoIndex(onGround: boolean, anyEngineRunning: boolean): 0 | 1 {
  return onGround && !anyEngineRunning ? 0 : 1;
}
