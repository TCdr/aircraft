// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Indications of the SD DOOR/OXY page.
 * - Doors, A320 FCOM DSC-52-20 DOOR/OXY SD page (a320_fcom.txt l.61436-61440): door symbol "Green: The door is closed
 *   and locked. Amber: The door is not locked."; door indication (CABIN, EMER EXIT, CARGO) "appears in amber, when the
 *   door is not locked".
 * - Crew oxygen, A320 FCOM DSC-35-20-20 (l.56814-56818): OXY pressure "in green, when the pressure is >= 600 PSI",
 *   "pulses in green, when the pressure is < 600 PSI", "in amber, when the pressure is < 300 PSI"; "On ground, an amber
 *   half frame appears when oxygen pressure is < 1 000 PSI".
 * - Cabin V/S, A320 FCOM DSC-21-20-40 ECAM DOOR/OXY page (l.9180-9186): "This number only appears during flight phases
 *   5, 6 and 7"; "It pulses, when the V/S is greater than 1 750 ft/min and stops pulsing, when less than 1 650 ft/min";
 *   "It becomes amber, when the V/S is greater than 2 000 ft/min, or less than -2 000 ft/min".
 * The values compared are the displayed ones (rounded to 50 PSI, 50 ft/min), so that the colour matches the digits.
 */

/** Crew oxygen pressure below which the value pulses, PSI */
const CREW_OXYGEN_PULSE_PSI = 600;
/** Crew oxygen pressure below which the value is amber, PSI */
const CREW_OXYGEN_AMBER_PSI = 300;
/** Crew oxygen pressure below which the amber half frame appears on ground, PSI */
const CREW_OXYGEN_GROUND_HALF_FRAME_PSI = 1000;

/** Cabin vertical speed beyond which the DOOR/OXY page value is amber (climb or descent), ft/min */
const CABIN_VS_AMBER_FT_MIN = 2000;
/** The FWC flight phases in which the DOOR/OXY page shows the cabin V/S */
const CABIN_VS_FLIGHT_PHASES = [5, 6, 7];

/**
 * Whether a cabin door or emergency exit is not locked: its MSFS interactive point is open at all. The same rule as the
 * DOOR cautions (systems-host FWC/Logic/DoorAlerts.ts isInteractivePointNotClosed), so that the page and the caution
 * agree.
 * @param openPercent the opening of the interactive point, percent
 * @returns true when the door symbol and its indication are amber
 */
export function isDoorNotLocked(openPercent: number): boolean {
  return openPercent > 0;
}

export interface CrewOxygenIndication {
  /** CSS class of the PSI value: 'Value' (green), 'ValuePulse' (pulsing green) or 'ValueAmber' */
  readonly valueClass: 'Value' | 'ValuePulse' | 'ValueAmber';
  /** The amber half frame around the value */
  readonly halfFrame: boolean;
}

/**
 * The crew oxygen bottle pressure indication of the DOOR/OXY page.
 * @param displayedPressurePsi the displayed pressure (rounded to 50 PSI)
 * @param onGround the aircraft is on ground
 * @returns the value colour and the half frame
 */
export function crewOxygenIndication(displayedPressurePsi: number, onGround: boolean): CrewOxygenIndication {
  let valueClass: CrewOxygenIndication['valueClass'] = 'Value';
  if (displayedPressurePsi < CREW_OXYGEN_AMBER_PSI) {
    valueClass = 'ValueAmber';
  } else if (displayedPressurePsi < CREW_OXYGEN_PULSE_PSI) {
    valueClass = 'ValuePulse';
  }
  return { valueClass, halfFrame: onGround && displayedPressurePsi < CREW_OXYGEN_GROUND_HALF_FRAME_PSI };
}

/**
 * Low-pressure circuit pressure below which REGUL LO PR appears, PSI: "It is in amber, if oxygen pressure on the
 * low-pressure circuit is low (50 PSI)" (A320 FCOM DSC-35-20-20, a320_fcom.txt l.56822-56823)
 */
const CREW_OXYGEN_LOW_CIRCUIT_PRESSURE_PSI = 50;

export interface CrewOxygenCircuitIndication {
  /** REGUL LO PR in amber below CKPT OXY */
  readonly regulatorLowPressure: boolean;
  /** The CKPT OXY legend in amber (white otherwise) */
  readonly ckptOxyAmber: boolean;
}

/**
 * The CKPT OXY legend and the REGUL LO PR indication of the DOOR/OXY page, A320 FCOM DSC-35-20-20
 * (a320_fcom.txt l.56822-56831):
 * - REGUL LO PR: "It is in amber, if oxygen pressure on the low-pressure circuit is low (50 PSI)".
 * - CKPT OXY: "It is normally in white. It becomes amber, when: Pressure goes below 300 PSI, Low oxygen pressure is
 *   detected, The OXYGEN CREW SUPPLY pb on the overhead panel is OFF."
 * The low-pressure circuit (downstream of the bottle regulator and of the supply valve) is not simulated: it has no
 * pressure when the CREW SUPPLY pb-sw is OFF (supply valve closed), or when the bottle itself is below 50 PSI (the
 * regulator cannot deliver more than its inlet pressure).
 * @param displayedBottlePressurePsi the displayed bottle pressure (rounded to 50 PSI), as the PSI value colour
 * @param crewSupplyOff the CREW SUPPLY pb-sw is OFF (L:PUSH_OVHD_OXYGEN_CREW is 1 when OFF)
 */
export function crewOxygenCircuitIndication(
  displayedBottlePressurePsi: number,
  crewSupplyOff: boolean,
): CrewOxygenCircuitIndication {
  const regulatorLowPressure = crewSupplyOff || displayedBottlePressurePsi < CREW_OXYGEN_LOW_CIRCUIT_PRESSURE_PSI;
  return {
    regulatorLowPressure,
    ckptOxyAmber: displayedBottlePressurePsi < CREW_OXYGEN_AMBER_PSI || regulatorLowPressure || crewSupplyOff,
  };
}

/**
 * Whether the DOOR/OXY page shows the cabin V/S
 * @param fwcFlightPhase the FWC flight phase (L:A32NX_FWC_FLIGHT_PHASE)
 * @returns true in flight phases 5, 6 and 7
 */
export function isCabinVsShown(fwcFlightPhase: number): boolean {
  return CABIN_VS_FLIGHT_PHASES.indexOf(fwcFlightPhase) !== -1;
}

/**
 * CSS class of the cabin V/S value: amber beyond +-2000 ft/min, pulsing green while it pulses (the CAB
 * PRESS page rule, PressIndications cabinVsPulses), green otherwise.
 * @param displayedCabinVsFtMin the displayed cabin vertical speed, ft/min
 * @param pulsing whether the value pulses
 * @returns the class
 */
export function doorPageCabinVsClass(
  displayedCabinVsFtMin: number,
  pulsing: boolean,
): 'Value' | 'ValuePulse' | 'ValueAmber' {
  if (Math.abs(displayedCabinVsFtMin) > CABIN_VS_AMBER_FT_MIN) {
    return 'ValueAmber';
  }
  return pulsing ? 'ValuePulse' : 'Value';
}
