// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  CABIN_BOTTLE_DISPATCH_MINIMUM_PRESSURE_PSI,
  cabinBottleLowPressurePsi,
  CKPT_BOTTLE_LOW_PRESSURE_PSI,
} from '@shared/OxygenBottlePressures';

/** What the DOOR/OXY page shows amber on the CKPT and CABIN oxygen lines */
export interface OxygenIndication {
  /** CKPT legend in amber */
  ckptAmber: boolean;
  /** REGUL PR LO under CKPT */
  ckptRegulPrLo: boolean;
  /** CABIN legend in amber */
  cabinAmber: boolean;
  /** REGUL PR LO under CABIN */
  cabinRegulPrLo: boolean;
}

/**
 * Oxygen indications of the SD DOOR/OXY page.
 * - A380 FCOM DSC-35-20-20 CKPT INDICATION: amber when "The oxygen system is off (the CREW SUPPLY pb-sw is OFF)".
 *   REGUL PR LO INDICATION: "Appears on ground, when: The oxygen CREW SUPPLY pb-sw is OFF, or [manifold pressure low]".
 * - A380 FCOM DSC-35-30-20 CABIN INDICATION: amber on a low pressure only; the cabin has no supply pb.
 * Manifold and bottle pressures are not simulated. Without SDAC data (active false) both lines show XX in amber.
 * @param active whether an SDAC supplies the data
 * @param onGround whether the aircraft is on ground
 * @param crewSupplyOff whether the CREW SUPPLY pb-sw is OFF (L:PUSH_OVHD_OXYGEN_CREW is 1 when OFF)
 * @returns the amber indications
 */
export function oxygenIndication(active: boolean, onGround: boolean, crewSupplyOff: boolean): OxygenIndication {
  return {
    ckptAmber: !active || crewSupplyOff,
    ckptRegulPrLo: !active || (onGround && crewSupplyOff),
    cabinAmber: !active,
    cabinRegulPrLo: !active,
  };
}

/**
 * The cockpit bottle pressure needed to dispatch with five flight crewmembers. Placeholder: the FCOM gives this minimum
 * only as a graph (LIM-35 MINIMUM FLIGHT CREW OXYGEN PRESSURE), not as a value.
 */
export const CKPT_BOTTLE_DISPATCH_MINIMUM_PRESSURE_PSI = 1000;

/** How the DOOR/OXY page shows the CKPT and CABIN oxygen pressure values */
export interface OxygenPressureIndication {
  /** CKPT pressure value in amber (low pressure) */
  ckptValueAmber: boolean;
  /** Amber half-frame around the CKPT pressure value (below the dispatch minimum, on ground) */
  ckptHalfFrame: boolean;
  /** CABIN pressure value in amber (low pressure) */
  cabinValueAmber: boolean;
  /** Amber half-frame around the CABIN pressure value (below the dispatch minimum, on ground) */
  cabinHalfFrame: boolean;
}

export interface OxygenPressureInputs {
  /** An SDAC supplies the data */
  active: boolean;
  onGround: boolean;
  /** At least one engine runs */
  oneEngineRunning: boolean;
  /** The FMS passenger number (L:A32NX_FMS_PAX_NUMBER) */
  fmsPassengers: number;
  ckptBottlePressurePsi: number;
  cabinBottlePressurePsi: number;
}

/**
 * The oxygen pressure values of the SD DOOR/OXY page.
 * - CKPT, A380 FCOM DSC-35-20-20 OXYGEN PRESSURE VALUE (a380_fcom.txt l.93096-93111): green at or above the 5-crew
 *   dispatch minimum; "On ground only, appears with the amber half-frame, if the pressure is below the minimum necessary
 *   to dispatch the aircraft with five flight crewmembers" (l.93101-93102); amber when "the pressure is below 350 PSI"
 *   (l.93108-93109).
 * - CABIN, A380 FCOM DSC-35-30-20 OXYGEN PRESSURE VALUE (l.93477-93511): green at or above 1 600 PSI; "On ground only,
 *   appears with the amber half-frame, if: The pressure is below 1 600 PSI" (l.93480-93481); amber below the emergency
 *   descent minimum for the real number of cabin occupants (FMS passengers), or below 800 PSI before one engine starts
 *   (l.93494-93509).
 */
export function oxygenPressureIndication(inputs: OxygenPressureInputs): OxygenPressureIndication {
  const ckptValueAmber = !inputs.active || inputs.ckptBottlePressurePsi < CKPT_BOTTLE_LOW_PRESSURE_PSI;
  const cabinValueAmber =
    !inputs.active ||
    inputs.cabinBottlePressurePsi < cabinBottleLowPressurePsi(inputs.oneEngineRunning, inputs.fmsPassengers);
  return {
    ckptValueAmber,
    ckptHalfFrame:
      inputs.active && inputs.onGround && inputs.ckptBottlePressurePsi < CKPT_BOTTLE_DISPATCH_MINIMUM_PRESSURE_PSI,
    cabinValueAmber,
    cabinHalfFrame:
      inputs.active && inputs.onGround && inputs.cabinBottlePressurePsi < CABIN_BOTTLE_DISPATCH_MINIMUM_PRESSURE_PSI,
  };
}
