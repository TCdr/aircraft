// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The pulsing and the colours of the cabin pressure indications on the CAB PRESS SD page (React SD), the CRUISE SD page
 * (SDv2) and the ECAM advisories (FwsAdvisories), A380 FCOM DSC-21-30-20 (a380_fcom.txt) and DSC-31-40-10 ADVISORY
 * (l.72284-72335). The FCOM gives different rules for the two pages: the CRUISE page waits 5 s before it pulses.
 * The values are the displayed ones: the cabin altitude and vertical speed rounded to 50 ft (ft/min).
 */

/** l.7590, l.72307: the cabin vertical speed pulses above 1 800 ft/min */
export const CABIN_VS_ADVISORY_FT_MIN = 1800;
/** l.7593, l.72311: and stops below 1 600 ft/min */
export const CABIN_VS_PULSE_STOP_FT_MIN = 1600;
/** l.7590, l.7593: the pulse rules stop at 6 350 ft/min, the end of the cabin vertical speed range (l.7737) */
export const CABIN_VS_RANGE_FT_MIN = 6350;

/** l.7543: the cabin altitude pulses above 8 300 ft */
export const CABIN_ALT_PULSE_START_FT = 8300;
/** l.7546: and stops below 8 100 ft */
export const CABIN_ALT_PULSE_STOP_FT = 8100;
/** l.7543, l.7548: from 9 550 ft the cabin altitude is red (CabinAltitudeIndication CABIN_ALTITUDE_ABNORMAL_FT) */
export const CABIN_ALT_RED_FT = 9550;

/** l.7516, l.7687: delta P pulses in final approach from 1.5 PSI */
export const DELTA_P_PULSE_START_PSI = 1.5;
/** l.7516, l.7691: and stops below 1 PSI */
export const DELTA_P_PULSE_STOP_PSI = 1;
/** l.7514, l.7684: the normal range of delta P, -0.2 PSI to 8.92 PSI */
export const DELTA_P_NORMAL_MIN_PSI = -0.2;
export const DELTA_P_NORMAL_MAX_PSI = 8.92;
/** l.7535-7536, l.7715-7717: delta P is red below -0.72 PSI or above 9.2 PSI */
export const DELTA_P_RED_MIN_PSI = -0.72;
export const DELTA_P_RED_MAX_PSI = 9.2;

/**
 * "Final approach" (l.7516, l.7688, l.7692) is FWC flight phase 9, at or below 800 ft in approach (FwsFlightPhases
 * FwcFlightPhase.AtOrBelow800Feet). Design choice: the FCOM does not define final approach for this rule.
 */
const FWC_FLIGHT_PHASE_FINAL_APPROACH = 9;

/** l.7731-7735: the CRUISE page V/S arrow shows outside -25 ft/min to 25 ft/min */
const CABIN_VS_ARROW_MIN_FT_MIN = 25;

/** l.7742-7745, l.7801-7802: the CRUISE page pulses after more than 5 s */
const CRUISE_PULSE_CONFIRMATION_S = 5;
/** l.7748: the CRUISE page V/S stops pulsing from -1 650 ft/min to 1 650 ft/min */
const CRUISE_CABIN_VS_PULSE_STOP_FT_MIN = 1650;

function displayedFtMin(cabinVsFtMin: number): number {
  return Math.abs(Math.round(cabinVsFtMin / 50) * 50);
}

/**
 * The CAB PRESS page cabin vertical speed (value and needle), l.7589-7593: "The cabin vertical speed needle pulses in
 * green, if: The cabin vertical speed is greater than 1 800 ft/min, and less than 6 350 ft/min. The needle stops
 * pulsing, if: The cabin vertical speed becomes less than 1 600 ft/min, and is greater than -6 350 ft/min."
 * Climbing or descending (the advisory, l.72306-72312, has the same rule).
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
 * The CAB PRESS page cabin altitude needle, l.7542-7546: "The cabin altitude needle pulses in green, if: The cabin
 * altitude is higher than 8 300 ft, and lower than 9 550 ft. The needle stops pulsing, if: The cabin altitude goes
 * below 8 100 ft." Above 9 550 ft it is red, not pulsing green.
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
 * Delta P on the CAB PRESS page (needle, l.7515-7516) and the CRUISE page (value, l.7686-7692): "The differential
 * pressure value pulses, when: The differential pressure is from 1.5 PSI to 8.92 PSI, and The aircraft is in final
 * approach. The differential pressure stops pulsing, when: The differential pressure goes below 1 PSI, or The aircraft
 * is no longer in final approach." Only the green value pulses (from 8.92 PSI it is amber, deltaPColour).
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
 * The colour of delta P, CAB PRESS page (l.7514, l.7520-7522, l.7535-7536) and CRUISE page (l.7684, l.7707-7717):
 * amber from -0.72 PSI to -0.2 PSI or from 8.92 PSI to 9.2 PSI, red below -0.72 PSI or above 9.2 PSI, green otherwise.
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
 * The CRUISE page cabin vertical speed arrow, l.7731-7735: "Points up, when the cabin vertical speed is greater than
 * 25 ft/min. Points down, when the cabin vertical speed is lower than -25 ft/min. Does not appear, when the cabin
 * vertical speed is from -25 ft/min to 25 ft/min."
 * @param cabinVsFtMin the cabin vertical speed, ft/min
 */
export function cabinVsArrowShown(cabinVsFtMin: number): boolean {
  return Math.abs(cabinVsFtMin) > CABIN_VS_ARROW_MIN_FT_MIN;
}

/**
 * The CRUISE page cabin vertical speed arrow and value, l.7739-7748: "pulse, if: The cabin vertical speed ranges from
 * -6 350 ft/min to -1 800 ft/min, and is lower, or equal to -1 600 ft/min for more than 5 s. The cabin vertical speed
 * ranges from 1 800 ft/min to 6 350 ft/min, and is greater, or equal to 1 600 ft/min for more than 5 s. The cabin
 * vertical speed needle stops pulsing, when it ranges from -1 650 ft/min to 1 650 ft/min."
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
 * The CRUISE page cabin altitude, l.7801-7802: "The CAB ALT indication pulses, if the cabin altitude value ranges from
 * 8 300 ft to 9 550 ft, for more than 5 s. The CAB ALT indication stops pulsing, when the cabin altitude is lower than
 * 8 100 ft." Above 9 550 ft it is red (l.7796-7797), not pulsing green.
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
