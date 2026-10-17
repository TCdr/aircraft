// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Two FUEL cautions that need a failure, both crew awareness (no procedure line) and amber:
 * - FUEL ENG 1(2) LP VALVE OPEN: the valve remains in the open position. Inhibited in phases 4, 5, 7 and 8. The valve
 *   and its position monitoring are simulated by the systems (fuel/engine_lp_valve.rs, flyPad failures 28007/28008
 *   "ENG 1(2) LP fuel valve jammed in place"): L:A32NX_FUEL_ENG_n_LP_VALVE_ABNORMALLY_OPEN is set once the valve is
 *   still open after its travel time while the ENG MASTER or the ENG FIRE pushbutton commands it closed.
 * - FUEL FQI CH 1(2) FAULT: an FQI channel is failed. Inhibited in phases 3, 4, 5, 7 and 8. From the flyPad failures
 *   28009/28010 (systems-host Fuel/FuelPumpsAndValves, L:A32NX_FUEL_FQI_CHANNEL_n_FAULT).
 */

export const ENG_LP_VALVE_OPEN_PHASE_INHIBITION = [4, 5, 7, 8];

export const FQI_CHANNEL_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

export interface FuelLpValveFqiInputs {
  /** Per engine 1, 2: the LP valve remains open while commanded closed (L:A32NX_FUEL_ENG_n_LP_VALVE_ABNORMALLY_OPEN) */
  lpValveAbnormallyOpen: readonly [boolean, boolean];
  /** Per FQI channel 1, 2: the channel is failed (L:A32NX_FUEL_FQI_CHANNEL_n_FAULT) */
  fqiChannelFailed: readonly [boolean, boolean];
}

export interface FuelLpValveFqiAlerts {
  /** FUEL ENG 1 LP VALVE OPEN, FUEL ENG 2 LP VALVE OPEN */
  engLpValveOpen: [boolean, boolean];
  /** FUEL FQI CH 1 FAULT, FUEL FQI CH 2 FAULT */
  fqiChannelFault: [boolean, boolean];
}

/** The FUEL ENG 1(2) LP VALVE OPEN and FUEL FQI CH 1(2) FAULT cautions */
export function fuelLpValveFqiAlerts(inputs: FuelLpValveFqiInputs): FuelLpValveFqiAlerts {
  return {
    engLpValveOpen: [inputs.lpValveAbnormallyOpen[0], inputs.lpValveAbnormallyOpen[1]],
    fqiChannelFault: [inputs.fqiChannelFailed[0], inputs.fqiChannelFailed[1]],
  };
}

/** Reads the inputs of fuelLpValveFqiAlerts from the systems */
export function readFuelLpValveFqiInputs(read: (name: string) => number): FuelLpValveFqiInputs {
  return {
    lpValveAbnormallyOpen: [
      read('L:A32NX_FUEL_ENG_1_LP_VALVE_ABNORMALLY_OPEN') > 0,
      read('L:A32NX_FUEL_ENG_2_LP_VALVE_ABNORMALLY_OPEN') > 0,
    ],
    fqiChannelFailed: [read('L:A32NX_FUEL_FQI_CHANNEL_1_FAULT') > 0, read('L:A32NX_FUEL_FQI_CHANNEL_2_FAULT') > 0],
  };
}
