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

/** The state of the cabin oxygen system (a380_systems oxygen.rs) */
interface CabinOxygenState {
  /** The cabin bottle pressure is low (the amber pressure value, oxygenPressureIndication cabinValueAmber) */
  bottlePressureLow: boolean;
  /** The cabin bottle pressure, PSI */
  bottlePressurePsi: number;
  /** A regulator supply valve is closed (L:A32NX_OXYGEN_CABIN_VALVE_CLOSED, OXY CABIN VLV CLOSED) */
  valveClosed: boolean;
}

/** Below this the distribution manifold oxygen pressure is low */
const CABIN_MANIFOLD_LOW_PRESSURE_PSI = 98;

const NORMAL_CABIN_OXYGEN: CabinOxygenState = { bottlePressureLow: false, bottlePressurePsi: 1850, valveClosed: false };

/**
 * Oxygen indications of the SD DOOR/OXY page.
 * - CKPT: amber when the oxygen system is off (the CREW SUPPLY pb-sw is OFF). REGUL PR LO appears on ground when the
 *   CREW SUPPLY pb-sw is OFF or the manifold pressure is low.
 * - CABIN: amber when the oxygen system has low pressure (REGUL PR LO on ground for a low distribution manifold
 *   pressure, the pressure value amber for low bottle pressure), or when at least one engine-burst area shutoff
 *   valve or regulator supply valve is closed (OXY CABIN VLV CLOSED). REGUL PR LO appears on ground when the
 *   distribution manifold pressure is below 98 PSI. The cabin has no supply pb.
 * The distribution manifold is not simulated. Design choice: its pressure cannot be above the bottle pressure, so it is
 * low when the bottles are below 98 PSI; one closed regulator supply valve does not depressurize it (the other
 * regulators still supply it). Without SDAC data (active false) both lines show XX in amber.
 * @param active whether an SDAC supplies the data
 * @param onGround whether the aircraft is on ground
 * @param crewSupplyOff whether the CREW SUPPLY pb-sw is OFF (L:PUSH_OVHD_OXYGEN_CREW is 1 when OFF)
 * @param cabin the state of the cabin oxygen system
 * @returns the amber indications
 */
export function oxygenIndication(
  active: boolean,
  onGround: boolean,
  crewSupplyOff: boolean,
  cabin: CabinOxygenState = NORMAL_CABIN_OXYGEN,
): OxygenIndication {
  const cabinManifoldLow = cabin.bottlePressurePsi < CABIN_MANIFOLD_LOW_PRESSURE_PSI;
  return {
    ckptAmber: !active || crewSupplyOff,
    ckptRegulPrLo: !active || (onGround && crewSupplyOff),
    cabinAmber: !active || cabin.bottlePressureLow || cabinManifoldLow || cabin.valveClosed,
    cabinRegulPrLo: !active || (onGround && cabinManifoldLow),
  };
}

/**
 * The cockpit bottle pressure needed to dispatch with five flight crewmembers. Placeholder: the source gives this
 * minimum only as a graph of the minimum flight crew oxygen pressure, not as a value.
 */
const CKPT_BOTTLE_DISPATCH_MINIMUM_PRESSURE_PSI = 1000;

/** How the DOOR/OXY page shows the CKPT and CABIN oxygen pressure values */
interface OxygenPressureIndication {
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
 * - CKPT: green at or above the 5-crew dispatch minimum; on ground only, with the amber half-frame below the minimum
 *   needed to dispatch with five flight crewmembers; amber below 350 PSI.
 * - CABIN: green at or above 1 600 PSI; on ground only, with the amber half-frame below 1 600 PSI; amber below the
 *   emergency descent minimum for the real number of cabin occupants (FMS passengers), or below 800 PSI before one
 *   engine starts.
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
