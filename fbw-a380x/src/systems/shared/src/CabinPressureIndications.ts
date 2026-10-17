// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The pulsing and the colours of the cabin pressure indications on the CAB PRESS SD page (React SD), the CRUISE SD page
 * (SDv2) and the ECAM advisories (FwsAdvisories). The two pages have different rules: the CRUISE page waits 5 s
 * before it pulses.
 * The values are the displayed ones: the cabin altitude and vertical speed rounded to 50 ft (ft/min).
 */

/** The cabin vertical speed pulses above this value (also the advisory threshold) */
const CABIN_VS_ADVISORY_FT_MIN = 1800;
const CABIN_VS_PULSE_STOP_FT_MIN = 1600;
/** The pulse rules stop at the end of the cabin vertical speed range */
const CABIN_VS_RANGE_FT_MIN = 6350;

const CABIN_ALT_PULSE_START_FT = 8300;
const CABIN_ALT_PULSE_STOP_FT = 8100;
/** From here the cabin altitude is red (CabinAltitudeIndication CABIN_ALTITUDE_ABNORMAL_FT) */
const CABIN_ALT_RED_FT = 9550;

/** Delta P pulses in final approach from this value */
const DELTA_P_PULSE_START_PSI = 1.5;
const DELTA_P_PULSE_STOP_PSI = 1;
const DELTA_P_NORMAL_MIN_PSI = -0.2;
const DELTA_P_NORMAL_MAX_PSI = 8.92;
const DELTA_P_RED_MIN_PSI = -0.72;
const DELTA_P_RED_MAX_PSI = 9.2;

/**
 * Design choice: "final approach" (not defined for this rule) is FWC flight phase 9, at or below 800 ft in approach
 * (FwsFlightPhases FwcFlightPhase.AtOrBelow800Feet).
 */
const FWC_FLIGHT_PHASE_FINAL_APPROACH = 9;

/** The CRUISE page V/S arrow shows outside -25 ft/min to 25 ft/min */
const CABIN_VS_ARROW_MIN_FT_MIN = 25;

/** The CRUISE page pulses only after the condition held for more than 5 s */
const CRUISE_PULSE_CONFIRMATION_S = 5;
/** The CRUISE page V/S stops pulsing from -1 650 ft/min to 1 650 ft/min */
const CRUISE_CABIN_VS_PULSE_STOP_FT_MIN = 1650;

function displayedFtMin(cabinVsFtMin: number): number {
  return Math.abs(Math.round(cabinVsFtMin / 50) * 50);
}

/**
 * The CAB PRESS page cabin vertical speed (value and needle) pulses green from above 1 800 ft/min to below
 * 6 350 ft/min and stops below 1 600 ft/min, climbing or descending (the advisory has the same rule).
 * @param cabinVsFtMin the cabin vertical speed, ft/min
 * @param wasPulsing whether it pulsed at the previous update (false for the ECAM advisory, which has no state)
 */
export function cabinVsPulses(cabinVsFtMin: number, wasPulsing = false): boolean {
  const vs = displayedFtMin(cabinVsFtMin);
  if (vs >= CABIN_VS_RANGE_FT_MIN) {
    return false;
  }
  return wasPulsing ? vs >= CABIN_VS_PULSE_STOP_FT_MIN : vs > CABIN_VS_ADVISORY_FT_MIN;
}

/**
 * The CAB PRESS page cabin altitude needle pulses green from above 8 300 ft to below 9 550 ft and stops below
 * 8 100 ft. Above 9 550 ft it is red, not pulsing green.
 * @param cabinAltitudeFt the displayed cabin altitude, ft
 * @param wasPulsing whether it pulsed at the previous update
 */
export function cabinAltitudePulses(cabinAltitudeFt: number, wasPulsing: boolean): boolean {
  if (cabinAltitudeFt >= CABIN_ALT_RED_FT) {
    return false;
  }
  return wasPulsing ? cabinAltitudeFt >= CABIN_ALT_PULSE_STOP_FT : cabinAltitudeFt > CABIN_ALT_PULSE_START_FT;
}

/**
 * Delta P on the CAB PRESS page (needle) and the CRUISE page (value) pulses in final approach from 1.5 PSI to
 * 8.92 PSI, and stops below 1 PSI or out of final approach. Only the green value pulses (from 8.92 PSI it is amber,
 * deltaPColour).
 * @param deltaPsi the cabin differential pressure, PSI
 * @param fwcFlightPhase L:A32NX_FWC_FLIGHT_PHASE
 * @param wasPulsing whether it pulsed at the previous update
 */
export function deltaPPulses(deltaPsi: number, fwcFlightPhase: number, wasPulsing: boolean): boolean {
  if (fwcFlightPhase !== FWC_FLIGHT_PHASE_FINAL_APPROACH || deltaPColour(deltaPsi) !== 'Green') {
    return false;
  }
  return deltaPsi >= (wasPulsing ? DELTA_P_PULSE_STOP_PSI : DELTA_P_PULSE_START_PSI);
}

/**
 * The colour of delta P on the CAB PRESS and CRUISE pages: amber from -0.72 PSI to -0.2 PSI or from 8.92 PSI to
 * 9.2 PSI, red below -0.72 PSI or above 9.2 PSI, green otherwise.
 * @param deltaPsi the cabin differential pressure, PSI
 */
export function deltaPColour(deltaPsi: number): 'Green' | 'Amber' | 'Red' {
  if (deltaPsi < DELTA_P_RED_MIN_PSI || deltaPsi > DELTA_P_RED_MAX_PSI) {
    return 'Red';
  }
  if (deltaPsi <= DELTA_P_NORMAL_MIN_PSI || deltaPsi >= DELTA_P_NORMAL_MAX_PSI) {
    return 'Amber';
  }
  return 'Green';
}

/**
 * The CRUISE page cabin vertical speed arrow points up above 25 ft/min, down below -25 ft/min, and is hidden between.
 * @param cabinVsFtMin the cabin vertical speed, ft/min
 */
export function cabinVsArrowShown(cabinVsFtMin: number): boolean {
  return Math.abs(cabinVsFtMin) > CABIN_VS_ARROW_MIN_FT_MIN;
}

/**
 * The CRUISE page cabin vertical speed arrow and value pulse when the magnitude is from 1 800 ft/min to 6 350 ft/min
 * and has stayed at or above 1 600 ft/min for more than 5 s; they stop from -1 650 ft/min to 1 650 ft/min.
 */
export class CruiseCabinVsPulse {
  private aboveConfirmationS = 0;

  private pulsing = false;

  /**
   * @param deltaS the time since the last update, s
   * @param cabinVsFtMin the cabin vertical speed, ft/min
   * @returns whether the value and the arrow pulse
   */
  public update(deltaS: number, cabinVsFtMin: number): boolean {
    const vs = displayedFtMin(cabinVsFtMin);
    this.aboveConfirmationS = vs >= CABIN_VS_PULSE_STOP_FT_MIN ? this.aboveConfirmationS + deltaS : 0;
    if (this.pulsing) {
      this.pulsing = vs >= CRUISE_CABIN_VS_PULSE_STOP_FT_MIN && vs <= CABIN_VS_RANGE_FT_MIN;
    } else {
      this.pulsing =
        vs >= CABIN_VS_ADVISORY_FT_MIN &&
        vs <= CABIN_VS_RANGE_FT_MIN &&
        this.aboveConfirmationS > CRUISE_PULSE_CONFIRMATION_S;
    }
    return this.pulsing;
  }
}

/**
 * The CRUISE page cabin altitude pulses after more than 5 s from 8 300 ft to 9 550 ft and stops below 8 100 ft.
 * Above 9 550 ft it is red, not pulsing green.
 */
export class CruiseCabinAltitudePulse {
  private inRangeS = 0;

  private pulsing = false;

  /**
   * @param deltaS the time since the last update, s
   * @param cabinAltitudeFt the displayed cabin altitude, ft
   * @returns whether the value pulses
   */
  public update(deltaS: number, cabinAltitudeFt: number): boolean {
    const inRange = cabinAltitudeFt >= CABIN_ALT_PULSE_START_FT && cabinAltitudeFt <= CABIN_ALT_RED_FT;
    this.inRangeS = inRange ? this.inRangeS + deltaS : 0;
    if (cabinAltitudeFt > CABIN_ALT_RED_FT || cabinAltitudeFt < CABIN_ALT_PULSE_STOP_FT) {
      this.pulsing = false;
    } else if (this.inRangeS > CRUISE_PULSE_CONFIRMATION_S) {
      this.pulsing = true;
    }
    return this.pulsing;
  }
}
