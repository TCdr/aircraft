// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

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
