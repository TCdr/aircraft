// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The fuel jettison state the FQMS (CpiomF/FuelJettison) publishes for the FWS */
export interface FuelJettisonFlags {
  inProgress: boolean;
  completed: boolean;
  armPbOn: boolean;
  activePbOn: boolean;
  notAvailable: boolean;
  leftValveFault: boolean;
  rightValveFault: boolean;
  valveNotClosed: boolean;
}

/**
 * Reads the fuel jettison L:vars with `read` (SimVar.GetSimVarValue(name, Bool) in the sim) as real booleans.
 * GetSimVarValue returns the NUMBER 1 for a Bool, and the FWS combines some of these flags with
 * SubscribableMapFunctions.or(), which only counts `true` (input.includes(true)): with numbers, FUEL JETTISON FAULT and
 * its STATUS INOP SYS JETTISON never came on.
 */
export function readFuelJettisonFlags(read: (name: string) => number): FuelJettisonFlags {
  const isOn = (name: string): boolean => read(name) > 0;
  return {
    inProgress: isOn('L:A380X_FUEL_JETTISON_IN_PROGRESS'),
    completed: isOn('L:A380X_FUEL_JETTISON_COMPLETED'),
    armPbOn: isOn('L:A380X_OVHD_FUEL_JETTISON_ARM_PB_IS_ON'),
    activePbOn: isOn('L:A380X_OVHD_FUEL_JETTISON_ACTIVE_PB_IS_ON'),
    notAvailable: isOn('L:A380X_FUEL_JETTISON_NOT_AVAIL'),
    leftValveFault: isOn('L:A380X_FUEL_JETTISON_L_VALVE_FAULT'),
    rightValveFault: isOn('L:A380X_FUEL_JETTISON_R_VALVE_FAULT'),
    valveNotClosed: isOn('L:A380X_FUEL_JETTISON_VALVE_NOT_CLOSED'),
  };
}
