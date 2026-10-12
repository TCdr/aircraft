// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * CAB PRESS alerts and the RAM AIR memo of the A380X FWS, from the CPIOM B CPCS discrete word (cpiom_b.rs: bit 15
 * EXCESS NEGATIVE DIFF PRESS, bit 16 DIFF PRESS HI, bit 17 DIFF PRESS LO), the FMS landing elevation words and the
 * RAM AIR pb (A380 FCOM PRO-ABN-ECAM-10-21-30 and DSC-21-10-20).
 */

/**
 * CAB PRESS EXCESS NEGATIVE DIFF PRESS ends "when the cabin differential pressure goes above -0.32 PSI"
 * (a380_fcom.txt l.135258-135259). It triggers below -0.72 PSI (l.135258), the CPCS bit (cpiom_b.rs
 * FWC_EXCESSIVE_NEGATIVE_DIFF_PRESSURE).
 */
export const EXCESS_NEGATIVE_DIFF_PRESS_RESET_PSI = -0.32;

/** "The RAM air inlets only open, if differential pressure is less than one psi." (a380_fcom.txt l.5375) */
export const RAM_AIR_INLETS_MAX_DIFF_PRESS_PSI = 1;

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
 * CAB PRESS DIFF PRESS HI: "In automatic mode, the cabin differential pressure is above 8.92 PSI, and is below 9.2 PSI."
 * (a380_fcom.txt l.134896). The CPCS bit holds the pressure band; the FWS adds the automatic mode.
 * @param cpcsBit the DIFF PRESS HI bit of the CPCS discrete word
 * @param manCabinAltMode the CABIN ALT MODE pb is set to MAN
 * @returns whether the alert condition is true
 */
export function isDiffPressHi(cpcsBit: boolean, manCabinAltMode: boolean): boolean {
  return cpcsBit && !manCabinAltMode;
}

/**
 * The lines of CAB PRESS DIFF PRESS HI (a380_fcom.txt l.134919-134934): CABIN ALT MODE ... MAN and CABIN ALT TRGT ...
 * AS RQRD "If the manual pressurization system is available", EXPECT HI CAB RATE if it is not.
 * @param manualPressAvailable the manual pressurization system is available
 * @returns which of the 3 lines are shown
 */
export function diffPressHiItemsToShow(manualPressAvailable: boolean): boolean[] {
  return [manualPressAvailable, manualPressAvailable, !manualPressAvailable];
}

/**
 * CAB PRESS LDG ELEVN FAULT: "The outflow valve controllers do not receive the landing field elevation from the FMS."
 * (a380_fcom.txt l.135437). Both FMS landing elevation words (L:A32NX_FM1/FM2_LANDING_ELEVATION) have no normal value:
 * no destination in the FMS, or no FMS.
 * @param fm1LandingElevationNormal the FM1 landing elevation word is in normal operation
 * @param fm2LandingElevationNormal the FM2 landing elevation word is in normal operation
 * @returns whether the alert condition is true
 */
export function isLdgElevnFault(fm1LandingElevationNormal: boolean, fm2LandingElevationNormal: boolean): boolean {
  return !fm1LandingElevationNormal && !fm2LandingElevationNormal;
}

/**
 * The lines of CAB PRESS LDG ELEVN FAULT (a380_fcom.txt l.135466-135473): IN DES : CAB ALT REGULATED TO 7000 FT, BELOW
 * 7000 FT : CAB ALT = ACFT ALT, BELOW 7000 FT : AVOID HI DES V/S "If the manual pressurization system is not available".
 * With the manual system available the crew uses the deferred procedure (AT TOP OF DESCENT: CABIN ALT MODE MAN, CABIN
 * ALT TRGT LDG ELEVN, l.135509-135513).
 * @param manualPressAvailable the manual pressurization system is available
 * @returns which of the 3 lines are shown
 */
export function ldgElevnFaultItemsToShow(manualPressAvailable: boolean): boolean[] {
  return [!manualPressAvailable, !manualPressAvailable, !manualPressAvailable];
}

/**
 * The emergency RAM air inlets are open: the RAM AIR pb is ON, and they "only open, if differential pressure is less
 * than one psi" (a380_fcom.txt l.5370-5375). Without a valid differential pressure, the pb alone.
 * @param ramAirPbOn the RAM AIR pb is ON
 * @param diffPressurePsi the cabin differential pressure, null without a valid value
 * @returns whether the RAM air inlets are open
 */
export function areRamAirInletsOpen(ramAirPbOn: boolean, diffPressurePsi: number | null): boolean {
  return ramAirPbOn && (diffPressurePsi === null || diffPressurePsi < RAM_AIR_INLETS_MAX_DIFF_PRESS_PSI);
}

/**
 * The RAM AIR memo (DSC-21-10-20 MEMO, a380_fcom.txt l.6055-6058): "The emergency RAM air inlets are open, and the
 * aircraft is on ground with no engine running", and "in all other cases". The FCOM text has no colours: as the other
 * two-case memos (ELEC EXT PWR, RAT OUT), the normal case is green and "all other cases" amber.
 * @param onGround the aircraft is on ground
 * @param anyEngineRunning at least one engine is running
 * @returns 0 for the green memo, 1 for the amber memo
 */
export function ramAirMemoIndex(onGround: boolean, anyEngineRunning: boolean): 0 | 1 {
  return onGround && !anyEngineRunning ? 0 : 1;
}
